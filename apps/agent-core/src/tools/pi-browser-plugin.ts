import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** Resolved path to the pi-agent-browser-native extension entry (TypeScript, loaded by pi jiti). */
export function resolvePiAgentBrowserExtensionPath(): string {
  const packageJsonPath = require.resolve("pi-agent-browser-native/package.json");
  return path.join(path.dirname(packageJsonPath), "extensions/agent-browser/index.ts");
}

export const AGENT_BROWSER_TOOL_NAME = "agent_browser";
