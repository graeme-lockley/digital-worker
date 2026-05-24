import { parseCli } from "./cli.js";
import { startServer } from "./server.js";

const options = parseCli();
startServer(options);
