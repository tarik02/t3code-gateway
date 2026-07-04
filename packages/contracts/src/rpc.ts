import * as Schema from "effect/Schema";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

import { GatewaySessionMiddleware } from "./gateway-session.ts";
import { AuthFailure, ChangePasswordRequest, CurrentUser, GatewayStatus } from "./schemas.ts";

export class GetCurrentUser extends Rpc.make("gateway.auth.me", {
  success: Schema.NullOr(CurrentUser),
}).middleware(GatewaySessionMiddleware) {}

export class ChangePassword extends Rpc.make("gateway.auth.changePassword", {
  payload: ChangePasswordRequest,
  error: AuthFailure,
}).middleware(GatewaySessionMiddleware) {}

export class GetGatewayStatus extends Rpc.make("gateway.status", {
  success: GatewayStatus,
}).middleware(GatewaySessionMiddleware) {}

export class GatewayRpcs extends RpcGroup.make(GetCurrentUser, ChangePassword, GetGatewayStatus) {}
