import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteDrizzle from "drizzle-orm/effect-sqlite-node";
import { migrate } from "drizzle-orm/effect-sqlite-node/migrator";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { GatewayRuntimeConfig } from "../config.ts";
import { DatabaseError, migrationError, reasonFromPlatformError } from "./errors.ts";

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

export interface GatewayDatabaseClient extends Effect.Success<
  ReturnType<typeof SqliteDrizzle.makeWithDefaults>
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
    readonly runMigrations: Effect.Effect<void, DatabaseError>;
  }
>()("@t3code-gateway/server/db/database/GatewayDatabase") {}

export const make = Effect.gen(function* () {
  const db = yield* SqliteDrizzle.makeWithDefaults();
  const path = yield* Path.Path;
  const migrationsPath = path.resolve(migrationsFolder);

  return GatewayDatabase.of({
    db,
    runMigrations: migrate(db, { migrationsFolder: migrationsPath }).pipe(
      Effect.asVoid,
      Effect.catchTags(migrationError),
    ),
  });
});

const sqliteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* GatewayRuntimeConfig;
    yield* ensureDatabaseDirectoryForPath(config.databasePath);

    return SqliteClient.layer({
      filename: config.databasePath,
      transformResultNames: (name: string) => name,
    });
  }),
);

export const layer = Layer.effect(GatewayDatabase, make).pipe(Layer.provide(sqliteLayer));
