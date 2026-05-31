import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  archiveDailyPath,
  dailyPath,
  formatDate,
  formatTime,
  type MemoryPaths,
  memoryPaths,
  MEMORY_SECTIONS,
  type MemorySection,
  monthlyPath,
  weeklyPath,
} from "./paths.js";
import { scanAndRedactSecrets } from "./secret-scan.js";

export type MemoryManifest = {
  lastFlushAt?: string;
  lastRollupWeekly?: string;
  lastRollupMonthly?: string;
  turnCount: number;
  lastFlushTurnCount: number;
};

const DEFAULT_MANIFEST: MemoryManifest = {
  turnCount: 0,
  lastFlushTurnCount: 0,
};

const MAX_MEMORY_MD_LENGTH = 32_000;
const MAX_DAILY_LENGTH = 256_000;

export class MemoryStore {
  readonly paths: MemoryPaths;

  constructor(private readonly workspaceDir: string) {
    this.paths = memoryPaths(workspaceDir);
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.paths.dailyDir, { recursive: true });
    await mkdir(this.paths.weeklyDir, { recursive: true });
    await mkdir(this.paths.monthlyDir, { recursive: true });
    await mkdir(this.paths.archiveDailyDir, { recursive: true });
  }

  async readManifest(): Promise<MemoryManifest> {
    try {
      const raw = await readFile(this.paths.manifestPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<MemoryManifest>;
      return { ...DEFAULT_MANIFEST, ...parsed };
    } catch {
      return { ...DEFAULT_MANIFEST };
    }
  }

  async writeManifest(manifest: MemoryManifest): Promise<void> {
    await this.ensureDirs();
    await writeFile(
      this.paths.manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf-8",
    );
  }

  async readMemoryMd(): Promise<string> {
    try {
      return await readFile(this.paths.memoryMdPath, "utf-8");
    } catch {
      return "";
    }
  }

  async writeMemoryMd(content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new Error("MEMORY.md content must not be empty");
    }
    if (trimmed.length > MAX_MEMORY_MD_LENGTH) {
      throw new Error(
        `MEMORY.md exceeds maximum length (${MAX_MEMORY_MD_LENGTH})`,
      );
    }
    await this.ensureDirs();
    await writeFile(this.paths.memoryMdPath, `${trimmed}\n`, "utf-8");
  }

  async mergeMemoryMd(additions: string): Promise<void> {
    const existing = (await this.readMemoryMd()).trim();
    const scanned = scanAndRedactSecrets(additions.trim());
    const merged = existing.length > 0 ? `${existing}\n\n${scanned.text}` : scanned.text;
    await this.writeMemoryMd(merged);
  }

  async readDaily(date: string): Promise<string> {
    try {
      return await readFile(dailyPath(this.paths, date), "utf-8");
    } catch {
      return "";
    }
  }

  async appendDaily(
    section: MemorySection,
    content: string,
    date: string = formatDate(),
  ): Promise<{ redacted: boolean }> {
    if (!MEMORY_SECTIONS.includes(section)) {
      throw new Error(`invalid memory section: ${section}`);
    }
    const scanned = scanAndRedactSecrets(content.trim());
    if (scanned.text.length === 0) {
      throw new Error("memory entry must not be empty after redaction");
    }

    await this.ensureDirs();
    const filePath = dailyPath(this.paths, date);
    let body = "";
    try {
      body = await readFile(filePath, "utf-8");
    } catch {
      body = `# ${date}\n`;
    }

    const timestamp = formatTime();
    const bullet = `- [${timestamp}] ${scanned.text}`;
    const sectionHeader = `## ${section}`;

    if (body.includes(sectionHeader)) {
      const lines = body.split("\n");
      const idx = lines.findIndex((l) => l.trim() === sectionHeader);
      let insertAt = idx + 1;
      while (insertAt < lines.length && !lines[insertAt]?.startsWith("## ")) {
        insertAt += 1;
      }
      lines.splice(insertAt, 0, bullet);
      body = lines.join("\n");
    } else {
      body = `${body.trimEnd()}\n\n${sectionHeader}\n${bullet}\n`;
    }

    if (body.length > MAX_DAILY_LENGTH) {
      throw new Error(`daily memory file exceeds maximum length (${MAX_DAILY_LENGTH})`);
    }

    await writeFile(filePath, body.endsWith("\n") ? body : `${body}\n`, "utf-8");
    return { redacted: scanned.redacted };
  }

  async listDailyFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.paths.dailyDir);
      return files
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""))
        .sort();
    } catch {
      return [];
    }
  }

  async listWeeklyFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.paths.weeklyDir);
      return files
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""))
        .sort();
    } catch {
      return [];
    }
  }

  async writeRollup(
    kind: "weekly" | "monthly",
    period: string,
    content: string,
  ): Promise<void> {
    await this.ensureDirs();
    const filePath =
      kind === "weekly"
        ? weeklyPath(this.paths, period)
        : monthlyPath(this.paths, period);
    const scanned = scanAndRedactSecrets(content.trim());
    await writeFile(filePath, `${scanned.text}\n`, "utf-8");
  }

  async readRollup(kind: "weekly" | "monthly", period: string): Promise<string> {
    const filePath =
      kind === "weekly"
        ? weeklyPath(this.paths, period)
        : monthlyPath(this.paths, period);
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  async archiveDaily(date: string): Promise<void> {
    const src = dailyPath(this.paths, date);
    const dest = archiveDailyPath(this.paths, date);
    try {
      await access(src);
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(src, dest);
    } catch {
      // source may not exist
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Collect all markdown memory files for indexing. */
  async listAllMarkdownFiles(): Promise<string[]> {
    const results: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.name.endsWith(".md")) {
            results.push(full);
          }
        }
      } catch {
        // dir may not exist
      }
    };
    await walk(this.paths.memoryDir);
    return results.sort();
  }
}
