import { Command } from "commander";

export type ServerOptions = {
  host: string;
  port: number;
};

export function parseCli(argv: readonly string[] = process.argv): ServerOptions {
  const program = new Command()
    .name("agent-core")
    .description("Digital worker agent core API server")
    .option("-H, --host <host>", "bind host", "127.0.0.1")
    .option("-p, --port <port>", "HTTP port", "3000");

  program.parse([...argv]);

  const opts = program.opts<{ host: string; port: string }>();
  const port = Number(opts.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    program.error(`invalid port: ${opts.port}`);
  }

  return { host: opts.host, port };
}
