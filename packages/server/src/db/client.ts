import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { DatabaseSync } from "node:sqlite";

import { GatewayRuntimeConfig } from "../config.ts";
import { ensureDatabaseDirectoryForPath } from "./migrate.ts";

export type GatewayDatabase = NodeSQLiteDatabase;

export class GatewayDb extends Context.Service<GatewayDb, GatewayDatabase>()(
  "@t3code-gateway/server/db/client/GatewayDb",
) {}

export const make = (databasePath: string) =>
  Effect.gen(function* () {
    yield* ensureDatabaseDirectoryForPath(databasePath);
    const sqlite = new DatabaseSync(databasePath);
    return drizzle({ client: sqlite });
  });

export const layer = Layer.effect(
  GatewayDb,
  Effect.gen(function* () {
    const config = yield* GatewayRuntimeConfig;
    return yield* make(config.databasePath);
  }),
);
