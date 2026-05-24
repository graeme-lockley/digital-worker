import {
  AGENT_REGISTER_PATHS,
  type ApiErrorResponse,
  type DeregisterAgentRequest,
  type DeregisterAgentResponse,
  type RegisterAgentRequest,
  type RegisterAgentResponse,
} from "@digital-worker/agent-register-protocol";

export type RegistrationClientOptions = {
  registerUrl: string;
  agentId: string;
  name: string;
  purpose: string;
  skills: string[];
  endpointUrl: string;
  fetchFn?: typeof fetch;
};

export class RegistrationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

export async function registerAgent(
  options: RegistrationClientOptions,
): Promise<RegisterAgentResponse> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL(AGENT_REGISTER_PATHS.register, options.registerUrl);
  const body: RegisterAgentRequest = {
    agentId: options.agentId,
    name: options.name,
    purpose: options.purpose,
    skills: options.skills,
    endpoint: { url: options.endpointUrl },
  };

  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toRegistrationError(response);
  }

  return (await response.json()) as RegisterAgentResponse;
}

export async function deregisterAgent(
  options: Pick<RegistrationClientOptions, "registerUrl" | "agentId" | "fetchFn">,
): Promise<DeregisterAgentResponse> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL(AGENT_REGISTER_PATHS.deregister, options.registerUrl);
  const body: DeregisterAgentRequest = { agentId: options.agentId };

  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toRegistrationError(response);
  }

  return (await response.json()) as DeregisterAgentResponse;
}

async function toRegistrationError(response: Response): Promise<RegistrationError> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    if (body.error) {
      return new RegistrationError(
        response.status,
        body.error.code,
        body.error.message,
      );
    }
  } catch {
    // fall through
  }

  return new RegistrationError(
    response.status,
    "REGISTRATION_FAILED",
    `registration request failed with status ${response.status}`,
  );
}
