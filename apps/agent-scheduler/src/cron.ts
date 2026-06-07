import { CronExpressionParser } from "cron-parser";

const CRON_FIELD_COUNT = 5;

export class InvalidCronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCronError";
  }
}

/** Validate standard 5-field Vixie cron (no seconds field). */
export function validateCron(expr: string): void {
  const trimmed = expr.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length !== CRON_FIELD_COUNT) {
    throw new InvalidCronError(
      `cron must have exactly ${CRON_FIELD_COUNT} fields (minute hour day-of-month month day-of-week)`,
    );
  }

  try {
    CronExpressionParser.parse(trimmed, { tz: "UTC" });
  } catch (error) {
    throw new InvalidCronError(
      error instanceof Error ? error.message : "invalid cron expression",
    );
  }
}

export function computeNextFireAt(
  cron: string,
  timezone: string,
  afterMs: number,
): number {
  validateCron(cron);
  const expression = CronExpressionParser.parse(cron.trim(), {
    tz: timezone,
    currentDate: new Date(afterMs),
  });
  return expression.next().toDate().getTime();
}

export function computeInitialFireAt(cron: string, timezone: string): number {
  return computeNextFireAt(cron, timezone, Date.now());
}
