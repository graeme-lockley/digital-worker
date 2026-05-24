import { parseCli } from "./cli.js";
import { HeartbeatMonitor } from "./heartbeat-monitor.js";
import { AgentRegistryStore } from "./store.js";
import { startServer } from "./server.js";

const options = parseCli();
const store = new AgentRegistryStore();
const heartbeatMonitor = new HeartbeatMonitor({
  store,
  intervalMs: options.heartbeatIntervalMs,
  requestTimeoutMs: options.heartbeatTimeoutMs,
});

startServer(options, { store, heartbeatMonitor });
