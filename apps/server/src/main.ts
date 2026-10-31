import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { relative } from "node:path";
import { createContext } from "./context.ts";
import { env } from "./env.ts";
import { createApi } from "./routes.ts";
import { SyncService } from "./services/sync-service.ts";

const ctx = createContext();
const sync = new SyncService(ctx);

const app = new Hono();
app.route("/api", createApi(ctx, sync));

// Serve the built web app when present (production mode). In dev, Vite proxies /api.
const dist = env.webDistDir;
if (dist) {
  const root = relative(process.cwd(), dist) || ".";
  app.use("/*", serveStatic({ root }));
  app.get("*", serveStatic({ root, path: "index.html" }));
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  ctx.log(`API listening on http://localhost:${info.port}/api`);
  if (dist) ctx.log(`serving web UI from ${dist}`);
});

sync.startScheduler(env.syncIntervalMinutes);
if (!ctx.db.getMeta("first_sync_at")) {
  ctx.log("no data yet; running initial sync");
  void sync.trigger().catch((e) => ctx.log(`initial sync failed: ${e.message}`));
}

process.on("SIGINT", () => {
  sync.stop();
  ctx.db.close();
  process.exit(0);
});
