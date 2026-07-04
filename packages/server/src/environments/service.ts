import type {
  CatalogSyncResponse,
  CreateEnvironmentPairingLinkRequest,
  EnvironmentClientSession,
  EnvironmentInput,
  EnvironmentPairingLink,
  EnvironmentRecord,
  RevokeEnvironmentClientResponse,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { SecretEncryption, SecretEncryptionError } from "../crypto/secret-encryption.ts";
import { GatewayRuntimeConfig } from "../config.ts";
import { EnvironmentRepository, type EnvironmentRow } from "../db/environment-repository.ts";
import { DatabaseError } from "../db/errors.ts";
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
    readonly revokeClient: (
      environmentId: string,
      sessionId: string,
    ) => Effect.Effect<RevokeEnvironmentClientResponse, EnvironmentFailure | DatabaseError>;
    readonly syncCatalog: (
      deviceId: string,
      installedGatewayEnvironmentIds: ReadonlyArray<string>,
    ) => Effect.Effect<CatalogSyncResponse, DatabaseError>;
  }
>()("@t3code-gateway/server/environments/service/EnvironmentService") {}

const rowToRecord = (row: EnvironmentRow): EnvironmentRecord => ({
  environmentId: row.environmentId,
  slug: row.slug,
  label: row.label,
  enabled: row.enabled,
  internalHttpBaseUrl: row.internalHttpBaseUrl,
  internalWsBaseUrl: row.internalWsBaseUrl,
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

type CatalogCredential = CatalogSyncResponse["upsertCredentials"][number];

const buildPairingUrl = (publicHttpBaseUrl: string, credential: string) => {
  const url = new URL(publicHttpBaseUrl);
  url.pathname = "/pair";
  url.search = "";
  url.hash = new URLSearchParams([["token", credential]]).toString();
  return url.toString();
};

const makeEnvironmentService = Effect.gen(function* () {
  const environmentRepository = yield* EnvironmentRepository;
  const secrets = yield* SecretEncryption;
  const config = yield* GatewayRuntimeConfig;
  const client = yield* HttpClient.HttpClient;
  const validationContext = { environmentRepository, config, client };

  const loadEnvironmentRow = (environmentId: string) =>
    environmentRepository.findEnvironment(environmentId);

  const decryptAdminToken = (encryptedToken: Buffer) =>
    secrets
      .decrypt(encryptedToken)
      .pipe(
        Effect.mapError(
          (error: SecretEncryptionError) =>
            new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
        ),
      );

  const list = () =>
    Effect.gen(function* () {
      const rows = yield* environmentRepository.listEnvironments;
      return rows.map(rowToRecord);
    });

  const get = (environmentId: string) =>
    Effect.gen(function* () {
      const row = yield* environmentRepository.findEnvironment(environmentId);

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
        .pipe(
          Effect.mapError(
            (error) =>
              new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
          ),
        );
      const timestamp = DateTime.formatIso(DateTime.nowUnsafe());

      yield* environmentRepository.createEnvironment({
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
      });

      return yield* get(validated.environmentId);
    });

  const update = (environmentId: string, input: UpdateEnvironmentRequest) =>
    Effect.gen(function* () {
      const existing = yield* environmentRepository.findEnvironment(environmentId);

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const needsRevalidation =
        input.slug !== undefined ||
        input.internalHttpBaseUrl !== undefined ||
        input.internalWsBaseUrl !== undefined ||
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
              (error: SecretEncryptionError) =>
                new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
            ),
          );

        const validated = yield* validateEnvironmentInput(
          validationContext,
          {
            slug: input.slug ?? existing.slug,
            label: input.label ?? existing.label,
            internalHttpBaseUrl: input.internalHttpBaseUrl ?? existing.internalHttpBaseUrl,
            internalWsBaseUrl: input.internalWsBaseUrl ?? existing.internalWsBaseUrl,
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
              (error: SecretEncryptionError) =>
                new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
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

      const timestamp = DateTime.formatIso(DateTime.nowUnsafe());
      yield* environmentRepository.updateEnvironment(environmentId, {
        ...nextValues,
        updatedAt: timestamp,
      });

      return yield* get(environmentId);
    });

  const remove = (environmentId: string) =>
    Effect.gen(function* () {
      const existing = yield* environmentRepository.findEnvironment(environmentId);

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      yield* environmentRepository.deleteEnvironment(environmentId);
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
      const existing = yield* environmentRepository.findEnvironment(environmentId);

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
      const deviceSessionIds = new Set(
        yield* environmentRepository.listEnvironmentSessionIds(environmentId),
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

      yield* environmentRepository.deleteDeviceSessionByEnvironmentSession(
        environmentId,
        trimmedSessionId,
      );

      return result;
    });

  const syncCatalog = (deviceId: string, installedGatewayEnvironmentIds: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const installedEnvironmentIds = new Set(installedGatewayEnvironmentIds);
      const rows = yield* environmentRepository.listEnvironments;
      const enabledRows = rows.filter((row) => row.enabled);
      const enabledEnvironmentIds = new Set(enabledRows.map((row) => row.environmentId));

      const upsertCredentials = yield* Effect.forEach(
        enabledRows.filter((row) => !installedEnvironmentIds.has(row.environmentId)),
        (row): Effect.Effect<CatalogCredential | null, never> =>
          Effect.gen(function* () {
            const scopes = decodeStringArrayJson(row.browserTokenScopesJson);
            const adminBearerToken = yield* decryptAdminToken(row.adminTokenEncrypted);
            const bearerToken = yield* createBearerTokenForClient(
              client,
              row.internalHttpBaseUrl,
              adminBearerToken,
              { label: "gateway", scopes },
            );
            const encryptedToken = yield* secrets.encrypt(bearerToken.accessToken).pipe(
              Effect.mapError(
                (error) =>
                  new DatabaseError({
                    operation: "deviceSession",
                    reason: "unknown",
                    cause: error,
                  }),
              ),
            );
            const timestamp = DateTime.formatIso(DateTime.nowUnsafe());
            const expiresAt = expiresAtFromNow(bearerToken.expiresInSeconds);

            yield* environmentRepository.upsertDeviceSession({
              id: `${deviceId}:${row.environmentId}`,
              deviceId,
              environmentId: row.environmentId,
              bearerTokenEncrypted: encryptedToken,
              scopesJson: encodeStringArrayJson(scopes),
              expiresAt,
              createdAt: timestamp,
              updatedAt: timestamp,
            });

            return {
              connectionId: gatewayConnectionId(row.environmentId),
              credential: {
                _tag: "BearerConnectionCredential",
                token: bearerToken.accessToken,
              },
            } satisfies CatalogCredential;
          }).pipe(
            Effect.catchTags({
              EnvironmentFailure: (error) =>
                Effect.logError("gateway.catalogSync.environment.failed", {
                  environmentId: row.environmentId,
                  message: error.message,
                }).pipe(Effect.as(null)),
              DatabaseError: (error) =>
                Effect.logError("gateway.catalogSync.environment.failed", {
                  environmentId: row.environmentId,
                  message: error.message,
                }).pipe(Effect.as(null)),
            }),
          ),
      ).pipe(
        Effect.map((credentials) =>
          credentials.filter((credential): credential is CatalogCredential => credential !== null),
        ),
      );

      return {
        schemaVersion: 1 as const,
        upsertTargets: enabledRows.map((row) => ({
          _tag: "BearerConnectionTarget" as const,
          environmentId: row.environmentId,
          label: row.label,
          connectionId: gatewayConnectionId(row.environmentId),
        })),
        upsertProfiles: enabledRows.map((row) => ({
          _tag: "BearerConnectionProfile" as const,
          connectionId: gatewayConnectionId(row.environmentId),
          environmentId: row.environmentId,
          label: row.label,
          httpBaseUrl: row.publicHttpBaseUrl,
          wsBaseUrl: row.publicWsBaseUrl,
        })),
        upsertCredentials,
        removeEnvironmentIds: installedGatewayEnvironmentIds.filter(
          (environmentId) => !enabledEnvironmentIds.has(environmentId),
        ),
      } satisfies CatalogSyncResponse;
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
    revokeClient,
    syncCatalog,
  });
});

export const layer = Layer.effect(EnvironmentService, makeEnvironmentService);
