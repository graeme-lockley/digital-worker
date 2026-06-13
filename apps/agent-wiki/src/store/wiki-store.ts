import { cp, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WikiPage, WikiPageSummary } from "@digital-worker/agent-wiki-protocol";

import {
  parseFrontMatter,
  serializePage,
  type WikiFrontMatter,
} from "./front-matter.js";
import {
  isValidSlug,
  relativePathToSlug,
  slugToRelativePath,
} from "./slug.js";

export type WikiStorePaths = {
  dataDir: string;
  pagesDir: string;
  indexDbPath: string;
};

export function wikiStorePaths(dataDir: string): WikiStorePaths {
  const resolved = path.resolve(dataDir);
  return {
    dataDir: resolved,
    pagesDir: path.join(resolved, "pages"),
    indexDbPath: path.join(resolved, "index.db"),
  };
}

export type PutPageInput = {
  title?: string;
  body: string;
  updatedBy: string;
  ifRevision?: number;
};

export type DeletePageInput = {
  deletedBy: string;
  ifRevision?: number;
};

export class WikiStore {
  readonly paths: WikiStorePaths;

  constructor(dataDir: string) {
    this.paths = wikiStorePaths(dataDir);
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.paths.pagesDir, { recursive: true });
  }

  async seedIfEmpty(seedDir: string): Promise<boolean> {
    await this.ensureDirs();
    const entries = await readdir(this.paths.pagesDir).catch(() => [] as string[]);
    if (entries.length > 0) {
      return false;
    }
    const resolvedSeed = path.resolve(seedDir, "pages");
    await cp(resolvedSeed, this.paths.pagesDir, { recursive: true });
    return true;
  }

  async listPages(): Promise<WikiPageSummary[]> {
    const files = await this.listAllMarkdownFiles();
    const pages: WikiPageSummary[] = [];
    for (const filePath of files) {
      const page = await this.readPageFile(filePath);
      if (page) {
        pages.push({
          slug: page.slug,
          title: page.title,
          updatedBy: page.updatedBy,
          updatedAt: page.updatedAt,
          revision: page.revision,
        });
      }
    }
    pages.sort((a, b) => a.slug.localeCompare(b.slug));
    return pages;
  }

  async getPage(slug: string): Promise<WikiPage | null> {
    if (!isValidSlug(slug)) {
      return null;
    }
    const filePath = this.slugToAbsolutePath(slug);
    return this.readPageFile(filePath, slug);
  }

  async putPage(slug: string, input: PutPageInput): Promise<WikiPage> {
    if (!isValidSlug(slug)) {
      throw new WikiStoreError("INVALID_SLUG", `invalid slug: ${slug}`);
    }

    const updatedBy = input.updatedBy.trim();
    if (!updatedBy) {
      throw new WikiStoreError("INVALID_REQUEST", "updatedBy is required");
    }

    const body = input.body;
    const filePath = this.slugToAbsolutePath(slug);
    const existing = await this.readPageFile(filePath, slug);

    if (
      input.ifRevision !== undefined &&
      (existing?.revision ?? 0) !== input.ifRevision
    ) {
      throw new WikiStoreError(
        "CONFLICT",
        `revision mismatch: expected ${input.ifRevision}, current ${existing?.revision ?? 0}`,
      );
    }

    const title =
      input.title?.trim() ||
      existing?.title ||
      slugToTitle(slug);
    const revision = (existing?.revision ?? 0) + 1;
    const frontMatter: WikiFrontMatter = {
      title,
      updatedBy,
      updatedAt: new Date().toISOString(),
      revision,
    };

    const content = serializePage(frontMatter, body);
    await this.atomicWrite(filePath, content);

    return {
      slug,
      title,
      body,
      updatedBy,
      updatedAt: frontMatter.updatedAt,
      revision,
    };
  }

  async deletePage(slug: string, input: DeletePageInput): Promise<void> {
    if (!isValidSlug(slug)) {
      throw new WikiStoreError("INVALID_SLUG", `invalid slug: ${slug}`);
    }

    const deletedBy = input.deletedBy.trim();
    if (!deletedBy) {
      throw new WikiStoreError("INVALID_REQUEST", "deletedBy is required");
    }

    const filePath = this.slugToAbsolutePath(slug);
    const existing = await this.readPageFile(filePath, slug);
    if (!existing) {
      throw new WikiStoreError("NOT_FOUND", `page not found: ${slug}`);
    }

    if (
      input.ifRevision !== undefined &&
      existing.revision !== input.ifRevision
    ) {
      throw new WikiStoreError(
        "CONFLICT",
        `revision mismatch: expected ${input.ifRevision}, current ${existing.revision}`,
      );
    }

    try {
      await unlink(filePath);
    } catch {
      throw new WikiStoreError("NOT_FOUND", `page not found: ${slug}`);
    }
  }

  async listAllMarkdownFiles(): Promise<string[]> {
    return this.walkMarkdownFiles(this.paths.pagesDir);
  }

  private slugToAbsolutePath(slug: string): string {
    const relative = slugToRelativePath(slug);
    const absolute = path.resolve(this.paths.pagesDir, relative);
    const pagesRoot = path.resolve(this.paths.pagesDir);
    if (!absolute.startsWith(`${pagesRoot}${path.sep}`) && absolute !== pagesRoot) {
      throw new WikiStoreError("INVALID_SLUG", `invalid slug path: ${slug}`);
    }
    return absolute;
  }

  private async readPageFile(
    filePath: string,
    slugOverride?: string,
  ): Promise<WikiPage | null> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      return null;
    }

    const relative = path.relative(this.paths.pagesDir, filePath);
    const slug = slugOverride ?? relativePathToSlug(relative);
    if (!slug) {
      return null;
    }

    const { frontMatter, body } = parseFrontMatter(raw);
    if (!frontMatter) {
      return {
        slug,
        title: slugToTitle(slug),
        body: raw,
        updatedBy: "unknown",
        updatedAt: new Date(0).toISOString(),
        revision: 0,
      };
    }

    return {
      slug,
      title: frontMatter.title,
      body,
      updatedBy: frontMatter.updatedBy,
      updatedAt: frontMatter.updatedAt,
      revision: frontMatter.revision,
    };
  }

  private async walkMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.walkMarkdownFiles(fullPath)));
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, filePath);
  }
}

export class WikiStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WikiStoreError";
  }
}

function slugToTitle(slug: string): string {
  const base = slug.split("/").pop() ?? slug;
  if (base.startsWith("_")) {
    return base.slice(1);
  }
  return base
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
