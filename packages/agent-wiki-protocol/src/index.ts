/** HTTP paths implemented by agent-wiki. */
export const WIKI_PATHS = {
  health: "/health",
  pages: "/api/v1/pages",
  search: "/api/v1/search",
  reindex: "/api/v1/reindex",
} as const;

export const WIKI_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_SLUG: "INVALID_SLUG",
} as const;

export type WikiErrorCode =
  (typeof WIKI_ERROR_CODES)[keyof typeof WIKI_ERROR_CODES];

export interface ApiError {
  code: WikiErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface WikiPage {
  slug: string;
  title: string;
  body: string;
  updatedBy: string;
  updatedAt: string;
  revision: number;
}

export interface WikiPageSummary {
  slug: string;
  title: string;
  updatedBy: string;
  updatedAt: string;
  revision: number;
}

export interface WikiSearchHit {
  slug: string;
  section: string;
  content: string;
  score: number;
}

export interface PutPageRequest {
  title?: string;
  body: string;
  updatedBy: string;
  /** Optimistic concurrency: reject when current revision differs. */
  ifRevision?: number;
}

export interface ListPagesResponse {
  pages: WikiPageSummary[];
}

export interface GetPageResponse {
  page: WikiPage;
}

export interface PutPageResponse {
  page: WikiPage;
}

export interface DeletePageRequest {
  deletedBy: string;
  /** Optimistic concurrency: reject when current revision differs. */
  ifRevision?: number;
}

export interface DeletePageResponse {
  slug: string;
  deleted: true;
}

export interface SearchPagesResponse {
  hits: WikiSearchHit[];
}

export interface ReindexResponse {
  chunksIndexed: number;
}
