import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { log } from "./log.js";
import { app } from "./server.js";
import { startWatcher } from "./watcher.js";

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log("relay", `listening on http://localhost:${info.port} (${config.NEAR_NETWORK}, factory ${config.FACTORY_ACCOUNT_ID})`);
  startWatcher();
});
