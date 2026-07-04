import { AuthFailure } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()("DatabaseError", {
  message: Schema.String,
}) {}

export class PasswordError extends Schema.TaggedErrorClass<PasswordError>()("PasswordError", {
  message: Schema.String,
}) {}

export const toAuthFailure = (message: string) => new AuthFailure({ message });

export const mapServiceError = (error: unknown): AuthFailure => {
  if (Schema.is(AuthFailure)(error)) {
    return error;
  }
  if (Schema.is(DatabaseError)(error)) {
    return toAuthFailure(error.message);
  }
  if (Schema.is(PasswordError)(error)) {
    return toAuthFailure(error.message);
  }
  return toAuthFailure("Request failed");
};

export const mapRpcError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((error) => mapServiceError(error)));
