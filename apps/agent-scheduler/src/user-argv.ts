/** Commander args after node/script; drops `--` separators from pnpm/tsx. */
export function userArgv(argv: readonly string[]): string[] {
  const args = [...argv.slice(2)];
  while (args[0] === "--") {
    args.shift();
  }
  return args;
}
