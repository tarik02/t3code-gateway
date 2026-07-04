import * as Schema from "effect/Schema";

export const GatewayStatus = Schema.Struct({
  ok: Schema.Boolean,
  version: Schema.String,
  database: Schema.Struct({
    migrated: Schema.Boolean,
  }),
  t3codeWeb: Schema.Struct({
    buildId: Schema.optional(Schema.String),
  }),
});

export type GatewayStatus = typeof GatewayStatus.Type;

export const LoginRequest = Schema.Struct({
  username: Schema.String,
  password: Schema.String,
});

export type LoginRequest = typeof LoginRequest.Type;

export const CurrentUser = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
});

export type CurrentUser = typeof CurrentUser.Type;

export const LoginResponse = Schema.Struct({
  user: CurrentUser,
});

export type LoginResponse = typeof LoginResponse.Type;

export const ChangePasswordRequest = Schema.Struct({
  currentPassword: Schema.String,
  nextPassword: Schema.String,
});

export type ChangePasswordRequest = typeof ChangePasswordRequest.Type;

export class AuthFailure extends Schema.TaggedErrorClass<AuthFailure>()("AuthFailure", {
  message: Schema.String,
}) {}

export const CatalogSyncRequest = Schema.Struct({
  installedGatewayEnvironmentIds: Schema.Array(Schema.String),
});

export type CatalogSyncRequest = typeof CatalogSyncRequest.Type;

export const BearerConnectionTarget = Schema.TaggedStruct("BearerConnectionTarget", {
  environmentId: Schema.String,
  label: Schema.String,
  connectionId: Schema.String,
});

export type BearerConnectionTarget = typeof BearerConnectionTarget.Type;

export const BearerConnectionProfile = Schema.TaggedStruct("BearerConnectionProfile", {
  connectionId: Schema.String,
  environmentId: Schema.String,
  label: Schema.String,
  httpBaseUrl: Schema.String,
  wsBaseUrl: Schema.String,
});

export type BearerConnectionProfile = typeof BearerConnectionProfile.Type;

export const StoredConnectionCredential = Schema.Struct({
  connectionId: Schema.String,
  credential: Schema.TaggedStruct("BearerConnectionCredential", {
    token: Schema.String,
  }),
});

export type StoredConnectionCredential = typeof StoredConnectionCredential.Type;

export const CatalogSyncResponse = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  upsertTargets: Schema.Array(BearerConnectionTarget),
  upsertProfiles: Schema.Array(BearerConnectionProfile),
  upsertCredentials: Schema.Array(StoredConnectionCredential),
  removeEnvironmentIds: Schema.Array(Schema.String),
});

export type CatalogSyncResponse = typeof CatalogSyncResponse.Type;
