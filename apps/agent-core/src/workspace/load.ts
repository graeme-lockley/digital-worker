import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { IdentityStore } from "./identity-store.js";
import { UserStore } from "./user-store.js";
import {
  IDENTITY_FILE,
  MANDATE_FILE,
  resolveWorkspaceDir,
  SOUL_FILE,
  USER_FILE,
  workspaceFilePaths,
} from "./paths.js";

export type WorkspaceIdentity = {
  agentName: string;
  workspaceDir: string;
  mandate: string;
  soul: string;
  identity: string;
  user: string;
};

export type LoadedWorkspace = {
  identity: WorkspaceIdentity;
  identityStore: IdentityStore;
  userStore: UserStore;
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
  await assertFileExists(paths.userPath, USER_FILE);

  const [mandate, soul, identity, user] = await Promise.all([
    readFile(paths.mandatePath, "utf-8"),
    readFile(paths.soulPath, "utf-8"),
    readFile(paths.identityPath, "utf-8"),
    readFile(paths.userPath, "utf-8"),
  ]);

  const identityStore = new IdentityStore(paths.identityPath);
  const userStore = new UserStore(paths.userPath);

  return {
    identity: {
      agentName: options.agentName,
      workspaceDir,
      mandate,
      soul,
      identity,
      user,
    },
    identityStore,
    userStore,
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
