#!/usr/bin/env node
import { render } from "ink";
import React from "react";

import { parseCli } from "./cli.js";
import {
  fetchAgents,
  RegistryError,
  resolveAgentByNamePrefix,
} from "./registry.js";
import { resolveAgentChatUrl } from "./resolve-agent-url.js";
import { promptAgentSelection } from "./select-agent.js";
import { App } from "./ui/App.js";

async function main(): Promise<void> {
  const options = parseCli();
  const agents = await fetchAgents(options.registerUrl);

  const agent = options.agentNamePrefix
    ? resolveAgentByNamePrefix(agents, options.agentNamePrefix)
    : await promptAgentSelection(agents);

  const clientId = crypto.randomUUID();
  const agentChatUrl = resolveAgentChatUrl(agent, options.registerUrl);

  render(
    <App
      agentName={agent.name}
      agentBaseUrl={agentChatUrl}
      registeredEndpoint={agent.endpoint.url}
      clientId={clientId}
    />,
  );
}

main().catch((error: unknown) => {
  if (error instanceof RegistryError) {
    console.error(`agent-tui: ${error.message}`);
  } else {
    console.error("agent-tui:", error);
  }
  process.exit(1);
});
