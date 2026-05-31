import path from "node:path";

export const MANDATE_FILE = "MANDATE.md";
export const SOUL_FILE = "SOUL.md";
export const IDENTITY_FILE = "IDENTITY.md";
export const USER_FILE = "USER.md";

export function resolveWorkspaceDir(
  agentName: string,
  workspaceDir?: string,
): string {
  if (workspaceDir) {
    return path.resolve(workspaceDir);
  }
  return path.resolve(process.cwd(), "workspace", agentName);
}

export function workspaceFilePaths(workspaceDir: string): {
  mandatePath: string;
  soulPath: string;
  identityPath: string;
  userPath: string;
} {
  return {
    mandatePath: path.join(workspaceDir, MANDATE_FILE),
    soulPath: path.join(workspaceDir, SOUL_FILE),
    identityPath: path.join(workspaceDir, IDENTITY_FILE),
    userPath: path.join(workspaceDir, USER_FILE),
  };
}
