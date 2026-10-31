import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Load .env from the repo root regardless of cwd.
const root = resolve(import.meta.dirname, "../../..");
loadDotenv({ path: resolve(root, ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

export const env = {
  root,
  canvasBaseUrl: required("CANVAS_BASE_URL"),
  canvasToken: required("CANVAS_TOKEN"),
  dataDir: resolve(root, process.env.DATA_DIR ?? "./data"),
  configDir: resolve(root, process.env.CONFIG_DIR ?? "./config"),
  port: Number(process.env.PORT ?? 4800),
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 15),
  get dbPath() {
    return resolve(this.dataDir, "acacia.sqlite");
  },
  get filesDir() {
    return resolve(this.dataDir, "files");
  },
  get webDistDir() {
    const p = resolve(root, "apps/web/dist");
    return existsSync(p) ? p : null;
  },
};
