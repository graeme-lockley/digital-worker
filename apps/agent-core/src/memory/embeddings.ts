/**
 * Local embedding client for semantic memory recall.
 *
 * Reuses the same Ollama instance the rollup pipeline already runs for Distill
 * dedup (`nomic-embed-text` by default). All calls are best-effort: any failure
 * trips a circuit breaker so the FTS path keeps working without paying repeated
 * timeouts when Ollama is unreachable (e.g. local `pnpm dev` or CI).
 */

/** Minimal interface so tests can inject a deterministic fake embedder. */
export interface Embedder {
  /**
   * Embed a batch of texts. Returns one vector per input (same order), or
   * `undefined` when embeddings are unavailable so callers can fall back to FTS.
   */
  embed(texts: string[]): Promise<Float32Array[] | undefined>;
}

export type EmbeddingClientOptions = {
  baseUrl: string;
  model: string;
  /** Per-request timeout. Default 10s. */
  timeoutMs?: number;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  embedding?: number[];
};

export class EmbeddingClient implements Embedder {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  /** Trips after the first failure so we stop hammering an unavailable host. */
  private disabled = false;

  constructor(options: EmbeddingClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async embed(texts: string[]): Promise<Float32Array[] | undefined> {
    if (this.disabled || texts.length === 0) {
      return this.disabled ? undefined : [];
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.disabled = true;
        return undefined;
      }
      const data = (await response.json()) as OllamaEmbedResponse;
      const vectors = data.embeddings ?? (data.embedding ? [data.embedding] : undefined);
      if (!vectors || vectors.length !== texts.length) {
        this.disabled = true;
        return undefined;
      }
      return vectors.map((v) => Float32Array.from(v));
    } catch {
      this.disabled = true;
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Cosine similarity in [-1, 1]; returns 0 for zero/mismatched vectors. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Pack a Float32Array into bytes for SQLite BLOB storage. */
export function serializeVector(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength).slice();
}

/** Reconstruct a Float32Array from SQLite BLOB bytes (copied, alignment-safe). */
export function deserializeVector(bytes: Uint8Array): Float32Array {
  const copy = Uint8Array.from(bytes);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}
