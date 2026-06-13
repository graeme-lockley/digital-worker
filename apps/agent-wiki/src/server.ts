import { serve } from "@hono/node-server";
import { Hono } from "hono";

import {
  WIKI_ERROR_CODES,
  WIKI_PATHS,
  type DeletePageRequest,
  type DeletePageResponse,
  type GetPageResponse,
  type ListPagesResponse,
  type PutPageRequest,
  type PutPageResponse,
  type ReindexResponse,
  type SearchPagesResponse,
} from "@digital-worker/agent-wiki-protocol";

import { registerStaticRoutes } from "./static.js";
import type { WikiIndex } from "./store/wiki-index.js";
import { WikiStoreError, type WikiStore } from "./store/wiki-store.js";
import { isValidSlug } from "./store/slug.js";

export type WikiContext = {
  store: WikiStore;
  index: WikiIndex;
};

export function createApp(ctx: WikiContext): Hono {
  const app = new Hono();

  registerStaticRoutes(app);

  app.get(WIKI_PATHS.health, (c) => c.json({ status: "ok" }));

  app.get(WIKI_PATHS.pages, async (c) => {
    const pages = await ctx.store.listPages();
    const body: ListPagesResponse = { pages };
    return c.json(body);
  });

  app.get(`${WIKI_PATHS.pages}/*`, async (c) => {
    const slug = extractSlug(c.req.path);
    if (!slug) {
      return apiError(c, WIKI_ERROR_CODES.INVALID_SLUG, "missing slug", 400);
    }
    if (!isValidSlug(slug)) {
      return apiError(c, WIKI_ERROR_CODES.INVALID_SLUG, `invalid slug: ${slug}`, 400);
    }

    const page = await ctx.store.getPage(slug);
    if (!page) {
      return apiError(c, WIKI_ERROR_CODES.NOT_FOUND, `page not found: ${slug}`, 404);
    }

    const body: GetPageResponse = { page };
    return c.json(body);
  });

  app.put(`${WIKI_PATHS.pages}/*`, async (c) => {
    const slug = extractSlug(c.req.path);
    if (!slug) {
      return apiError(c, WIKI_ERROR_CODES.INVALID_SLUG, "missing slug", 400);
    }
    if (!isValidSlug(slug)) {
      return apiError(c, WIKI_ERROR_CODES.INVALID_SLUG, `invalid slug: ${slug}`, 400);
    }

    let body: PutPageRequest;
    try {
      body = await c.req.json<PutPageRequest>();
    } catch {
      return apiError(c, WIKI_ERROR_CODES.INVALID_REQUEST, "invalid JSON body", 400);
    }

    const updatedBy = body.updatedBy?.trim();
    if (!updatedBy) {
      return apiError(
        c,
        WIKI_ERROR_CODES.INVALID_REQUEST,
        "updatedBy is required",
        400,
      );
    }
    if (typeof body.body !== "string") {
      return apiError(c, WIKI_ERROR_CODES.INVALID_REQUEST, "body is required", 400);
    }

    try {
      const page = await ctx.store.putPage(slug, {
        title: body.title,
        body: body.body,
        updatedBy,
        ifRevision: body.ifRevision,
      });
      await ctx.index.upsertSlug(ctx.store, slug);
      const response: PutPageResponse = { page };
      return c.json(response);
    } catch (error) {
      if (error instanceof WikiStoreError) {
        const status =
          error.code === WIKI_ERROR_CODES.CONFLICT
            ? 409
            : error.code === WIKI_ERROR_CODES.INVALID_SLUG
              ? 400
              : 400;
        return apiError(c, error.code, error.message, status);
      }
      throw error;
    }
  });

  app.delete(`${WIKI_PATHS.pages}/*`, async (c) => {
    const slug = extractSlug(c.req.path);
    if (!slug) {
      return apiError(c, WIKI_ERROR_CODES.INVALID_SLUG, "missing slug", 400);
    }
    if (!isValidSlug(slug)) {
      return apiError(c, WIKI_ERROR_CODES.INVALID_SLUG, `invalid slug: ${slug}`, 400);
    }

    let body: DeletePageRequest = { deletedBy: "operator" };
    try {
      const raw = await c.req.text();
      if (raw.trim()) {
        body = JSON.parse(raw) as DeletePageRequest;
      }
    } catch {
      return apiError(c, WIKI_ERROR_CODES.INVALID_REQUEST, "invalid JSON body", 400);
    }

    const deletedBy = body.deletedBy?.trim();
    if (!deletedBy) {
      return apiError(
        c,
        WIKI_ERROR_CODES.INVALID_REQUEST,
        "deletedBy is required",
        400,
      );
    }

    try {
      await ctx.store.deletePage(slug, {
        deletedBy,
        ifRevision: body.ifRevision,
      });
      ctx.index.removeSlug(slug);
      const response: DeletePageResponse = { slug, deleted: true };
      return c.json(response);
    } catch (error) {
      if (error instanceof WikiStoreError) {
        const status =
          error.code === WIKI_ERROR_CODES.NOT_FOUND
            ? 404
            : error.code === WIKI_ERROR_CODES.CONFLICT
              ? 409
              : error.code === WIKI_ERROR_CODES.INVALID_SLUG
                ? 400
                : 400;
        return apiError(c, error.code, error.message, status);
      }
      throw error;
    }
  });

  app.get(WIKI_PATHS.search, (c) => {
    const query = c.req.query("q") ?? "";
    const limit = parseLimit(c.req.query("limit"), 10);
    const hits = ctx.index.search(query, limit);
    const body: SearchPagesResponse = { hits };
    return c.json(body);
  });

  app.post(WIKI_PATHS.reindex, async (c) => {
    const chunksIndexed = await ctx.index.reindex(ctx.store);
    const body: ReindexResponse = { chunksIndexed };
    return c.json(body);
  });

  return app;
}

export function startServer(
  host: string,
  port: number,
  ctx: WikiContext,
  onReady?: () => void,
): void {
  const app = createApp(ctx);
  serve(
    {
      fetch: app.fetch,
      hostname: host,
      port,
    },
    onReady,
  );
}

function extractSlug(pathname: string): string {
  const prefix = `${WIKI_PATHS.pages}/`;
  if (!pathname.startsWith(prefix)) {
    return "";
  }
  return decodeURIComponent(pathname.slice(prefix.length));
}

function parseLimit(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    return fallback;
  }
  return value;
}

function apiError(
  c: { json: (body: unknown, status?: number) => Response },
  code: string,
  message: string,
  status: number,
): Response {
  return c.json({ error: { code, message } }, status);
}
