import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  WIKI_PATHS,
  type DeletePageResponse,
  type GetPageResponse,
  type ListPagesResponse,
  type PutPageResponse,
  type SearchPagesResponse,
  type WikiPage,
  type WikiPageSummary,
  type WikiSearchHit,
} from "@digital-worker/agent-wiki-protocol";
import { Type } from "typebox";

export type WikiClientDeps = {
  wikiUrl: string;
  agentName: string;
  fetchFn?: typeof fetch;
};

export function createWikiListTool(
  deps: WikiClientDeps,
): AgentTool<typeof wikiListParameters> {
  return {
    name: "wiki_list",
    label: "Wiki List",
    description:
      "List shared wiki pages (slug, title, revision). Use before wiki_read to discover available knowledge.",
    parameters: wikiListParameters,
    execute: async () => {
      const fetchFn = deps.fetchFn ?? fetch;
      const url = new URL(WIKI_PATHS.pages, deps.wikiUrl);
      const response = await fetchFn(url);
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [{ type: "text", text: `wiki_list failed: ${detail}` }],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as ListPagesResponse;
      if (body.pages.length === 0) {
        return {
          content: [{ type: "text", text: "No wiki pages." }],
          details: body,
        };
      }

      const formatted = body.pages
        .map((page: WikiPageSummary, index: number) => {
          return `${index + 1}. ${page.slug} — ${page.title} (rev ${page.revision}, ${page.updatedBy})`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `${body.pages.length} wiki page(s):\n\n${formatted}`,
          },
        ],
        details: body,
      };
    },
  };
}

export function createWikiReadTool(
  deps: WikiClientDeps,
): AgentTool<typeof wikiReadParameters> {
  return {
    name: "wiki_read",
    label: "Wiki Read",
    description:
      "Read a shared wiki page by slug (e.g. Usage, people/graeme). Check the wiki before asking a peer.",
    parameters: wikiReadParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const slug = params.slug.trim();
      const url = new URL(
        `${WIKI_PATHS.pages}/${encodeURIComponent(slug)}`,
        deps.wikiUrl,
      );
      const response = await fetchFn(url);
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [{ type: "text", text: `wiki_read failed: ${detail}` }],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as GetPageResponse;
      const page = body.page;
      return {
        content: [
          {
            type: "text",
            text: formatPage(page),
          },
        ],
        details: body,
      };
    },
  };
}

export function createWikiSearchTool(
  deps: WikiClientDeps,
): AgentTool<typeof wikiSearchParameters> {
  return {
    name: "wiki_search",
    label: "Wiki Search",
    description:
      "Full-text search over shared wiki pages. Use when recalling cross-agent knowledge.",
    parameters: wikiSearchParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const url = new URL(WIKI_PATHS.search, deps.wikiUrl);
      url.searchParams.set("q", params.query.trim());
      if (params.limit !== undefined) {
        url.searchParams.set("limit", String(params.limit));
      }

      const response = await fetchFn(url);
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [{ type: "text", text: `wiki_search failed: ${detail}` }],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as SearchPagesResponse;
      if (body.hits.length === 0) {
        return {
          content: [{ type: "text", text: "No wiki matches." }],
          details: body,
        };
      }

      const formatted = body.hits
        .map((hit: WikiSearchHit, index: number) => {
          const excerpt = hit.content.slice(0, 200);
          return `${index + 1}. ${hit.slug} · ${hit.section}\n   ${excerpt}${hit.content.length > 200 ? "…" : ""}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `${body.hits.length} wiki hit(s):\n\n${formatted}`,
          },
        ],
        details: body,
      };
    },
  };
}

export function createWikiWriteTool(
  deps: WikiClientDeps,
): AgentTool<typeof wikiWriteParameters> {
  return {
    name: "wiki_write",
    label: "Wiki Write",
    description:
      "Create or update a shared wiki page. Use for cross-agent durable facts (people, conventions, deployment). Pass ifRevision when updating to avoid conflicts.",
    parameters: wikiWriteParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const slug = params.slug.trim();
      const url = new URL(
        `${WIKI_PATHS.pages}/${encodeURIComponent(slug)}`,
        deps.wikiUrl,
      );

      const response = await fetchFn(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: params.title?.trim() || undefined,
          body: params.body,
          updatedBy: deps.agentName,
          ifRevision: params.ifRevision,
        }),
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [{ type: "text", text: `wiki_write failed: ${detail}` }],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as PutPageResponse;
      const page = body.page;
      return {
        content: [
          {
            type: "text",
            text: `Updated wiki page ${page.slug} (rev ${page.revision}).`,
          },
        ],
        details: body,
      };
    },
  };
}

export function createWikiDeleteTool(
  deps: WikiClientDeps,
): AgentTool<typeof wikiDeleteParameters> {
  return {
    name: "wiki_delete",
    label: "Wiki Delete",
    description:
      "Delete a shared wiki page by slug. Use only when content is obsolete or was moved to a child page. Do not delete Home or Usage without explicit operator intent. Pass ifRevision when the page may have changed.",
    parameters: wikiDeleteParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const slug = params.slug.trim();
      const url = new URL(
        `${WIKI_PATHS.pages}/${encodeURIComponent(slug)}`,
        deps.wikiUrl,
      );

      const response = await fetchFn(url, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deletedBy: deps.agentName,
          ifRevision: params.ifRevision,
        }),
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return {
          content: [{ type: "text", text: `wiki_delete failed: ${detail}` }],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as DeletePageResponse;
      return {
        content: [
          {
            type: "text",
            text: `Deleted wiki page ${body.slug}.`,
          },
        ],
        details: body,
      };
    },
  };
}

function formatPage(page: WikiPage): string {
  return [
    `# ${page.title}`,
    `slug: ${page.slug}`,
    `revision: ${page.revision}`,
    `updated_by: ${page.updatedBy}`,
    `updated_at: ${page.updatedAt}`,
    "",
    page.body,
  ].join("\n");
}

async function readErrorMessage(response: Response): Promise<string> {
  let detail = `${response.status}`;
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    if (payload.error?.message) {
      detail = payload.error.message;
    }
  } catch {
    // ignore
  }
  return detail;
}

const wikiListParameters = Type.Object({});

const wikiReadParameters = Type.Object({
  slug: Type.String({
    description: "Wiki page slug (e.g. Usage, people/graeme)",
    minLength: 1,
    maxLength: 200,
  }),
});

const wikiSearchParameters = Type.Object({
  query: Type.String({
    description: "Search keywords",
    minLength: 1,
    maxLength: 500,
  }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});

const wikiDeleteParameters = Type.Object({
  slug: Type.String({
    description: "Wiki page slug to delete",
    minLength: 1,
    maxLength: 200,
  }),
  ifRevision: Type.Optional(
    Type.Integer({
      description: "Expected current revision for optimistic concurrency",
      minimum: 0,
    }),
  ),
});

const wikiWriteParameters = Type.Object({
  slug: Type.String({
    description: "Wiki page slug to create or update",
    minLength: 1,
    maxLength: 200,
  }),
  body: Type.String({
    description: "Markdown body (without front matter)",
    minLength: 0,
    maxLength: 128000,
  }),
  title: Type.Optional(
    Type.String({
      description: "Page title (defaults to slug-derived title)",
      maxLength: 200,
    }),
  ),
  ifRevision: Type.Optional(
    Type.Integer({
      description: "Expected current revision for optimistic concurrency",
      minimum: 0,
    }),
  ),
});
