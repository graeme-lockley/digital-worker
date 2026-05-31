import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DistillChunk = {
  id: string;
  text: string;
  metadata?: Record<string, string>;
};

export type DistillOptions = {
  ollamaBaseUrl?: string;
  embeddingModel?: string;
  distillBinary?: string;
  configPath?: string;
};

function distillConfigYaml(options: DistillOptions): string {
  const host = options.ollamaBaseUrl ?? "http://127.0.0.1:11434";
  const model = options.embeddingModel ?? "nomic-embed-text";
  return [
    "embedding:",
    "  provider: ollama",
    `  model: ${model}`,
    `  host: "${host}"`,
    "dedup:",
    "  threshold: 0.15",
    "",
  ].join("\n");
}

type DistillOutputChunk = {
  ID?: string;
  id?: string;
  Text?: string;
  text?: string;
  Metadata?: Record<string, string> | null;
  metadata?: Record<string, string>;
};

function parseDistillOutput(raw: string): DistillChunk[] {
  const parsed = JSON.parse(raw) as DistillOutputChunk[];
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((c) => ({
      id: c.id ?? c.ID ?? "",
      text: c.text ?? c.Text ?? "",
      metadata: c.metadata ?? c.Metadata ?? undefined,
    }))
    .filter((c) => c.id.length > 0 && c.text.length > 0);
}

/** Heuristic dedup: normalize text and collapse exact/near duplicates. */
export function heuristicDedup(chunks: DistillChunk[]): DistillChunk[] {
  const seen = new Set<string>();
  const result: DistillChunk[] = [];
  for (const chunk of chunks) {
    const key = chunk.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(chunk);
  }
  return result;
}

/** Run Distill pipeline CLI for semantic dedup; falls back to heuristic dedup. */
export async function distillDedup(
  chunks: DistillChunk[],
  options: DistillOptions = {},
): Promise<{ chunks: DistillChunk[]; usedDistill: boolean }> {
  if (chunks.length <= 1) {
    return { chunks, usedDistill: false };
  }

  const binary = options.distillBinary ?? "distill";
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "aida-distill-"));
  const inputPath = path.join(tmpDir, "input.json");
  const outputPath = path.join(tmpDir, "output.json");
  const configPath =
    options.configPath ?? process.env.DISTILL_CONFIG ?? path.join(tmpDir, "distill.yaml");

  try {
    const payload = chunks.map((c) => ({
      id: c.id,
      text: c.text,
      metadata: c.metadata ?? {},
    }));
    await writeFile(inputPath, JSON.stringify(payload, null, 2), "utf-8");

    if (!options.configPath && !process.env.DISTILL_CONFIG) {
      await writeFile(configPath, distillConfigYaml(options), "utf-8");
    }

    const args = [
      "pipeline",
      "--config",
      configPath,
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--stats",
      "--no-compress",
    ];

    await execFileAsync(binary, args, {
      timeout: 120_000,
      env: { ...process.env },
    });

    const raw = await readFile(outputPath, "utf-8");
    const deduped = parseDistillOutput(raw);
    if (deduped.length > 0) {
      return { chunks: deduped, usedDistill: true };
    }
  } catch {
    // fall through to heuristic
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  return { chunks: heuristicDedup(chunks), usedDistill: false };
}
