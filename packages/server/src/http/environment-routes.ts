import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  EnvironmentInput,
  EnvironmentRecord,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { DatabaseError } from "../environments/errors.ts";
import { EnvironmentService } from "../environments/service.ts";
import { TraefikReconciler } from "../traefik/reconciler.ts";

const withJson = <A>(body: A) => HttpServerResponse.json(body).pipe(Effect.orDie);

const environmentFailure = (message: string) =>
  withJson({ error: message }).pipe(
    Effect.map((response) => HttpServerResponse.setStatus(response, 400)),
  );

const notFoundFailure = (message: string) =>
  withJson({ error: message }).pipe(
    Effect.map((response) => HttpServerResponse.setStatus(response, 404)),
  );

const internalFailure = (message: string) =>
  withJson({ error: message }).pipe(
    Effect.map((response) => HttpServerResponse.setStatus(response, 500)),
  );

const withEnvironmentErrors = <R>(
  effect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    EnvironmentFailure | DatabaseError,
    R
  >,
) =>
  effect.pipe(
    Effect.catchTags({
      EnvironmentFailure: (error) =>
        error.message === "Environment not found"
          ? notFoundFailure(error.message)
          : environmentFailure(error.message),
      DatabaseError: (error) => internalFailure(error.message),
    }),
  );

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const environments = yield* EnvironmentService;
    const traefik = yield* TraefikReconciler;

    yield* router.add("GET", "/api/gateway/environments", () =>
      Effect.gen(function* () {
        const items = yield* environments.list();
        return yield* withJson(items satisfies ReadonlyArray<EnvironmentRecord>);
      }).pipe(Effect.catchTag("DatabaseError", (error) => internalFailure(error.message))),
    );

    yield* router.add("POST", "/api/gateway/environments/validate", () =>
      withEnvironmentErrors(
        Effect.gen(function* () {
          const payload = yield* HttpServerRequest.schemaBodyJson(EnvironmentInput).pipe(
            Effect.orDie,
          );
          const result = yield* environments.validate(payload);
          return yield* withJson(result satisfies ValidateEnvironmentResponse);
        }),
      ),
    );

    yield* router.add("POST", "/api/gateway/environments/:environmentId/validate", () =>
      withEnvironmentErrors(
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          const environmentId = params.environmentId;
          if (environmentId === undefined || environmentId.length === 0) {
            return yield* environmentFailure("Environment ID is required");
          }

          const payload = yield* HttpServerRequest.schemaBodyJson(EnvironmentInput).pipe(
            Effect.orDie,
          );
          const result = yield* environments.validateForEdit(environmentId, payload);
          return yield* withJson(result satisfies ValidateEnvironmentResponse);
        }),
      ),
    );

    yield* router.add("POST", "/api/gateway/environments", () =>
      withEnvironmentErrors(
        Effect.gen(function* () {
          const payload = yield* HttpServerRequest.schemaBodyJson(EnvironmentInput).pipe(
            Effect.orDie,
          );
          const created = yield* environments.create(payload);
          yield* traefik.reconcile();
          const response = yield* withJson(created satisfies EnvironmentRecord);
          return HttpServerResponse.setStatus(response, 201);
        }),
      ),
    );

    yield* router.add("GET", "/api/gateway/environments/:environmentId", () =>
      withEnvironmentErrors(
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          const environmentId = params.environmentId;
          if (environmentId === undefined || environmentId.length === 0) {
            return yield* environmentFailure("Environment ID is required");
          }

          const record = yield* environments.get(environmentId);
          return yield* withJson(record satisfies EnvironmentRecord);
        }),
      ),
    );

    yield* router.add("PATCH", "/api/gateway/environments/:environmentId", () =>
      withEnvironmentErrors(
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          const environmentId = params.environmentId;
          if (environmentId === undefined || environmentId.length === 0) {
            return yield* environmentFailure("Environment ID is required");
          }

          const payload = yield* HttpServerRequest.schemaBodyJson(UpdateEnvironmentRequest).pipe(
            Effect.orDie,
          );
          const updated = yield* environments.update(environmentId, payload);
          yield* traefik.reconcile();
          return yield* withJson(updated satisfies EnvironmentRecord);
        }),
      ),
    );

    yield* router.add("DELETE", "/api/gateway/environments/:environmentId", () =>
      withEnvironmentErrors(
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          const environmentId = params.environmentId;
          if (environmentId === undefined || environmentId.length === 0) {
            return yield* environmentFailure("Environment ID is required");
          }

          yield* environments.remove(environmentId);
          yield* traefik.reconcile();
          return HttpServerResponse.empty({ status: 204 });
        }),
      ),
    );
  }),
);
