import { DatabaseSync } from "node:sqlite";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/sqlite-core/effect/session";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { GatewayRuntimeConfig } from "../config.ts";
import { DatabaseError, migrationError, reasonFromPlatformError } from "./errors.ts";
import * as NodeSqliteDrizzle from "./effect-node-sqlite.ts";

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

export interface GatewayDatabaseClient extends Effect.Success<
  ReturnType<typeof NodeSqliteDrizzle.makeWithDefaults>
> {}

const ensureDatabaseDirectoryForPath = (databasePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const databaseDirectory = path.dirname(databasePath);

    yield* fs.makeDirectory(databaseDirectory, { recursive: true }).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          Effect.fail(
            new DatabaseError({
              operation: "ensureDirectory",
              reason: reasonFromPlatformError(error),
              path: databaseDirectory,
              cause: error,
            }),
          ),
      }),
    );
  });

export class GatewayDatabase extends Context.Service<
  GatewayDatabase,
  {
    readonly db: GatewayDatabaseClient;
    readonly client: DatabaseSync;
    readonly runMigrations: Effect.Effect<void, DatabaseError>;
  }
>()("@t3code-gateway/server/db/database/GatewayDatabase") {}

export const make = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;
  yield* ensureDatabaseDirectoryForPath(config.databasePath);

  const client = yield* Effect.sync(() => new DatabaseSync(config.databasePath));
  const db = yield* NodeSqliteDrizzle.makeWithDefaults(client);
  const path = yield* Path.Path;
  const migrationsPath = path.resolve(migrationsFolder);
  const migrations = readMigrationFiles({ migrationsFolder: migrationsPath });

  return GatewayDatabase.of({
    client,
    db,
    runMigrations: migrate(migrations, db._.session).pipe(
      Effect.asVoid,
      Effect.catchTags(migrationError),
    ),
  });
});

export const layer = Layer.effect(GatewayDatabase, make);
