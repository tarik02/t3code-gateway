import { GatewayRequestContext } from "@t3code-gateway/contracts/gateway-session";
import { GatewayRpcs } from "@t3code-gateway/contracts/rpc";
import { ChangePasswordRequest } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthService } from "../auth/service.ts";
import { hashSessionToken } from "../auth/session.ts";
import { EnvironmentService } from "../environments/service.ts";
import { mapRpcError } from "../auth/errors.ts";
import { buildGatewayStatus } from "./status.ts";
import { layer as gatewaySessionMiddlewareLayer } from "./gateway-session-middleware.ts";

export const layer = GatewayRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const environments = yield* EnvironmentService;

    return GatewayRpcs.of({
      "gateway.auth.me": () =>
        Effect.gen(function* () {
          const { sessionToken } = yield* GatewayRequestContext;
          return yield* auth.currentUser(sessionToken);
        }).pipe(Effect.orDie),

      "gateway.auth.changePassword": (payload: ChangePasswordRequest) =>
        mapRpcError(
          Effect.gen(function* () {
            const { sessionToken } = yield* GatewayRequestContext;
            yield* auth.changePassword(sessionToken, payload.currentPassword, payload.nextPassword);
          }),
        ),

      "gateway.status": () => buildGatewayStatus,

      "gateway.t3codeCatalog.sync": (payload) =>
        Effect.gen(function* () {
          const { sessionToken } = yield* GatewayRequestContext;
          if (sessionToken === undefined) {
            return yield* Effect.die(
              new Error("Authenticated catalog sync is missing session token"),
            );
          }

          const deviceId = yield* hashSessionToken(sessionToken);
          return yield* environments.syncCatalog(deviceId, payload.installedGatewayEnvironmentIds);
        }).pipe(
          Effect.catch((error: Error) =>
            Effect.logError("gateway.catalogSync.failed", { message: error.message }).pipe(
              Effect.as({
                schemaVersion: 1 as const,
                upsertTargets: [],
                upsertProfiles: [],
                upsertCredentials: [],
                removeEnvironmentIds: [],
              }),
            ),
          ),
        ),
    });
  }),
).pipe(Layer.provide(gatewaySessionMiddlewareLayer));
