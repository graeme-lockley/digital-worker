import { AGENT_STATUS, type RegisteredAgent } from "./agent.js";

function matchesPrefix(agent: RegisteredAgent, prefix: string): boolean {
  const normalized = prefix.toLowerCase();
  const name = agent.name.toLowerCase();
  const agentId = agent.agentId.toLowerCase();

  return (
    name.startsWith(normalized) ||
    agentId.startsWith(normalized) ||
    agentId.endsWith(normalized) ||
    agentId.includes(`-${normalized}`)
  );
}

function heartbeatMs(agent: RegisteredAgent): number {
  if (!agent.lastHeartbeatAt) {
    return 0;
  }
  const ms = Date.parse(agent.lastHeartbeatAt);
  return Number.isNaN(ms) ? 0 : ms;
}

function registeredMs(agent: RegisteredAgent): number {
  const ms = Date.parse(agent.registeredAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Prefer live agents, then the most recently seen registration. */
function rankMatches(matches: RegisteredAgent[]): RegisteredAgent[] {
  return [...matches].sort((a, b) => {
    const statusScore = (agent: RegisteredAgent): number =>
      agent.status === AGENT_STATUS.AVAILABLE ? 1 : 0;
    const statusDelta = statusScore(b) - statusScore(a);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const heartbeatDelta = heartbeatMs(b) - heartbeatMs(a);
    if (heartbeatDelta !== 0) {
      return heartbeatDelta;
    }

    return registeredMs(b) - registeredMs(a);
  });
}

function formatAmbiguous(matches: RegisteredAgent[]): string {
  return matches
    .map((agent) => `${agent.name} (${agent.agentId} · ${agent.endpoint.url})`)
    .join(", ");
}

/** Resolve a single agent by name or agentId prefix. */
export function resolveAgentByNamePrefix(
  agents: RegisteredAgent[],
  prefix: string,
): RegisteredAgent {
  const trimmed = prefix.trim();
  if (!trimmed) {
    throw new Error("agent name prefix is required");
  }

  const matches = agents.filter((agent) => matchesPrefix(agent, trimmed));

  if (matches.length === 0) {
    throw new Error(`no agent with name prefix "${trimmed}"`);
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  const distinctNames = new Set(matches.map((agent) => agent.name.toLowerCase()));
  if (distinctNames.size > 1) {
    throw new Error(
      `ambiguous name prefix "${trimmed}" (matches: ${formatAmbiguous(matches)})`,
    );
  }

  const [best] = rankMatches(matches);
  if (!best) {
    throw new Error(`no agent with name prefix "${trimmed}"`);
  }

  const tied = rankMatches(matches).filter(
    (agent) =>
      agent.status === best.status &&
      heartbeatMs(agent) === heartbeatMs(best) &&
      registeredMs(agent) === registeredMs(best),
  );

  if (tied.length > 1) {
    throw new Error(
      `ambiguous name prefix "${trimmed}" (matches: ${formatAmbiguous(tied)})`,
    );
  }

  return best;
}
