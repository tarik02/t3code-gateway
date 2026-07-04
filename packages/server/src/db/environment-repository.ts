import { and, eq, ne } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { deviceSessions, environments } from "./schema.ts";

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

export class EnvironmentRepository extends Context.Service<
  EnvironmentRepository,
  {
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
>()("@t3code-gateway/server/db/environment-repository/EnvironmentRepository") {}

export const make = Effect.gen(function* () {
  const { db } = yield* GatewayDatabase;

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

  return EnvironmentRepository.of({
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

export const layer = Layer.effect(EnvironmentRepository, make);
