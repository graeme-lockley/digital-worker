import { parseCli } from "./cli.js";
import { startServer } from "./server.js";
import { WikiIndex } from "./store/wiki-index.js";
import { WikiStore } from "./store/wiki-store.js";

async function main(): Promise<void> {
  const options = parseCli();
  const store = new WikiStore(options.dataDir);
  await store.ensureDirs();

  const seeded = await store.seedIfEmpty(options.seedDir);
  if (seeded) {
    console.log(`seeded wiki pages from ${options.seedDir}`);
  }

  const index = new WikiIndex(store.paths.indexDbPath);
  const chunkCount = await index.reindex(store);
  console.log(`indexed ${chunkCount} wiki chunk(s)`);

  const shutdown = (signal: string): void => {
    console.log(`received ${signal}, stopping agent-wiki`);
    index.close();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  startServer(
    options.host,
    options.port,
    { store, index },
    () => {
      console.log(
        `agent-wiki ready on http://${options.host}:${options.port} (data ${options.dataDir})`,
      );
    },
  );
}

main().catch((error: unknown) => {
  console.error("agent-wiki failed to start:", error);
  process.exit(1);
});
