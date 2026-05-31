import path from "node:path";

export const MEMORY_DIR = "memory";
export const MEMORY_MD = "MEMORY.md";
export const DAILY_DIR = "daily";
export const WEEKLY_DIR = "weekly";
export const MONTHLY_DIR = "monthly";
export const ARCHIVE_DAILY_DIR = "archive/daily";
export const INDEX_DB = "index.db";
export const MANIFEST_FILE = "manifest.json";

export type MemoryPaths = {
  memoryDir: string;
  memoryMdPath: string;
  dailyDir: string;
  weeklyDir: string;
  monthlyDir: string;
  archiveDailyDir: string;
  indexDbPath: string;
  manifestPath: string;
};

export function memoryPaths(workspaceDir: string): MemoryPaths {
  const memoryDir = path.join(workspaceDir, MEMORY_DIR);
  return {
    memoryDir,
    memoryMdPath: path.join(memoryDir, MEMORY_MD),
    dailyDir: path.join(memoryDir, DAILY_DIR),
    weeklyDir: path.join(memoryDir, WEEKLY_DIR),
    monthlyDir: path.join(memoryDir, MONTHLY_DIR),
    archiveDailyDir: path.join(memoryDir, ARCHIVE_DAILY_DIR),
    indexDbPath: path.join(memoryDir, INDEX_DB),
    manifestPath: path.join(memoryDir, MANIFEST_FILE),
  };
}

export function dailyPath(paths: MemoryPaths, date: string): string {
  return path.join(paths.dailyDir, `${date}.md`);
}

export function weeklyPath(paths: MemoryPaths, isoWeek: string): string {
  return path.join(paths.weeklyDir, `${isoWeek}.md`);
}

export function monthlyPath(paths: MemoryPaths, month: string): string {
  return path.join(paths.monthlyDir, `${month}.md`);
}

export function archiveDailyPath(paths: MemoryPaths, date: string): string {
  return path.join(paths.archiveDailyDir, `${date}.md`);
}

/** Format date as YYYY-MM-DD in local time. */
export function formatDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO week id YYYY-Www. */
export function formatIsoWeek(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function formatMonth(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function yesterdayDate(d: Date = new Date()): string {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return formatDate(y);
}

export function formatTime(d: Date = new Date()): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export const MEMORY_SECTIONS = [
  "Facts",
  "Decisions",
  "Open threads",
  "Failures / corrections",
] as const;

export type MemorySection = (typeof MEMORY_SECTIONS)[number];
