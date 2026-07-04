import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { GatewayRuntimeConfig } from "../config.ts";
import { GatewayDb } from "./client.ts";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

export const ensureDatabaseDirectoryForPath = (databasePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const databaseDirectory = path.dirname(databasePath);

    yield* fs
      .makeDirectory(databaseDirectory, { recursive: true })
      .pipe(Effect.catchTag("PlatformError", () => Effect.void));
  });

export const ensureDatabaseDirectory = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;
  yield* ensureDatabaseDirectoryForPath(config.databasePath);
});

export const runMigrations = Effect.gen(function* () {
  const db = yield* GatewayDb;
  const path = yield* Path.Path;
  const migrationsPath = path.resolve(migrationsFolder);

  yield* Effect.sync(() => {
    migrate(db, { migrationsFolder: migrationsPath });
  });
});

export const migrationsFolderPath = migrationsFolder;
