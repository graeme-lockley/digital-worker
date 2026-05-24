import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { IdentityStore } from "./identity-store.js";
import {
  IDENTITY_FILE,
  MANDATE_FILE,
  resolveWorkspaceDir,
  SOUL_FILE,
  workspaceFilePaths,
} from "./paths.js";

export type WorkspaceIdentity = {
  agentName: string;
  workspaceDir: string;
  mandate: string;
  soul: string;
  identity: string;
};

export type LoadedWorkspace = {
  identity: WorkspaceIdentity;
  identityStore: IdentityStore;
};

export async function loadWorkspace(options: {
  agentName: string;
  workspaceDir?: string;
}): Promise<LoadedWorkspace> {
  const workspaceDir = resolveWorkspaceDir(
    options.agentName,
    options.workspaceDir,
  );
  const paths = workspaceFilePaths(workspaceDir);

  await assertFileExists(paths.mandatePath, MANDATE_FILE);
  await assertFileExists(paths.soulPath, SOUL_FILE);
  await assertFileExists(paths.identityPath, IDENTITY_FILE);

  const [mandate, soul, identity] = await Promise.all([
    readFile(paths.mandatePath, "utf-8"),
    readFile(paths.soulPath, "utf-8"),
    readFile(paths.identityPath, "utf-8"),
  ]);

  const identityStore = new IdentityStore(paths.identityPath);

  return {
    identity: {
      agentName: options.agentName,
      workspaceDir,
      mandate,
      soul,
      identity,
    },
    identityStore,
  };
}

async function assertFileExists(
  filePath: string,
  label: string,
): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`workspace missing required file: ${label} (${filePath})`);
  }
}

export function workspaceDirForAgent(agentName: string): string {
  return path.resolve(process.cwd(), "workspace", agentName);
}
