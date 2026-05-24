import {
  AGENT_REGISTER_ERROR_CODES,
  AGENT_REGISTER_PATHS,
  type ApiErrorResponse,
  type DeregisterAgentRequest,
  type DeregisterAgentResponse,
  type ListAgentsResponse,
  type RegisterAgentRequest,
  type RegisterAgentResponse,
} from "@digital-worker/agent-register-protocol";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

import type { HeartbeatMonitor } from "./heartbeat-monitor.js";
import { AgentRegistryError, AgentRegistryStore } from "./store.js";
import type { ServerOptions } from "./cli.js";

export type AppDependencies = {
  store: AgentRegistryStore;
  heartbeatMonitor: HeartbeatMonitor;
};

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get(AGENT_REGISTER_PATHS.list, (c) => {
    const body: ListAgentsResponse = { agents: deps.store.list() };
    return c.json(body);
  });

  app.post(AGENT_REGISTER_PATHS.register, async (c) => {
    const body = await parseJson<RegisterAgentRequest>(c);
    if (!body) {
      return jsonError(c, 400, AGENT_REGISTER_ERROR_CODES.INVALID_REQUEST, "invalid JSON body");
    }

    const validationError = validateRegisterRequest(body);
    if (validationError) {
      return jsonError(c, 400, AGENT_REGISTER_ERROR_CODES.INVALID_REQUEST, validationError);
    }

    try {
      const agent = deps.store.register(body);
      const response: RegisterAgentResponse = {
        agentId: agent.agentId,
        status: agent.status,
        registeredAt: agent.registeredAt,
      };
      return c.json(response, 201);
    } catch (error) {
      if (error instanceof AgentRegistryError) {
        const status = error.code === "AGENT_ALREADY_REGISTERED" ? 409 : 400;
        return jsonError(c, status, error.code, error.message);
      }
      throw error;
    }
  });

  app.post(AGENT_REGISTER_PATHS.deregister, async (c) => {
    const body = await parseJson<DeregisterAgentRequest>(c);
    if (!body?.agentId) {
      return jsonError(c, 400, AGENT_REGISTER_ERROR_CODES.INVALID_REQUEST, "agentId is required");
    }

    try {
      deps.store.deregister(body.agentId);
      const response: DeregisterAgentResponse = {
        agentId: body.agentId,
        deregisteredAt: new Date().toISOString(),
      };
      return c.json(response);
    } catch (error) {
      if (error instanceof AgentRegistryError) {
        return jsonError(
          c,
          404,
          AGENT_REGISTER_ERROR_CODES.AGENT_NOT_FOUND,
          error.message,
        );
      }
      throw error;
    }
  });

  return app;
}

export function startServer(options: ServerOptions, deps: AppDependencies): void {
  deps.heartbeatMonitor.start();
  const app = createApp(deps);

  serve(
    {
      fetch: app.fetch,
      hostname: options.host,
      port: options.port,
    },
    (info) => {
      console.log(`agent-register listening on http://${info.address}:${info.port}`);
    },
  );
}

async function parseJson<T>(c: { req: { json: () => Promise<T> } }): Promise<T | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function validateRegisterRequest(body: RegisterAgentRequest): string | undefined {
  if (!body.agentId?.trim()) {
    return "agentId is required";
  }
  if (!body.name?.trim()) {
    return "name is required";
  }
  if (!body.purpose?.trim()) {
    return "purpose is required";
  }
  if (!Array.isArray(body.skills)) {
    return "skills must be an array";
  }
  if (!body.endpoint?.url?.trim()) {
    return "endpoint.url is required";
  }

  try {
    new URL(body.endpoint.url);
  } catch {
    return "endpoint.url must be a valid URL";
  }

  return undefined;
}

function jsonError(
  c: { json: (data: ApiErrorResponse, status?: number) => Response },
  status: number,
  code: string,
  message: string,
): Response {
  const body: ApiErrorResponse = { error: { code, message } };
  return c.json(body, status);
}
