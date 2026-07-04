import { GatewayRequestContext } from "@t3code-gateway/contracts/gateway-session";
import { GatewayRpcs } from "@t3code-gateway/contracts/rpc";
import { AuthFailure, ChangePasswordRequest } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthService } from "../auth/service.ts";
import { buildGatewayStatus } from "./status.ts";
import { layer as gatewaySessionMiddlewareLayer } from "./gateway-session-middleware.ts";

export const layer = GatewayRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;

    return GatewayRpcs.of({
      "gateway.auth.me": () =>
        Effect.gen(function* () {
          const { sessionToken } = yield* GatewayRequestContext;
          return yield* auth.currentUser(sessionToken);
        }).pipe(Effect.orDie),

      "gateway.auth.changePassword": (payload: ChangePasswordRequest) =>
        Effect.gen(function* () {
          const { sessionToken } = yield* GatewayRequestContext;
          yield* auth.changePassword(sessionToken, payload.currentPassword, payload.nextPassword);
        }).pipe(
          Effect.catchTags({
            AuthFailure: (error) => Effect.fail(error),
            DatabaseError: (error) => Effect.fail(new AuthFailure({ message: error.message })),
          }),
        ),

      "gateway.status": () => buildGatewayStatus,
    });
  }),
).pipe(Layer.provide(gatewaySessionMiddlewareLayer));
