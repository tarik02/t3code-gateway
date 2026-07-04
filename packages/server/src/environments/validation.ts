import type { EnvironmentInput } from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { GatewayConfig } from "../config.ts";
import { DatabaseError, GatewayPersistence } from "../db/persistence.ts";
import { DEFAULT_ENVIRONMENT_BROWSER_TOKEN_SCOPES } from "./constants.ts";
import { isDnsSafeSlug } from "./slug.ts";
import {
  exchangePairingCodeForBearerToken,
  fetchEnvironmentDescriptor,
  readEnvironmentId,
  readEnvironmentLabel,
  validateAdminBearerToken,
} from "./t3code-client.ts";
import {
  computePublicUrls,
  deriveWsBaseUrl,
  hasUrlUserinfo,
  isAbsoluteHttpUrl,
  isHttpOriginUrl,
  isAbsoluteWsUrl,
} from "./urls.ts";

export interface ValidatedEnvironmentInput {
  readonly slug: string;
  readonly label: string;
  readonly internalHttpBaseUrl: string;
  readonly internalWsBaseUrl: string;
  readonly adminBearerToken: string;
  readonly browserTokenScopes: ReadonlyArray<string>;
  readonly environmentId: string;
  readonly descriptor: unknown;
  readonly publicHttpBaseUrl: string;
  readonly publicWsBaseUrl: string;
}

export interface EnvironmentValidationContext {
  readonly persistence: GatewayPersistence["Service"];
  readonly config: GatewayConfig;
  readonly client: HttpClient.HttpClient;
}

const resolveBrowserTokenScopes = (scopes: ReadonlyArray<string> | undefined) =>
  scopes === undefined || scopes.length === 0
    ? [...DEFAULT_ENVIRONMENT_BROWSER_TOKEN_SCOPES]
    : [...scopes];

const environmentSlug = (environmentId: string) => `env-${environmentId.toLowerCase()}`;

const ADMIN_TOKEN_SCOPES = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "relay:read",
  "access:read",
  "access:write",
  "relay:write",
] as const;

export const validateEnvironmentInput = (
  context: EnvironmentValidationContext,
  input: EnvironmentInput,
  options?: { readonly excludeEnvironmentId?: string },
): Effect.Effect<ValidatedEnvironmentInput, EnvironmentFailure | DatabaseError> =>
  Effect.gen(function* () {
    const { persistence, config, client } = context;

    const requestedEnvironmentId = input.environmentId ?? "";
    const internalHttpBaseUrl = input.internalHttpBaseUrl;
    const internalWsBaseUrl =
      input.internalWsBaseUrl ??
      (isAbsoluteHttpUrl(internalHttpBaseUrl) ? deriveWsBaseUrl(internalHttpBaseUrl) : "");
    const adminBearerToken = input.adminBearerToken ?? "";
    const pairingCode = input.pairingCode ?? "";

    if (hasUrlUserinfo(internalHttpBaseUrl)) {
      return yield* new EnvironmentFailure({
        message: "Internal HTTP base URL must not include username or password",
      });
    }

    if (!isAbsoluteHttpUrl(internalHttpBaseUrl)) {
      return yield* new EnvironmentFailure({
        message: "Internal HTTP base URL must be an absolute http or https URL",
      });
    }

    if (!isHttpOriginUrl(internalHttpBaseUrl)) {
      return yield* new EnvironmentFailure({
        message: "Host must not include path, query, or fragment",
      });
    }

    if (hasUrlUserinfo(internalWsBaseUrl)) {
      return yield* new EnvironmentFailure({
        message: "Internal WebSocket base URL must not include username or password",
      });
    }

    if (!isAbsoluteWsUrl(internalWsBaseUrl)) {
      return yield* new EnvironmentFailure({
        message: "Internal WebSocket base URL must be an absolute ws or wss URL",
      });
    }

    const descriptor = yield* fetchEnvironmentDescriptor(client, internalHttpBaseUrl);
    const descriptorEnvironmentId = readEnvironmentId(descriptor);
    if (
      requestedEnvironmentId.length > 0 &&
      descriptorEnvironmentId !== null &&
      descriptorEnvironmentId !== requestedEnvironmentId
    ) {
      return yield* new EnvironmentFailure({
        message: "Environment descriptor ID does not match",
      });
    }

    const environmentId = descriptorEnvironmentId ?? requestedEnvironmentId;
    if (environmentId.length === 0) {
      return yield* new EnvironmentFailure({
        message: "Environment descriptor is missing a valid environmentId",
      });
    }

    const slug = input.slug ?? environmentSlug(environmentId);
    const label = input.label ?? readEnvironmentLabel(descriptor) ?? environmentId;

    if (!isDnsSafeSlug(slug)) {
      return yield* new EnvironmentFailure({
        message:
          "Slug must be DNS-safe: lowercase letters, digits, and hyphens, starting with a letter",
      });
    }

    if (label.length === 0) {
      return yield* new EnvironmentFailure({ message: "Label is required" });
    }

    const slugConflict = yield* persistence.findEnvironmentIdBySlug(slug);

    if (slugConflict !== undefined && slugConflict !== options?.excludeEnvironmentId) {
      return yield* new EnvironmentFailure({ message: `Slug "${slug}" is already in use` });
    }

    const environmentIdConflict = yield* persistence.findConflictingEnvironmentId(
      environmentId,
      options?.excludeEnvironmentId,
    );

    if (environmentIdConflict !== undefined) {
      return yield* new EnvironmentFailure({
        message: `Environment ID "${environmentId}" is already registered`,
      });
    }

    const resolvedAdminBearerToken =
      adminBearerToken.length > 0
        ? adminBearerToken
        : pairingCode.length > 0
          ? yield* exchangePairingCodeForBearerToken(
              client,
              internalHttpBaseUrl,
              pairingCode,
              ADMIN_TOKEN_SCOPES,
            )
          : "";

    if (resolvedAdminBearerToken.length > 0) {
      yield* validateAdminBearerToken(client, internalHttpBaseUrl, resolvedAdminBearerToken);
    }

    const publicUrls = computePublicUrls(slug, config.publicBaseDomain);

    return {
      slug,
      label,
      internalHttpBaseUrl,
      internalWsBaseUrl,
      adminBearerToken: resolvedAdminBearerToken,
      browserTokenScopes: resolveBrowserTokenScopes(input.browserTokenScopes),
      environmentId,
      descriptor,
      publicHttpBaseUrl: publicUrls.publicHttpBaseUrl,
      publicWsBaseUrl: publicUrls.publicWsBaseUrl,
    } satisfies ValidatedEnvironmentInput;
  });
