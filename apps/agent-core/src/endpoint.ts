/** Hostname other services should use to reach this agent. */
export function resolveAdvertisedHost(bindHost: string): string {
  if (bindHost === "0.0.0.0" || bindHost === "::") {
    return "127.0.0.1";
  }
  return bindHost;
}

export function buildAgentEndpointUrl(host: string, port: number): string {
  return `http://${resolveAdvertisedHost(host)}:${port}`;
}
