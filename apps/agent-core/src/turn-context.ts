export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Resolve IANA timezone: explicit override, then AGENT_TIMEZONE/TZ env, then system default. */
export function resolveAgentTimeZone(explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    if (!isValidTimeZone(trimmed)) {
      throw new Error(`invalid timezone: ${trimmed}`);
    }
    return trimmed;
  }

  for (const candidate of [
    process.env.AGENT_TIMEZONE?.trim(),
    process.env.TZ?.trim(),
  ]) {
    if (candidate && isValidTimeZone(candidate)) {
      return candidate;
    }
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Per-turn clock context (minute precision) for injection before user prompts. */
export function formatTurnTimeContext(
  timeZone: string,
  now: Date = new Date(),
): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(now);

  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(now);
  const tzAbbr =
    tzParts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;

  return `[Context: ${date} ${time} ${tzAbbr} (${weekday}), timezone ${timeZone}]`;
}

export function prefixPromptWithTurnContext(
  prompt: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  return `${formatTurnTimeContext(timeZone, now)}\n\n${prompt}`;
}
