/** Strip `node` and script path from argv for Commander. */
export function userArgv(argv: readonly string[]): string[] {
  return argv.slice(2);
}
