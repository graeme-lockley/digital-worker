import { existsSync } from "node:fs";
import { spawn as nodeSpawn } from "node:child_process";

import { RESTART_EXIT_CODE } from "./exit-codes.js";

type SpawnFn = typeof nodeSpawn;

/** True when the process should exit for a parent restart loop (Docker entrypoint). */
export function usesRestartLoop(): boolean {
  return (
    process.env.AGENT_CORE_RESTART_LOOP === "1" || existsSync("/.dockerenv")
  );
}

/** Spawn a detached replacement process with the same argv, env, and cwd. */
export function spawnReplacementProcess(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  spawn: SpawnFn = nodeSpawn,
): void {
  const child = spawn(argv[0]!, argv.slice(1), {
    detached: true,
    stdio: "inherit",
    env,
    cwd,
  });
  child.unref();
}

export { RESTART_EXIT_CODE };
