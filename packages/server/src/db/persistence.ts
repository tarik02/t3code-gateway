import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { and, count, eq, ne } from "drizzle-orm";
import { EffectDrizzleQueryError, MigratorInitError } from "drizzle-orm/effect-core/errors";
import * as SqliteDrizzle from "drizzle-orm/effect-sqlite-node";
import { migrate } from "drizzle-orm/effect-sqlite-node/migrator";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { GatewayRuntimeConfig } from "../config.ts";
import { deviceSessions, environments, userSessions, users } from "./schema.ts";

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

const DatabaseOperation = Schema.Literals([
  "ensureDirectory",
  "migrate",
  "bootstrapUser",
  "authSession",
  "authUser",
  "environment",
  "deviceSession",
]);

type DatabaseOperation = typeof DatabaseOperation.Type;

const DatabaseFailureReason = Schema.Literals([
  "alreadyExists",
  "badArgument",
  "busy",
  "connection",
  "constraint",
  "invalidData",
  "migrationInit",
  "notFound",
  "permissionDenied",
  "query",
  "timeout",
  "unknown",
]);

type DatabaseFailureReason = typeof DatabaseFailureReason.Type;

const databaseMessage = (operation: DatabaseOperation, reason: DatabaseFailureReason) => {
  if (operation === "ensureDirectory") {
    return `Database directory setup failed: ${reason}`;
  }
  if (operation === "migrate") {
    return `Database migration failed: ${reason}`;
  }
  return `Database ${operation} operation failed: ${reason}`;
};

export class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()("DatabaseError", {
  operation: DatabaseOperation,
  reason: DatabaseFailureReason,
  path: Schema.optionalKey(Schema.String),
  cause: Schema.optionalKey(Schema.Unknown),
}) {
  override get message() {
    return databaseMessage(this.operation, this.reason);
  }
}

export interface AuthenticatedUserRow {
  readonly id: string;
  readonly username: string;
}

export interface UserPasswordRow {
  readonly passwordHash: string;
}

export interface UserSessionRow extends AuthenticatedUserRow {
  readonly sessionId: string;
  readonly expiresAt: string;
}

export interface EnvironmentRow {
  readonly environmentId: string;
  readonly slug: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly internalHttpBaseUrl: string;
  readonly internalWsBaseUrl: string;
  readonly publicHttpBaseUrl: string;
  readonly publicWsBaseUrl: string;
  readonly descriptorJson: string | null;
  readonly browserTokenScopesJson: string;
  readonly adminTokenEncrypted: Buffer;
  readonly adminTokenSessionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastHealthStatus: string | null;
  readonly lastHealthCheckedAt: string | null;
  readonly lastHealthError: string | null;
  readonly lastCatalogSyncStatus: string | null;
  readonly lastCatalogSyncedAt: string | null;
  readonly lastCatalogSyncError: string | null;
}

export interface CreateUserInput {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly sessionTokenHash: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface CreateEnvironmentInput {
  readonly environmentId: string;
  readonly slug: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly internalHttpBaseUrl: string;
  readonly internalWsBaseUrl: string;
  readonly publicHttpBaseUrl: string;
  readonly publicWsBaseUrl: string;
  readonly descriptorJson: string;
  readonly browserTokenScopesJson: string;
  readonly adminTokenEncrypted: Buffer;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateEnvironmentInput {
  readonly slug: string;
  readonly label: string;
  readonly internalHttpBaseUrl: string;
  readonly internalWsBaseUrl: string;
  readonly publicHttpBaseUrl: string;
  readonly publicWsBaseUrl: string;
  readonly descriptorJson: string;
  readonly browserTokenScopesJson: string;
  readonly adminTokenEncrypted: Buffer;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export interface UpsertDeviceSessionInput {
  readonly id: string;
  readonly deviceId: string;
  readonly environmentId: string;
  readonly bearerTokenEncrypted: Buffer;
  readonly scopesJson: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const reasonFromPlatformError = (error: PlatformError.PlatformError): DatabaseFailureReason => {
  const tag = error.reason["_tag"];
  if (tag === "AlreadyExists") {
    return "alreadyExists";
  }
  if (tag === "BadResource") {
    return "badArgument";
  }
  if (tag === "Busy") {
    return "busy";
  }
  if (tag === "InvalidData") {
    return "invalidData";
  }
  if (tag === "NotFound") {
    return "notFound";
  }
  if (tag === "PermissionDenied") {
    return "permissionDenied";
  }
  if (tag === "TimedOut") {
    return "timeout";
  }
  return "unknown";
};

const reasonFromSqlError = (error: SqlError): DatabaseFailureReason => {
  const tag = error.reason["_tag"];
  if (tag === "ConnectionError") {
    return "connection";
  }
  if (tag === "ConstraintError" || tag === "UniqueViolation") {
    return "constraint";
  }
  if (tag === "LockTimeoutError" || tag === "StatementTimeoutError") {
    return "timeout";
  }
  return "query";
};

const queryError = (operation: DatabaseOperation) => ({
  EffectDrizzleQueryError: (error: EffectDrizzleQueryError) =>
    Effect.fail(
      new DatabaseError({
        operation,
        reason: "query",
        cause: error,
      }),
    ),
});

const migrationError = {
  EffectDrizzleQueryError: (error: EffectDrizzleQueryError) =>
    Effect.fail(
      new DatabaseError({
        operation: "migrate",
        reason: "query",
        cause: error,
      }),
    ),
  MigratorInitError: (error: MigratorInitError) =>
    Effect.fail(
      new DatabaseError({
        operation: "migrate",
        reason: "migrationInit",
        cause: error,
      }),
    ),
  SqlError: (error: SqlError) =>
    Effect.fail(
      new DatabaseError({
        operation: "migrate",
        reason: reasonFromSqlError(error),
        cause: error,
      }),
    ),
};

const ensureDatabaseDirectoryForPath = (databasePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const databaseDirectory = path.dirname(databasePath);

    yield* fs.makeDirectory(databaseDirectory, { recursive: true }).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(
          new DatabaseError({
            operation: "ensureDirectory",
            reason: reasonFromPlatformError(error),
            path: databaseDirectory,
            cause: error,
          }),
        ),
      ),
    );
  });

export class GatewayPersistence extends Context.Service<
  GatewayPersistence,
  {
    readonly runMigrations: Effect.Effect<void, DatabaseError>;
    readonly countUsers: Effect.Effect<number, DatabaseError>;
    readonly createUser: (input: CreateUserInput) => Effect.Effect<void, DatabaseError>;
    readonly createSession: (input: CreateSessionInput) => Effect.Effect<void, DatabaseError>;
    readonly findSessionUserByTokenHash: (
      sessionTokenHash: string,
    ) => Effect.Effect<UserSessionRow | undefined, DatabaseError>;
    readonly deleteSessionById: (sessionId: string) => Effect.Effect<void, DatabaseError>;
    readonly findUserByUsername: (
      username: string,
    ) => Effect.Effect<(AuthenticatedUserRow & UserPasswordRow) | undefined, DatabaseError>;
    readonly deleteSessionByTokenHash: (
      sessionTokenHash: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly findUserPasswordById: (
      userId: string,
    ) => Effect.Effect<UserPasswordRow | undefined, DatabaseError>;
    readonly updateUserPassword: (
      userId: string,
      passwordHash: string,
      timestamp: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly findSessionIdByTokenHash: (
      sessionTokenHash: string,
    ) => Effect.Effect<string | undefined, DatabaseError>;
    readonly deleteOtherUserSessions: (
      userId: string,
      sessionId: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly listEnvironments: Effect.Effect<ReadonlyArray<EnvironmentRow>, DatabaseError>;
    readonly findEnvironment: (
      environmentId: string,
    ) => Effect.Effect<EnvironmentRow | undefined, DatabaseError>;
    readonly createEnvironment: (
      input: CreateEnvironmentInput,
    ) => Effect.Effect<void, DatabaseError>;
    readonly updateEnvironment: (
      environmentId: string,
      input: UpdateEnvironmentInput,
    ) => Effect.Effect<void, DatabaseError>;
    readonly deleteEnvironment: (environmentId: string) => Effect.Effect<void, DatabaseError>;
    readonly findEnvironmentIdBySlug: (
      slug: string,
    ) => Effect.Effect<string | undefined, DatabaseError>;
    readonly findConflictingEnvironmentId: (
      environmentId: string,
      excludeEnvironmentId: string | undefined,
    ) => Effect.Effect<string | undefined, DatabaseError>;
    readonly listEnvironmentSessionIds: (
      environmentId: string,
    ) => Effect.Effect<ReadonlyArray<string>, DatabaseError>;
    readonly deleteDeviceSessionByEnvironmentSession: (
      environmentId: string,
      sessionId: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly upsertDeviceSession: (
      input: UpsertDeviceSessionInput,
    ) => Effect.Effect<void, DatabaseError>;
  }
>()("@t3code-gateway/server/db/persistence/GatewayPersistence") {}

export const make = Effect.gen(function* () {
  const db = yield* SqliteDrizzle.makeWithDefaults();
  const path = yield* Path.Path;
  const migrationsPath = path.resolve(migrationsFolder);

  const runMigrations = migrate(db, { migrationsFolder: migrationsPath }).pipe(
    Effect.asVoid,
    Effect.catchTags(migrationError),
  );

  const countUsers = db
    .select({ value: count() })
    .from(users)
    .get()
    .pipe(
      Effect.map((row) => row?.value ?? 0),
      Effect.catchTags(queryError("bootstrapUser")),
    );

  const createUser = (input: CreateUserInput) =>
    db
      .insert(users)
      .values(input)
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("bootstrapUser")));

  const createSession = (input: CreateSessionInput) =>
    db
      .insert(userSessions)
      .values(input)
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  const findSessionUserByTokenHash = (sessionTokenHash: string) =>
    db
      .select({
        sessionId: userSessions.id,
        expiresAt: userSessions.expiresAt,
        id: users.id,
        username: users.username,
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.sessionTokenHash, sessionTokenHash))
      .get()
      .pipe(Effect.catchTags(queryError("authSession")));

  const deleteSessionById = (sessionId: string) =>
    db
      .delete(userSessions)
      .where(eq(userSessions.id, sessionId))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  const findUserByUsername = (username: string) =>
    db
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.username, username))
      .get()
      .pipe(Effect.catchTags(queryError("authUser")));

  const deleteSessionByTokenHash = (sessionTokenHash: string) =>
    db
      .delete(userSessions)
      .where(eq(userSessions.sessionTokenHash, sessionTokenHash))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  const findUserPasswordById = (userId: string) =>
    db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get()
      .pipe(Effect.catchTags(queryError("authUser")));

  const updateUserPassword = (userId: string, passwordHash: string, timestamp: string) =>
    db
      .update(users)
      .set({
        passwordHash,
        updatedAt: timestamp,
        passwordChangedAt: timestamp,
      })
      .where(eq(users.id, userId))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authUser")));

  const findSessionIdByTokenHash = (sessionTokenHash: string) =>
    db
      .select({ sessionId: userSessions.id })
      .from(userSessions)
      .where(eq(userSessions.sessionTokenHash, sessionTokenHash))
      .get()
      .pipe(
        Effect.map((row) => row?.sessionId),
        Effect.catchTags(queryError("authSession")),
      );

  const deleteOtherUserSessions = (userId: string, sessionId: string) =>
    db
      .delete(userSessions)
      .where(and(eq(userSessions.userId, userId), ne(userSessions.id, sessionId)))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  const listEnvironments = db
    .select()
    .from(environments)
    .all()
    .pipe(Effect.catchTags(queryError("environment")));

  const findEnvironment = (environmentId: string) =>
    db
      .select()
      .from(environments)
      .where(eq(environments.environmentId, environmentId))
      .get()
      .pipe(Effect.catchTags(queryError("environment")));

  const createEnvironment = (input: CreateEnvironmentInput) =>
    db
      .insert(environments)
      .values(input)
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("environment")));

  const updateEnvironment = (environmentId: string, input: UpdateEnvironmentInput) =>
    db
      .update(environments)
      .set(input)
      .where(eq(environments.environmentId, environmentId))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("environment")));

  const deleteEnvironment = (environmentId: string) =>
    db
      .delete(environments)
      .where(eq(environments.environmentId, environmentId))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("environment")));

  const findEnvironmentIdBySlug = (slug: string) =>
    db
      .select({ environmentId: environments.environmentId })
      .from(environments)
      .where(eq(environments.slug, slug))
      .get()
      .pipe(
        Effect.map((row) => row?.environmentId),
        Effect.catchTags(queryError("environment")),
      );

  const findConflictingEnvironmentId = (
    environmentId: string,
    excludeEnvironmentId: string | undefined,
  ) =>
    db
      .select({ environmentId: environments.environmentId })
      .from(environments)
      .where(
        excludeEnvironmentId === undefined
          ? eq(environments.environmentId, environmentId)
          : and(
              eq(environments.environmentId, environmentId),
              ne(environments.environmentId, excludeEnvironmentId),
            ),
      )
      .get()
      .pipe(
        Effect.map((row) => row?.environmentId),
        Effect.catchTags(queryError("environment")),
      );

  const listEnvironmentSessionIds = (environmentId: string) =>
    db
      .select({ environmentSessionId: deviceSessions.environmentSessionId })
      .from(deviceSessions)
      .where(eq(deviceSessions.environmentId, environmentId))
      .all()
      .pipe(
        Effect.map((rows) =>
          rows.flatMap((entry) =>
            entry.environmentSessionId === null || entry.environmentSessionId.length === 0
              ? []
              : [entry.environmentSessionId],
          ),
        ),
        Effect.catchTags(queryError("deviceSession")),
      );

  const deleteDeviceSessionByEnvironmentSession = (environmentId: string, sessionId: string) =>
    db
      .delete(deviceSessions)
      .where(
        and(
          eq(deviceSessions.environmentId, environmentId),
          eq(deviceSessions.environmentSessionId, sessionId),
        ),
      )
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("deviceSession")));

  const upsertDeviceSession = (input: UpsertDeviceSessionInput) =>
    db
      .insert(deviceSessions)
      .values(input)
      .onConflictDoUpdate({
        target: [deviceSessions.deviceId, deviceSessions.environmentId],
        set: {
          bearerTokenEncrypted: input.bearerTokenEncrypted,
          scopesJson: input.scopesJson,
          expiresAt: input.expiresAt,
          updatedAt: input.updatedAt,
        },
      })
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("deviceSession")));

  return GatewayPersistence.of({
    runMigrations,
    countUsers,
    createUser,
    createSession,
    findSessionUserByTokenHash,
    deleteSessionById,
    findUserByUsername,
    deleteSessionByTokenHash,
    findUserPasswordById,
    updateUserPassword,
    findSessionIdByTokenHash,
    deleteOtherUserSessions,
    listEnvironments,
    findEnvironment,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    findEnvironmentIdBySlug,
    findConflictingEnvironmentId,
    listEnvironmentSessionIds,
    deleteDeviceSessionByEnvironmentSession,
    upsertDeviceSession,
  });
});

const sqliteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* GatewayRuntimeConfig;
    yield* ensureDatabaseDirectoryForPath(config.databasePath);

    return SqliteClient.layer({
      filename: config.databasePath,
      transformResultNames: (name) => name,
    });
  }),
);

export const layer = Layer.effect(GatewayPersistence, make).pipe(Layer.provide(sqliteLayer));
