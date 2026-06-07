import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  AGENT_STATUS,
  type AgentStatus,
  type RegisteredAgent,
  type RegisterAgentRequest,
} from "@digital-worker/agent-register-protocol";
import { createClient, type Client } from "@libsql/client";

type AgentRow = {
  agent_id: string;
  name: string;
  purpose: string;
  skills: string;
  endpoint_url: string;
  status: string;
  registered_at: string;
  last_heartbeat_at: string | null;
};

export class AgentRegistryStore {
  private constructor(private readonly client: Client) {}

  static async create(
    dbUrl: string,
    authToken?: string,
  ): Promise<AgentRegistryStore> {
    ensureFileDbDir(dbUrl);
    const client = createClient({
      url: dbUrl,
      authToken,
    });
    const store = new AgentRegistryStore(client);
    await connectWithRetry(dbUrl, () => store.initSchema());
    return store;
  }

  async close(): Promise<void> {
    this.client.close();
  }

  private async initSchema(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS agent (
        agent_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        skills TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        status TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        last_heartbeat_at TEXT
      )
    `);
  }

  async register(request: RegisterAgentRequest): Promise<RegisteredAgent> {
    const existing = await this.get(request.agentId);
    if (existing) {
      throw new AgentRegistryError(
        "AGENT_ALREADY_REGISTERED",
        `agent ${request.agentId} is already registered`,
      );
    }

    const registeredAt = new Date().toISOString();
    const agent: RegisteredAgent = {
      agentId: request.agentId,
      name: request.name,
      purpose: request.purpose,
      skills: [...request.skills],
      endpoint: { url: request.endpoint.url },
      status: AGENT_STATUS.AVAILABLE,
      registeredAt,
      lastHeartbeatAt: registeredAt,
    };

    await this.client.execute({
      sql: `
        INSERT INTO agent (
          agent_id, name, purpose, skills, endpoint_url,
          status, registered_at, last_heartbeat_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        agent.agentId,
        agent.name,
        agent.purpose,
        JSON.stringify(agent.skills),
        agent.endpoint.url,
        agent.status,
        agent.registeredAt,
        agent.lastHeartbeatAt,
      ],
    });

    return agent;
  }

  async deregister(agentId: string): Promise<RegisteredAgent> {
    const agent = await this.get(agentId);
    if (!agent) {
      throw new AgentRegistryError(
        "AGENT_NOT_FOUND",
        `agent ${agentId} is not registered`,
      );
    }

    await this.client.execute({
      sql: "DELETE FROM agent WHERE agent_id = ?",
      args: [agentId],
    });

    return agent;
  }

  async list(): Promise<RegisteredAgent[]> {
    const result = await this.client.execute("SELECT * FROM agent");
    return result.rows.map((row) => rowToAgent(row as unknown as AgentRow));
  }

  async get(agentId: string): Promise<RegisteredAgent | undefined> {
    const result = await this.client.execute({
      sql: "SELECT * FROM agent WHERE agent_id = ?",
      args: [agentId],
    });

    const row = result.rows[0];
    return row ? rowToAgent(row as unknown as AgentRow) : undefined;
  }

  async updateHeartbeat(agentId: string, heartbeatAt: string): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE agent
        SET last_heartbeat_at = ?, status = ?
        WHERE agent_id = ?
      `,
      args: [heartbeatAt, AGENT_STATUS.AVAILABLE, agentId],
    });
  }

  async markSleeping(agentId: string): Promise<void> {
    await this.client.execute({
      sql: "UPDATE agent SET status = ? WHERE agent_id = ?",
      args: [AGENT_STATUS.SLEEPING, agentId],
    });
  }
}

function rowToAgent(row: AgentRow): RegisteredAgent {
  return {
    agentId: row.agent_id,
    name: row.name,
    purpose: row.purpose,
    skills: JSON.parse(row.skills) as string[],
    endpoint: { url: row.endpoint_url },
    status: row.status as AgentStatus,
    registeredAt: row.registered_at,
    lastHeartbeatAt: row.last_heartbeat_at,
  };
}

async function connectWithRetry(
  dbUrl: string,
  connect: () => Promise<void>,
): Promise<void> {
  const isRemote =
    dbUrl.startsWith("http://") || dbUrl.startsWith("https://");
  const maxAttempts = isRemote ? 30 : 1;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await connect();
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureFileDbDir(dbUrl: string): void {
  if (!dbUrl.startsWith("file:")) {
    return;
  }

  const filePath = dbUrl.slice("file:".length);
  if (filePath === ":memory:" || filePath.startsWith(":memory:")) {
    return;
  }

  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

export class AgentRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentRegistryError";
  }
}

export type { AgentStatus };
