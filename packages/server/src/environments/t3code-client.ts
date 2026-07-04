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
const OAUTH_TOKEN_PATH = "/oauth/token";
const CLIENTS_PATH = "/api/auth/clients";
const CLIENTS_REVOKE_PATH = "/api/auth/clients/revoke";
const PAIRING_TOKEN_PATH = "/api/auth/pairing-token";
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

const T3AccessTokenResult = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.Literals(["Bearer", "DPoP"]),
  expires_in: Schema.Number,
});

const T3PairingCredentialResult = Schema.Struct({
  credential: Schema.String,
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

export const exchangePairingCodeForBearerToken = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  pairingCode: string,
  scopes: ReadonlyArray<string>,
) =>
  exchangePairingCodeForBearerAccessToken(client, internalHttpBaseUrl, pairingCode, scopes).pipe(
    Effect.map((token) => token.accessToken),
  );

export const exchangePairingCodeForBearerAccessToken = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  pairingCode: string,
  scopes: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, OAUTH_TOKEN_PATH);
    const response = yield* client
      .post(url, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: HttpBody.text(
          new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token: pairingCode,
            subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
            requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
            scope: scopes.join(" "),
            client_label: "gateway",
            client_device_type: "bot",
          }).toString(),
          "application/x-www-form-urlencoded",
        ),
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new EnvironmentFailure({
              message: `Could not exchange pairing code at ${url}: ${error.message}`,
            }),
        ),
      );

    if (response.status === 401 || response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Pairing code was rejected by the environment",
      });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Pairing code exchange failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const token = yield* Schema.decodeUnknownEffect(T3AccessTokenResult)(parsed).pipe(
      Effect.mapError(
        () => new EnvironmentFailure({ message: "Environment returned an invalid access token" }),
      ),
    );

    if (token.token_type !== "Bearer") {
      return yield* new EnvironmentFailure({
        message: "Environment did not return a bearer token",
      });
    }

    return {
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in,
    };
  });

export const createPairingCredential = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
  input: { readonly label: string; readonly scopes: ReadonlyArray<string> },
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, PAIRING_TOKEN_PATH);
    const response = yield* client
      .post(url, {
        headers: {
          ...bearerAuthHeaders(adminBearerToken),
          "content-type": "application/json",
        },
        body: HttpBody.jsonUnsafe(input),
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new EnvironmentFailure({
              message: `Could not create pairing credential at ${url}: ${error.message}`,
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
        message: `Pairing credential creation failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const credential = yield* Schema.decodeUnknownEffect(T3PairingCredentialResult)(parsed).pipe(
      Effect.mapError(
        () =>
          new EnvironmentFailure({
            message: "Environment returned an invalid pairing credential",
          }),
      ),
    );

    return credential.credential;
  });

export const createBearerTokenForClient = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
  input: { readonly label: string; readonly scopes: ReadonlyArray<string> },
) =>
  Effect.gen(function* () {
    const credential = yield* createPairingCredential(
      client,
      internalHttpBaseUrl,
      adminBearerToken,
      input,
    );
    return yield* exchangePairingCodeForBearerAccessToken(
      client,
      internalHttpBaseUrl,
      credential,
      input.scopes,
    );
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

export const readEnvironmentLabel = (descriptor: unknown) => {
  if (
    typeof descriptor !== "object" ||
    descriptor === null ||
    !("label" in descriptor) ||
    typeof descriptor.label !== "string" ||
    descriptor.label.length === 0
  ) {
    return null;
  }

  return descriptor.label;
};
