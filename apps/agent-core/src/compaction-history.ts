import { estimateContextTokens } from "@earendil-works/pi-agent-core";
import {
  buildSessionContext,
  type AgentSession,
  type CompactionEntry,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type {
  CompactionReason,
  CompactionSummary,
} from "@digital-worker/agent-core-protocol";

const reasonByEntryId = new Map<string, CompactionReason>();

export function attachCompactionHistory(session: AgentSession): () => void {
  return session.subscribe((event) => {
    if (event.type !== "compaction_end" || event.aborted || !event.result) {
      return;
    }

    const entries = session.sessionManager.getEntries();
    const compactionEntries = entries.filter(
      (entry): entry is CompactionEntry => entry.type === "compaction",
    );
    const latest = compactionEntries[compactionEntries.length - 1];
    if (latest) {
      reasonByEntryId.set(latest.id, event.reason);
    }
  });
}

export function compactionRecordsFromEntries(
  entries: SessionEntry[],
  limit = 10,
): CompactionSummary[] {
  const compactions = entries.filter(
    (entry): entry is CompactionEntry => entry.type === "compaction",
  );
  const recent = compactions.slice(-limit);

  return recent.map((entry) => ({
    timestamp: entry.timestamp,
    tokensBefore: entry.tokensBefore,
    tokensAfter: estimateContextTokens(
      buildSessionContext(entries, entry.id).messages,
    ).tokens,
    reason: reasonByEntryId.get(entry.id) ?? "unknown",
  }));
}

export function listRecentCompactions(
  session: AgentSession,
  limit = 10,
): CompactionSummary[] {
  return compactionRecordsFromEntries(
    session.sessionManager.getEntries(),
    limit,
  );
}

/** @internal Test helper */
export function resetCompactionHistoryForTests(): void {
  reasonByEntryId.clear();
}

/** @internal Test helper */
export function recordCompactionReasonForTests(
  entryId: string,
  reason: CompactionReason,
): void {
  reasonByEntryId.set(entryId, reason);
}
