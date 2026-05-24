import type { WorkspaceIdentity } from "./load.js";

export function buildSystemPrompt(identity: WorkspaceIdentity): string {
  return [
    "You are a digital worker agent. Follow Mandate and Soul at all times.",
    "You may update durable self-knowledge via the update_identity tool; do not contradict Mandate or Soul.",
    "",
    "# Mandate (immutable)",
    identity.mandate.trim(),
    "",
    "# Soul (immutable)",
    identity.soul.trim(),
    "",
    "# Identity (self-knowledge — you may update via update_identity)",
    identity.identity.trim(),
  ].join("\n");
}

export function extractPurposeFromMandate(mandate: string, maxLength = 500): string {
  const lines = mandate.split("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("<!--") || trimmed.startsWith("#")) {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }
    if (trimmed.length === 0) {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }
  if (current.length > 0) {
    paragraphs.push(current.join(" ").trim());
  }

  const first = paragraphs.find((p) => p.length > 0) ?? "Digital worker agent";
  if (first.length <= maxLength) {
    return first;
  }
  return `${first.slice(0, maxLength - 3)}...`;
}
