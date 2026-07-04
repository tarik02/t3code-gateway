import * as Schema from "effect/Schema";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

import {
  CatalogSyncRequest,
  CatalogSyncResponse,
  ChangePasswordRequest,
  CurrentUser,
  GatewayStatus,
  LoginRequest,
  LoginResponse,
} from "./schemas.ts";

export class Login extends Rpc.make("gateway.auth.login", {
  payload: LoginRequest,
  success: LoginResponse,
}) {}

export class Logout extends Rpc.make("gateway.auth.logout") {}

export class GetCurrentUser extends Rpc.make("gateway.auth.me", {
  success: Schema.NullOr(CurrentUser),
}) {}

export class ChangePassword extends Rpc.make("gateway.auth.changePassword", {
  payload: ChangePasswordRequest,
}) {}

export class GetGatewayStatus extends Rpc.make("gateway.status", {
  success: GatewayStatus,
}) {}

export class SyncT3CodeCatalog extends Rpc.make("gateway.t3codeCatalog.sync", {
  payload: CatalogSyncRequest,
  success: CatalogSyncResponse,
}) {}

export class GatewayRpcs extends RpcGroup.make(
  Login,
  Logout,
  GetCurrentUser,
  ChangePassword,
  GetGatewayStatus,
  SyncT3CodeCatalog,
) {}
