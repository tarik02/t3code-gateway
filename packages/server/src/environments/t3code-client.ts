import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { joinBaseUrl } from "./urls.ts";

const ENVIRONMENT_DESCRIPTOR_PATH = "/.well-known/t3/environment";
const ADMIN_TOKEN_CHECK_PATH = "/api/auth/clients";

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
