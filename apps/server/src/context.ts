import { CanvasClient } from "@acacia/canvas-client";
import { ConfigStore, NoopProposer, type Proposer } from "@acacia/course-config";
import { Db, Repo } from "@acacia/db";
import { env } from "./env.ts";

/** Shared singletons for the server process. */
export interface AppContext {
  db: Db;
  repo: Repo;
  client: CanvasClient;
  configs: ConfigStore;
  proposer: Proposer;
  log: (msg: string) => void;
}

export function createContext(): AppContext {
  const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  const db = new Db(env.dbPath);
  const configs = new ConfigStore(env.configDir);
  configs.ensureDefaults();
  return {
    db,
    repo: new Repo(db),
    client: new CanvasClient({ baseUrl: env.canvasBaseUrl, token: env.canvasToken, logger: log }),
    configs,
    proposer: new NoopProposer(),
    log,
  };
}
