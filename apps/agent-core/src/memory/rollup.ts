import {
  generateSummary,
} from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { MaintainMemoryScope } from "@digital-worker/agent-core-protocol";

import { distillDedup, type DistillChunk } from "./distill.js";
import type { MemoryStore } from "./memory-store.js";
import { formatDate, formatIsoWeek, formatMonth } from "./paths.js";

export type RollupDeps = {
  store: MemoryStore;
  model: Model<string>;
  apiKey: string;
  ollamaBaseUrl?: string;
  distillBinary?: string;
};

export type RollupResult = {
  processedPeriods: string[];
  deduped: number;
  promoted: number;
};

function extractBullets(markdown: string): DistillChunk[] {
  const chunks: DistillChunk[] = [];
  let idx = 0;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      chunks.push({
        id: `bullet-${idx++}`,
        text: trimmed.slice(2).trim(),
      });
    }
  }
  return chunks;
}

function bulletsToMarkdown(title: string, bullets: DistillChunk[]): string {
  const lines = bullets.map((b) => `- ${b.text}`);
  return `# ${title}\n\n${lines.join("\n")}\n`;
}

async function summarizeBullets(
  deps: RollupDeps,
  title: string,
  bullets: DistillChunk[],
): Promise<string> {
  if (bullets.length === 0) {
    return `# ${title}\n\n(No entries)\n`;
  }
  const conversation = bullets.map((b, i) => ({
    role: "user" as const,
    content: [{ type: "text" as const, text: b.text }],
    timestamp: Date.now() + i,
  }));

  const result = await generateSummary(
    conversation,
    deps.model,
    4096,
    deps.apiKey,
    undefined,
    undefined,
    `Summarize these memory entries into a structured weekly/monthly roll-up titled "${title}". Preserve decisions, facts, and open threads. Use markdown sections.`,
  );

  if (result.ok) {
    return `# ${title}\n\n${result.value}\n`;
  }
  return bulletsToMarkdown(title, bullets);
}

function groupDailiesByWeek(dates: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const date of dates) {
    const d = new Date(`${date}T12:00:00`);
    const week = formatIsoWeek(d);
    const list = map.get(week) ?? [];
    list.push(date);
    map.set(week, list);
  }
  return map;
}

function groupWeeksByMonth(weeks: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const week of weeks) {
    const match = /^(\d{4})-W/.exec(week);
    const month = match ? `${match[1]}-${week.includes("W") ? getMonthFromWeek(week) : "01"}` : formatMonth();
    const list = map.get(month) ?? [];
    list.push(week);
    map.set(month, list);
  }
  return map;
}

function getMonthFromWeek(isoWeek: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) {
    return "01";
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return String(weekStart.getUTCMonth() + 1).padStart(2, "0");
}

async function promoteDurableFacts(
  store: MemoryStore,
  bullets: DistillChunk[],
): Promise<number> {
  const durable = bullets.filter(
    (b) =>
      /\b(prefer|always|never|convention|decision|standing|remember)\b/i.test(
        b.text,
      ) || b.text.includes("[correction]"),
  );
  if (durable.length === 0) {
    return 0;
  }
  const additions = durable.map((b) => `- ${b.text}`).join("\n");
  await store.mergeMemoryMd(additions);
  return durable.length;
}

export async function runWeeklyRollup(deps: RollupDeps): Promise<RollupResult> {
  const today = formatDate();
  const manifest = await deps.store.readManifest();
  const allDailies = await deps.store.listDailyFiles();
  const eligible = allDailies.filter((d) => d < today);
  const byWeek = groupDailiesByWeek(eligible);

  const processedPeriods: string[] = [];
  let deduped = 0;
  let promoted = 0;

  for (const [week, dates] of byWeek) {
    if (manifest.lastRollupWeekly && week <= manifest.lastRollupWeekly) {
      continue;
    }
    const weekComplete = dates.every((d) => {
      const dDate = new Date(`${d}T23:59:59`);
      const weekEnd = endOfIsoWeek(week);
      return dDate <= weekEnd;
    });
    if (!weekComplete && dates.some((d) => d >= today)) {
      continue;
    }

    let combined = "";
    for (const date of dates) {
      combined += `${await deps.store.readDaily(date)}\n`;
    }
    const bullets = extractBullets(combined);
    const { chunks, usedDistill } = await distillDedup(bullets, {
      ollamaBaseUrl: deps.ollamaBaseUrl,
      distillBinary: deps.distillBinary,
    });
    deduped += bullets.length - chunks.length;

    const summary = await summarizeBullets(deps, week, chunks);
    await deps.store.writeRollup("weekly", week, summary);
    promoted += await promoteDurableFacts(deps.store, chunks);

    for (const date of dates) {
      await deps.store.archiveDaily(date);
    }

    processedPeriods.push(week);
    manifest.lastRollupWeekly = week;
  }

  await deps.store.writeManifest(manifest);
  return { processedPeriods, deduped, promoted };
}

export async function runMonthlyRollup(deps: RollupDeps): Promise<RollupResult> {
  const manifest = await deps.store.readManifest();
  const weeks = await deps.store.listWeeklyFiles();
  const currentMonth = formatMonth();
  const byMonth = groupWeeksByMonth(weeks.filter((w) => !w.startsWith(currentMonth)));

  const processedPeriods: string[] = [];
  let deduped = 0;
  let promoted = 0;

  for (const [month, monthWeeks] of byMonth) {
    if (manifest.lastRollupMonthly && month <= manifest.lastRollupMonthly) {
      continue;
    }

    let combined = "";
    for (const week of monthWeeks) {
      combined += `${await deps.store.readRollup("weekly", week)}\n`;
    }
    const bullets = extractBullets(combined);
    const { chunks } = await distillDedup(bullets, {
      ollamaBaseUrl: deps.ollamaBaseUrl,
      distillBinary: deps.distillBinary,
    });
    deduped += bullets.length - chunks.length;

    const summary = await summarizeBullets(deps, month, chunks);
    await deps.store.writeRollup("monthly", month, summary);
    promoted += await promoteDurableFacts(deps.store, chunks);
    processedPeriods.push(month);
    manifest.lastRollupMonthly = month;
  }

  await deps.store.writeManifest(manifest);
  return { processedPeriods, deduped, promoted };
}

function endOfIsoWeek(isoWeek: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) {
    return new Date();
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return weekEnd;
}

export async function runMaintenance(
  deps: RollupDeps,
  scope?: MaintainMemoryScope,
): Promise<RollupResult> {
  if (scope === "reindex") {
    return { processedPeriods: [], deduped: 0, promoted: 0 };
  }
  if (scope === "prune") {
    return { processedPeriods: [], deduped: 0, promoted: 0 };
  }
  if (scope === "monthly") {
    return runMonthlyRollup(deps);
  }
  if (scope === "weekly") {
    return runWeeklyRollup(deps);
  }

  const weekly = await runWeeklyRollup(deps);
  const monthly = await runMonthlyRollup(deps);
  return {
    processedPeriods: [...weekly.processedPeriods, ...monthly.processedPeriods],
    deduped: weekly.deduped + monthly.deduped,
    promoted: weekly.promoted + monthly.promoted,
  };
}
