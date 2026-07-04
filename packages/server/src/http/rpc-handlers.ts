import { GatewayRequestContext } from "@t3code-gateway/contracts/gateway-session";
import {
  CreateEnvironmentPairingLinkPayload,
  CreateT3CodeCatalogEntryPayload,
  EnvironmentIdPayload,
  GatewayRpcs,
  RevokeEnvironmentClientPayload,
  UpdateEnvironmentPayload,
  ValidateEnvironmentForEditPayload,
} from "@t3code-gateway/contracts/rpc";
import {
  AuthFailure,
  ChangePasswordRequest,
  EnvironmentFailure,
  EnvironmentInput,
} from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { AuthService } from "../auth/service.ts";
import { DatabaseError } from "../db/errors.ts";
import { EnvironmentService } from "../environments/service.ts";
import { TraefikReconciler } from "../traefik/reconciler.ts";
import { buildGatewayStatus } from "./status.ts";
import { layer as gatewaySessionMiddlewareLayer } from "./gateway-session-middleware.ts";

const mapEnvironmentRpcError = (error: EnvironmentFailure | DatabaseError) =>
  Schema.is(EnvironmentFailure)(error)
    ? error
    : new EnvironmentFailure({ message: error.message, status: 500 });

const environmentRpc = <A, R>(effect: Effect.Effect<A, EnvironmentFailure | DatabaseError, R>) =>
  effect.pipe(Effect.mapError(mapEnvironmentRpcError));

export const layer = GatewayRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const environments = yield* EnvironmentService;
    const traefik = yield* TraefikReconciler;

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

      "gateway.environments.list": () => environmentRpc(environments.list()),

      "gateway.environments.get": (payload: EnvironmentIdPayload) =>
        environmentRpc(environments.get(payload.environmentId)),

      "gateway.environments.validate": (payload: EnvironmentInput) =>
        environmentRpc(environments.validate(payload)),

      "gateway.environments.validateForEdit": (payload: ValidateEnvironmentForEditPayload) =>
        environmentRpc(environments.validateForEdit(payload.environmentId, payload.input)),

      "gateway.environments.create": (payload: EnvironmentInput) =>
        environmentRpc(
          Effect.gen(function* () {
            const created = yield* environments.create(payload);
            yield* traefik.reconcile();
            return created;
          }),
        ),

      "gateway.environments.update": (payload: UpdateEnvironmentPayload) =>
        environmentRpc(
          Effect.gen(function* () {
            const updated = yield* environments.update(payload.environmentId, payload.input);
            yield* traefik.reconcile();
            return updated;
          }),
        ),

      "gateway.environments.delete": (payload: EnvironmentIdPayload) =>
        environmentRpc(
          Effect.gen(function* () {
            yield* environments.remove(payload.environmentId);
            yield* traefik.reconcile();
          }),
        ),

      "gateway.environments.clients.list": (payload: EnvironmentIdPayload) =>
        environmentRpc(environments.listClients(payload.environmentId)),

      "gateway.environments.pairingLink": (payload: CreateEnvironmentPairingLinkPayload) =>
        environmentRpc(environments.createPairingLink(payload.environmentId, payload.input)),

      "gateway.environments.t3codeCatalogEntry": (payload: CreateT3CodeCatalogEntryPayload) =>
        environmentRpc(environments.createT3CodeCatalogEntry(payload.environmentId, payload.input)),

      "gateway.environments.clients.revoke": (payload: RevokeEnvironmentClientPayload) =>
        environmentRpc(environments.revokeClient(payload.environmentId, payload.sessionId)),

      "gateway.traefik.config": () => traefik.getConfig(),
    });
  }),
).pipe(Layer.provide(gatewaySessionMiddlewareLayer));
