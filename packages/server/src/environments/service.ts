import type {
  CreateEnvironmentPairingLinkRequest,
  EnvironmentClientSession,
  EnvironmentInput,
  EnvironmentPairingLink,
  EnvironmentRecord,
  RevokeEnvironmentClientResponse,
  T3CodeCatalogEntryRequest,
  T3CodeCatalogEntryResponse,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import { and, eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { SecretEncryption, SecretEncryptionError } from "../crypto/secret-encryption.ts";
import { GatewayRuntimeConfig } from "../config.ts";
import { GatewayDb } from "../db/client.ts";
import { deviceSessions, environments } from "../db/schema.ts";
import { DatabaseError } from "./errors.ts";
import {
  decodeStringArrayJson,
  decodeUnknownJson,
  encodeStringArrayJson,
  encodeUnknownJson,
} from "./json-codecs.ts";
import { validateEnvironmentInput } from "./validation.ts";
import {
  createBearerTokenForClient,
  createPairingCredential,
  listClientSessions,
  revokeClientSession,
} from "./t3code-client.ts";
import * as Layer from "effect/Layer";

type EnvironmentRow = typeof environments.$inferSelect;

export class EnvironmentService extends Context.Service<
  EnvironmentService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<EnvironmentRecord>, DatabaseError>;
    readonly get: (
      environmentId: string,
    ) => Effect.Effect<EnvironmentRecord, EnvironmentFailure | DatabaseError>;
    readonly create: (
      input: EnvironmentInput,
    ) => Effect.Effect<EnvironmentRecord, EnvironmentFailure | DatabaseError>;
    readonly update: (
      environmentId: string,
      input: UpdateEnvironmentRequest,
    ) => Effect.Effect<EnvironmentRecord, EnvironmentFailure | DatabaseError>;
    readonly remove: (
      environmentId: string,
    ) => Effect.Effect<void, EnvironmentFailure | DatabaseError>;
    readonly validate: (
      input: EnvironmentInput,
    ) => Effect.Effect<ValidateEnvironmentResponse, EnvironmentFailure | DatabaseError>;
    readonly validateForEdit: (
      environmentId: string,
      input: EnvironmentInput,
    ) => Effect.Effect<ValidateEnvironmentResponse, EnvironmentFailure | DatabaseError>;
    readonly listClients: (
      environmentId: string,
    ) => Effect.Effect<ReadonlyArray<EnvironmentClientSession>, EnvironmentFailure | DatabaseError>;
    readonly createPairingLink: (
      environmentId: string,
      input: CreateEnvironmentPairingLinkRequest,
    ) => Effect.Effect<EnvironmentPairingLink, EnvironmentFailure | DatabaseError>;
    readonly createT3CodeCatalogEntry: (
      deviceId: string,
      environmentId: string,
      input: T3CodeCatalogEntryRequest,
    ) => Effect.Effect<T3CodeCatalogEntryResponse, EnvironmentFailure | DatabaseError>;
    readonly revokeClient: (
      environmentId: string,
      sessionId: string,
    ) => Effect.Effect<RevokeEnvironmentClientResponse, EnvironmentFailure | DatabaseError>;
  }
>()("@t3code-gateway/server/environments/service/EnvironmentService") {}

const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());

const dbEffect = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) =>
      new DatabaseError({
        message: cause instanceof Error ? cause.message : "Database operation failed",
      }),
  });

const rowToRecord = (row: EnvironmentRow): EnvironmentRecord => ({
  environmentId: row.environmentId,
  slug: row.slug,
  label: row.label,
  enabled: row.enabled,
  endpoint: row.internalHttpBaseUrl,
  publicHttpBaseUrl: row.publicHttpBaseUrl,
  publicWsBaseUrl: row.publicWsBaseUrl,
  descriptor:
    row.descriptorJson === null || row.descriptorJson === undefined
      ? undefined
      : decodeUnknownJson(row.descriptorJson),
  browserTokenScopes: decodeStringArrayJson(row.browserTokenScopesJson),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastHealthStatus: row.lastHealthStatus ?? undefined,
  lastHealthCheckedAt: row.lastHealthCheckedAt ?? undefined,
  lastHealthError: row.lastHealthError ?? undefined,
  lastCatalogSyncStatus: row.lastCatalogSyncStatus ?? undefined,
  lastCatalogSyncedAt: row.lastCatalogSyncedAt ?? undefined,
  lastCatalogSyncError: row.lastCatalogSyncError ?? undefined,
});

const resolveGatewayRole = (
  session: EnvironmentClientSession,
  adminTokenSessionId: string | null,
  deviceSessionIds: ReadonlySet<string>,
): EnvironmentClientSession["gatewayRole"] => {
  if (session.current || session.sessionId === adminTokenSessionId) {
    return "admin";
  }

  if (deviceSessionIds.has(session.sessionId)) {
    return "device";
  }

  return undefined;
};

const gatewayConnectionId = (environmentId: string) => `gateway:${environmentId}`;

const expiresAtFromNow = (expiresInSeconds: number) =>
  DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { seconds: expiresInSeconds }));

const buildPairingUrl = (publicHttpBaseUrl: string, credential: string) => {
  const url = new URL(publicHttpBaseUrl);
  url.pathname = "/pair";
  url.search = "";
  url.hash = new URLSearchParams([["token", credential]]).toString();
  return url.toString();
};

const makeEnvironmentService = Effect.gen(function* () {
  const db = yield* GatewayDb;
  const secrets = yield* SecretEncryption;
  const config = yield* GatewayRuntimeConfig;
  const client = yield* HttpClient.HttpClient;
  const validationContext = { db, config, client };

  const loadEnvironmentRow = (environmentId: string) =>
    dbEffect(() =>
      db.select().from(environments).where(eq(environments.environmentId, environmentId)).get(),
    );

  const decryptAdminToken = (encryptedToken: Buffer) =>
    secrets
      .decrypt(encryptedToken)
      .pipe(
        Effect.mapError(
          (error: SecretEncryptionError) => new DatabaseError({ message: error.message }),
        ),
      );

  const list = () =>
    Effect.gen(function* () {
      const rows = yield* dbEffect(() => db.select().from(environments).all());
      return rows.map(rowToRecord);
    });

  const get = (environmentId: string) =>
    Effect.gen(function* () {
      const row = yield* dbEffect(() =>
        db.select().from(environments).where(eq(environments.environmentId, environmentId)).get(),
      );

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      return rowToRecord(row);
    });

  const create = (input: EnvironmentInput) =>
    Effect.gen(function* () {
      const validated = yield* validateEnvironmentInput(validationContext, input);
      const encryptedToken = yield* secrets
        .encrypt(validated.adminBearerToken)
        .pipe(Effect.mapError((error) => new DatabaseError({ message: error.message })));
      const timestamp = nowIso();

      yield* dbEffect(() =>
        db
          .insert(environments)
          .values({
            environmentId: validated.environmentId,
            slug: validated.slug,
            label: validated.label,
            enabled: true,
            internalHttpBaseUrl: validated.internalHttpBaseUrl,
            internalWsBaseUrl: validated.internalWsBaseUrl,
            publicHttpBaseUrl: validated.publicHttpBaseUrl,
            publicWsBaseUrl: validated.publicWsBaseUrl,
            descriptorJson: encodeUnknownJson(validated.descriptor),
            browserTokenScopesJson: encodeStringArrayJson(validated.browserTokenScopes),
            adminTokenEncrypted: encryptedToken,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run(),
      );

      return yield* get(validated.environmentId);
    });

  const update = (environmentId: string, input: UpdateEnvironmentRequest) =>
    Effect.gen(function* () {
      const existing = yield* dbEffect(() =>
        db.select().from(environments).where(eq(environments.environmentId, environmentId)).get(),
      );

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const needsRevalidation =
        input.slug !== undefined ||
        input.endpoint !== undefined ||
        input.adminBearerToken !== undefined;

      let nextValues: {
        slug: string;
        label: string;
        internalHttpBaseUrl: string;
        internalWsBaseUrl: string;
        publicHttpBaseUrl: string;
        publicWsBaseUrl: string;
        descriptorJson: string;
        browserTokenScopesJson: string;
        adminTokenEncrypted: Buffer;
        enabled: boolean;
      };

      if (needsRevalidation) {
        const decryptedToken = yield* secrets
          .decrypt(existing.adminTokenEncrypted)
          .pipe(
            Effect.mapError(
              (error: SecretEncryptionError) => new DatabaseError({ message: error.message }),
            ),
          );

        const validated = yield* validateEnvironmentInput(
          validationContext,
          {
            slug: input.slug ?? existing.slug,
            label: input.label ?? existing.label,
            endpoint: input.endpoint ?? existing.internalHttpBaseUrl,
            adminBearerToken: input.adminBearerToken ?? decryptedToken,
            browserTokenScopes:
              input.browserTokenScopes ?? decodeStringArrayJson(existing.browserTokenScopesJson),
          },
          { excludeEnvironmentId: environmentId },
        );

        if (validated.environmentId !== environmentId) {
          return yield* new EnvironmentFailure({
            message: "Environment descriptor ID does not match the registered environment",
          });
        }

        const encryptedToken = yield* secrets
          .encrypt(validated.adminBearerToken)
          .pipe(
            Effect.mapError(
              (error: SecretEncryptionError) => new DatabaseError({ message: error.message }),
            ),
          );

        nextValues = {
          slug: validated.slug,
          label: validated.label,
          internalHttpBaseUrl: validated.internalHttpBaseUrl,
          internalWsBaseUrl: validated.internalWsBaseUrl,
          publicHttpBaseUrl: validated.publicHttpBaseUrl,
          publicWsBaseUrl: validated.publicWsBaseUrl,
          descriptorJson: encodeUnknownJson(validated.descriptor),
          browserTokenScopesJson: encodeStringArrayJson(validated.browserTokenScopes),
          adminTokenEncrypted: encryptedToken,
          enabled: input.enabled ?? existing.enabled,
        };
      } else {
        nextValues = {
          slug: existing.slug,
          label: input.label ?? existing.label,
          internalHttpBaseUrl: existing.internalHttpBaseUrl,
          internalWsBaseUrl: existing.internalWsBaseUrl,
          publicHttpBaseUrl: existing.publicHttpBaseUrl,
          publicWsBaseUrl: existing.publicWsBaseUrl,
          descriptorJson: existing.descriptorJson ?? encodeUnknownJson(null),
          browserTokenScopesJson: encodeStringArrayJson(
            input.browserTokenScopes ?? decodeStringArrayJson(existing.browserTokenScopesJson),
          ),
          adminTokenEncrypted: existing.adminTokenEncrypted,
          enabled: input.enabled ?? existing.enabled,
        };
      }

      const timestamp = nowIso();
      yield* dbEffect(() =>
        db
          .update(environments)
          .set({
            ...nextValues,
            updatedAt: timestamp,
          })
          .where(eq(environments.environmentId, environmentId))
          .run(),
      );

      return yield* get(environmentId);
    });

  const remove = (environmentId: string) =>
    Effect.gen(function* () {
      const existing = yield* dbEffect(() =>
        db
          .select({ environmentId: environments.environmentId })
          .from(environments)
          .where(eq(environments.environmentId, environmentId))
          .get(),
      );

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      yield* dbEffect(() =>
        db.delete(environments).where(eq(environments.environmentId, environmentId)).run(),
      );
    });

  const validate = (input: EnvironmentInput) =>
    Effect.gen(function* () {
      const validated = yield* validateEnvironmentInput(validationContext, input);
      return {
        environmentId: validated.environmentId,
        descriptor: validated.descriptor,
        publicHttpBaseUrl: validated.publicHttpBaseUrl,
        publicWsBaseUrl: validated.publicWsBaseUrl,
      } satisfies ValidateEnvironmentResponse;
    });

  const validateForEdit = (environmentId: string, input: EnvironmentInput) =>
    Effect.gen(function* () {
      const existing = yield* dbEffect(() =>
        db
          .select({ environmentId: environments.environmentId })
          .from(environments)
          .where(eq(environments.environmentId, environmentId))
          .get(),
      );

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const validated = yield* validateEnvironmentInput(validationContext, input, {
        excludeEnvironmentId: environmentId,
      });

      if (validated.environmentId !== environmentId) {
        return yield* new EnvironmentFailure({
          message: "Environment descriptor ID does not match the registered environment",
        });
      }

      return {
        environmentId: validated.environmentId,
        descriptor: validated.descriptor,
        publicHttpBaseUrl: validated.publicHttpBaseUrl,
        publicWsBaseUrl: validated.publicWsBaseUrl,
      } satisfies ValidateEnvironmentResponse;
    });

  const listClients = (environmentId: string) =>
    Effect.gen(function* () {
      const row = yield* loadEnvironmentRow(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const adminBearerToken = yield* decryptAdminToken(row.adminTokenEncrypted);
      if (adminBearerToken.length === 0) {
        return [];
      }

      const sessions = yield* listClientSessions(client, row.internalHttpBaseUrl, adminBearerToken);
      const deviceRows = yield* dbEffect(() =>
        db
          .select({ environmentSessionId: deviceSessions.environmentSessionId })
          .from(deviceSessions)
          .where(eq(deviceSessions.environmentId, environmentId))
          .all(),
      );

      const deviceSessionIds = new Set(
        deviceRows
          .map((entry) => entry.environmentSessionId)
          .filter((id): id is string => id !== null && id !== undefined && id.length > 0),
      );

      return sessions.map((session) =>
        Object.assign({}, session, {
          gatewayRole: resolveGatewayRole(session, row.adminTokenSessionId, deviceSessionIds),
        }),
      );
    });

  const createPairingLink = (environmentId: string, input: CreateEnvironmentPairingLinkRequest) =>
    Effect.gen(function* () {
      if (input.label.length === 0) {
        return yield* new EnvironmentFailure({ message: "Client label is required" });
      }
      if (input.scopes.length === 0) {
        return yield* new EnvironmentFailure({ message: "At least one permission is required" });
      }

      const row = yield* loadEnvironmentRow(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const adminBearerToken = yield* decryptAdminToken(row.adminTokenEncrypted);
      if (adminBearerToken.length === 0) {
        return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
      }

      const pairingCode = yield* createPairingCredential(
        client,
        row.internalHttpBaseUrl,
        adminBearerToken,
        input,
      );

      return {
        label: input.label,
        scopes: input.scopes,
        pairingCode,
        pairingUrl: buildPairingUrl(row.publicHttpBaseUrl, pairingCode),
      } satisfies EnvironmentPairingLink;
    });

  const createT3CodeCatalogEntry = (
    deviceId: string,
    environmentId: string,
    input: T3CodeCatalogEntryRequest,
  ) =>
    Effect.gen(function* () {
      const row = yield* loadEnvironmentRow(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      if (!row.enabled) {
        return yield* new EnvironmentFailure({ message: "Environment is disabled", status: 409 });
      }

      const scopes = decodeStringArrayJson(row.browserTokenScopesJson);
      const adminBearerToken = yield* decryptAdminToken(row.adminTokenEncrypted);
      if (adminBearerToken.length === 0) {
        return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
      }

      const bearerToken = yield* createBearerTokenForClient(
        client,
        row.internalHttpBaseUrl,
        adminBearerToken,
        {
          label:
            input.clientLabel === undefined || input.clientLabel.length === 0
              ? "gateway"
              : input.clientLabel,
          scopes,
        },
      );
      const encryptedToken = yield* secrets
        .encrypt(bearerToken.accessToken)
        .pipe(Effect.mapError((error) => new DatabaseError({ message: error.message })));
      const timestamp = nowIso();
      const expiresAt = expiresAtFromNow(bearerToken.expiresInSeconds);

      yield* dbEffect(() =>
        db
          .insert(deviceSessions)
          .values({
            id: `${deviceId}:${row.environmentId}`,
            deviceId,
            environmentId: row.environmentId,
            bearerTokenEncrypted: encryptedToken,
            scopesJson: encodeStringArrayJson(scopes),
            expiresAt,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoUpdate({
            target: [deviceSessions.deviceId, deviceSessions.environmentId],
            set: {
              bearerTokenEncrypted: encryptedToken,
              scopesJson: encodeStringArrayJson(scopes),
              expiresAt,
              updatedAt: timestamp,
            },
          })
          .run(),
      );

      return {
        schemaVersion: 1 as const,
        target: {
          _tag: "BearerConnectionTarget" as const,
          environmentId: row.environmentId,
          label: row.label,
          connectionId: gatewayConnectionId(row.environmentId),
        },
        profile: {
          _tag: "BearerConnectionProfile" as const,
          connectionId: gatewayConnectionId(row.environmentId),
          environmentId: row.environmentId,
          label: row.label,
          httpBaseUrl: row.publicHttpBaseUrl,
          wsBaseUrl: row.publicWsBaseUrl,
        },
        credential: {
          connectionId: gatewayConnectionId(row.environmentId),
          credential: {
            _tag: "BearerConnectionCredential" as const,
            token: bearerToken.accessToken,
          },
        },
      } satisfies T3CodeCatalogEntryResponse;
    });

  const revokeClient = (environmentId: string, sessionId: string) =>
    Effect.gen(function* () {
      const trimmedSessionId = sessionId.trim();
      if (trimmedSessionId.length === 0) {
        return yield* new EnvironmentFailure({ message: "Client session ID is required" });
      }

      const row = yield* loadEnvironmentRow(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const adminBearerToken = yield* decryptAdminToken(row.adminTokenEncrypted);
      if (adminBearerToken.length === 0) {
        return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
      }

      const result = yield* revokeClientSession(
        client,
        row.internalHttpBaseUrl,
        adminBearerToken,
        trimmedSessionId,
      );

      yield* dbEffect(() =>
        db
          .delete(deviceSessions)
          .where(
            and(
              eq(deviceSessions.environmentId, environmentId),
              eq(deviceSessions.environmentSessionId, trimmedSessionId),
            ),
          )
          .run(),
      );

      return result;
    });

  return EnvironmentService.of({
    list,
    get,
    create,
    update,
    remove,
    validate,
    validateForEdit,
    listClients,
    createPairingLink,
    createT3CodeCatalogEntry,
    revokeClient,
  });
});

export const layer = Layer.effect(EnvironmentService, makeEnvironmentService);
