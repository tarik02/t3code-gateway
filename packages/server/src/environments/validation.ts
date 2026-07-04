import type { EnvironmentInput } from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import { and, eq, ne } from "drizzle-orm";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { GatewayConfig } from "../config.ts";
import type { GatewayDatabase } from "../db/client.ts";
import { environments } from "../db/schema.ts";
import { DEFAULT_ENVIRONMENT_BROWSER_TOKEN_SCOPES } from "./constants.ts";
import { DatabaseError } from "./errors.ts";
import { isDnsSafeSlug } from "./slug.ts";
import {
  fetchEnvironmentDescriptor,
  readEnvironmentId,
  validateAdminBearerToken,
} from "./t3code-client.ts";
import {
  computePublicUrls,
  isAbsoluteHttpUrl,
  isAbsoluteWsUrl,
  stripTrailingSlash,
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
  readonly db: GatewayDatabase;
  readonly config: GatewayConfig;
  readonly client: HttpClient.HttpClient;
}

const dbEffect = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) =>
      new DatabaseError({
        message: cause instanceof Error ? cause.message : "Database operation failed",
      }),
  });

const resolveBrowserTokenScopes = (scopes: ReadonlyArray<string> | undefined) =>
  scopes === undefined || scopes.length === 0
    ? [...DEFAULT_ENVIRONMENT_BROWSER_TOKEN_SCOPES]
    : [...scopes];

export const validateEnvironmentInput = (
  context: EnvironmentValidationContext,
  input: EnvironmentInput,
  options?: { readonly excludeEnvironmentId?: string },
): Effect.Effect<ValidatedEnvironmentInput, EnvironmentFailure | DatabaseError> =>
  Effect.gen(function* () {
    const { db, config, client } = context;

    const slug = input.slug.trim();
    const label = input.label.trim();
    const internalHttpBaseUrl = stripTrailingSlash(input.internalHttpBaseUrl.trim());
    const internalWsBaseUrl = stripTrailingSlash(input.internalWsBaseUrl.trim());
    const adminBearerToken = input.adminBearerToken.trim();

    if (!isDnsSafeSlug(slug)) {
      return yield* new EnvironmentFailure({
        message:
          "Slug must be DNS-safe: lowercase letters, digits, and hyphens, starting with a letter",
      });
    }

    if (label.length === 0) {
      return yield* new EnvironmentFailure({ message: "Label is required" });
    }

    if (!isAbsoluteHttpUrl(internalHttpBaseUrl)) {
      return yield* new EnvironmentFailure({
        message: "Internal HTTP base URL must be an absolute http or https URL",
      });
    }

    if (!isAbsoluteWsUrl(internalWsBaseUrl)) {
      return yield* new EnvironmentFailure({
        message: "Internal WebSocket base URL must be an absolute ws or wss URL",
      });
    }

    if (adminBearerToken.length === 0) {
      return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
    }

    const slugConflict = yield* dbEffect(() =>
      db
        .select({ environmentId: environments.environmentId })
        .from(environments)
        .where(eq(environments.slug, slug))
        .get(),
    );

    if (
      slugConflict !== undefined &&
      slugConflict.environmentId !== options?.excludeEnvironmentId
    ) {
      return yield* new EnvironmentFailure({ message: `Slug "${slug}" is already in use` });
    }

    const descriptor = yield* fetchEnvironmentDescriptor(client, internalHttpBaseUrl);
    const environmentId = readEnvironmentId(descriptor);
    if (environmentId === null) {
      return yield* new EnvironmentFailure({
        message: "Environment descriptor is missing a valid environmentId",
      });
    }

    const environmentIdConflict = yield* dbEffect(() =>
      db
        .select({ environmentId: environments.environmentId })
        .from(environments)
        .where(
          options?.excludeEnvironmentId === undefined
            ? eq(environments.environmentId, environmentId)
            : and(
                eq(environments.environmentId, environmentId),
                ne(environments.environmentId, options.excludeEnvironmentId),
              ),
        )
        .get(),
    );

    if (environmentIdConflict !== undefined) {
      return yield* new EnvironmentFailure({
        message: `Environment ID "${environmentId}" is already registered`,
      });
    }

    yield* validateAdminBearerToken(client, internalHttpBaseUrl, adminBearerToken);

    const publicUrls = computePublicUrls(slug, config.publicBaseDomain);

    return {
      slug,
      label,
      internalHttpBaseUrl,
      internalWsBaseUrl,
      adminBearerToken,
      browserTokenScopes: resolveBrowserTokenScopes(input.browserTokenScopes),
      environmentId,
      descriptor,
      publicHttpBaseUrl: publicUrls.publicHttpBaseUrl,
      publicWsBaseUrl: publicUrls.publicWsBaseUrl,
    } satisfies ValidatedEnvironmentInput;
  });
