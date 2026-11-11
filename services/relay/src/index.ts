import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { log } from "./log.js";
import { app } from "./server.js";
import { startWatcher } from "./swaps.js";
import { startBuyWatcher } from "./buys.js";

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log("relay", `listening on http://localhost:${info.port} (${config.demo ? "demo" : "live"}, fee ${config.FEE_PERCENT}%)`);
  startWatcher();
  startBuyWatcher();
});
