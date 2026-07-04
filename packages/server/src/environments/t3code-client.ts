import type {
  EnvironmentClientSession,
  RevokeEnvironmentClientResponse,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as HttpBody from "effect/unstable/http/HttpBody";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { joinBaseUrl } from "./urls.ts";

const ENVIRONMENT_DESCRIPTOR_PATH = "/.well-known/t3/environment";
const CLIENTS_PATH = "/api/auth/clients";
const CLIENTS_REVOKE_PATH = "/api/auth/clients/revoke";
const ADMIN_TOKEN_CHECK_PATH = CLIENTS_PATH;

const EnvironmentClientMetadataDeviceType = Schema.Literals([
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
]);

const T3ClientSession = Schema.Struct({
  sessionId: Schema.String,
  subject: Schema.String,
  scopes: Schema.Array(Schema.String),
  method: Schema.Literals(["browser-session-cookie", "bearer-access-token", "dpop-access-token"]),
  client: Schema.Struct({
    label: Schema.optional(Schema.String),
    ipAddress: Schema.optional(Schema.String),
    userAgent: Schema.optional(Schema.String),
    deviceType: EnvironmentClientMetadataDeviceType,
    os: Schema.optional(Schema.String),
    browser: Schema.optional(Schema.String),
  }),
  issuedAt: Schema.String,
  expiresAt: Schema.String,
  lastConnectedAt: Schema.NullOr(Schema.String),
  connected: Schema.Boolean,
  current: Schema.Boolean,
});

const T3ClientSessionList = Schema.Array(T3ClientSession);

const T3ClientSessionRevokeResult = Schema.Struct({
  revoked: Schema.Boolean,
});

const readJsonBody = (body: string) =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(body).pipe(
    Effect.mapError(() => new EnvironmentFailure({ message: "Environment returned invalid JSON" })),
  );

const readResponseText = (response: HttpClientResponse.HttpClientResponse) =>
  response.text.pipe(
    Effect.mapError(
      (error) =>
        new EnvironmentFailure({
          message: `Failed to read response body: ${error.message}`,
        }),
    ),
  );

export const fetchEnvironmentDescriptor = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, ENVIRONMENT_DESCRIPTOR_PATH);
    const response = yield* client.get(url).pipe(
      Effect.mapError(
        (error) =>
          new EnvironmentFailure({
            message: `Could not reach environment descriptor at ${url}: ${error.message}`,
          }),
      ),
    );

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Environment descriptor request failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    return yield* readJsonBody(body);
  });

export const validateAdminBearerToken = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, ADMIN_TOKEN_CHECK_PATH);
    const response = yield* client
      .get(url, {
        headers: {
          authorization: `Bearer ${adminBearerToken}`,
        },
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new EnvironmentFailure({
              message: `Could not validate admin token at ${url}: ${error.message}`,
            }),
        ),
      );

    if (response.status === 401 || response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Admin bearer token was rejected by the environment",
      });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Admin token validation failed with status ${response.status}`,
      });
    }
  });

const bearerAuthHeaders = (adminBearerToken: string) => ({
  authorization: `Bearer ${adminBearerToken}`,
});

const mapClientSession = (session: typeof T3ClientSession.Type): EnvironmentClientSession => ({
  sessionId: session.sessionId,
  subject: session.subject,
  scopes: session.scopes,
  method: session.method,
  client: session.client,
  issuedAt: session.issuedAt,
  expiresAt: session.expiresAt,
  lastConnectedAt: session.lastConnectedAt,
  connected: session.connected,
  current: session.current,
});

const decodeClientSessions = (body: unknown) =>
  Schema.decodeUnknownEffect(T3ClientSessionList)(body).pipe(
    Effect.mapError(
      () => new EnvironmentFailure({ message: "Environment returned invalid client sessions" }),
    ),
  );

const decodeClientSessionRevokeResult = (body: unknown) =>
  Schema.decodeUnknownEffect(T3ClientSessionRevokeResult)(body).pipe(
    Effect.mapError(
      () => new EnvironmentFailure({ message: "Environment returned an invalid revoke response" }),
    ),
  );

export const listClientSessions = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, CLIENTS_PATH);
    const response = yield* client
      .get(url, {
        headers: bearerAuthHeaders(adminBearerToken),
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new EnvironmentFailure({
              message: `Could not list client sessions at ${url}: ${error.message}`,
            }),
        ),
      );

    if (response.status === 401 || response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Admin bearer token was rejected by the environment",
      });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Client session list failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const sessions = yield* decodeClientSessions(parsed);
    return sessions.map(mapClientSession);
  });

export const revokeClientSession = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
  sessionId: string,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, CLIENTS_REVOKE_PATH);
    const response = yield* client
      .post(url, {
        headers: {
          ...bearerAuthHeaders(adminBearerToken),
          "content-type": "application/json",
        },
        body: HttpBody.jsonUnsafe({ sessionId }),
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new EnvironmentFailure({
              message: `Could not revoke client session at ${url}: ${error.message}`,
            }),
        ),
      );

    if (response.status === 401) {
      return yield* new EnvironmentFailure({
        message: "Admin bearer token was rejected by the environment",
      });
    }

    if (response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Client session revoke was refused by the environment",
      });
    }

    if (response.status === 404) {
      return yield* new EnvironmentFailure({ message: "Client session was not found" });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Client session revoke failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const result = yield* decodeClientSessionRevokeResult(parsed);
    return result satisfies RevokeEnvironmentClientResponse;
  });

export const readEnvironmentId = (descriptor: unknown) => {
  if (
    typeof descriptor !== "object" ||
    descriptor === null ||
    !("environmentId" in descriptor) ||
    typeof descriptor.environmentId !== "string" ||
    descriptor.environmentId.length === 0
  ) {
    return null;
  }

  return descriptor.environmentId;
};
