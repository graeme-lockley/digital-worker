import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  createBashTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";

/** Standard pi coding-agent tools: read, write, bash, ls. */
export function createBuiltinPiTools(cwd: string): AgentTool[] {
  return [
    createReadTool(cwd),
    createWriteTool(cwd),
    createBashTool(cwd),
    createLsTool(cwd),
  ];
}

export const BUILTIN_PI_TOOL_NAMES = ["read", "write", "bash", "ls"] as const;
