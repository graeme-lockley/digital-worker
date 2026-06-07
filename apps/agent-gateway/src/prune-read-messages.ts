import { parsePruneCli } from "./prune-cli.js";
import { GatewayStore } from "./store/gateway-store.js";

async function main(): Promise<void> {
  const options = parsePruneCli();
  const store = await GatewayStore.create(options.dbUrl, {
    authToken: options.dbAuthToken,
  });

  try {
    const deleted = await store.pruneReadMessagesOlderThan(
      options.olderThanDays,
    );
    console.log(
      `pruned ${deleted} read message(s) older than ${options.olderThanDays} days`,
    );
  } finally {
    await store.close();
  }
}

main().catch((error: unknown) => {
  console.error("gateway prune failed:", error);
  process.exit(1);
});
