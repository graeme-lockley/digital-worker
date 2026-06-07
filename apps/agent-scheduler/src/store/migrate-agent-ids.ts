import type { Client } from "@libsql/client";

/** Dev-workstation agent id renames after splitting agent-core into per-agent services. */
export const AGENT_ID_RENAMES = [
  {
    from: "dev-workstation-agent-core",
    to: "dev-workstation-agent-core-aida",
  },
] as const;

export async function migrateAgentIds(client: Client): Promise<number> {
  let updated = 0;

  for (const { from, to } of AGENT_ID_RENAMES) {
    const agentResult = await client.execute({
      sql: "UPDATE scheduled_event SET agent_id = ? WHERE agent_id = ?",
      args: [to, from],
    });
    updated += Number(agentResult.rowsAffected ?? 0);

    const createdByResult = await client.execute({
      sql: "UPDATE scheduled_event SET created_by = ? WHERE created_by = ?",
      args: [to, from],
    });
    updated += Number(createdByResult.rowsAffected ?? 0);
  }

  return updated;
}
