import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Schema from "effect/Schema";

export class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()("DatabaseError", {
  message: Schema.String,
}) {}

export const toEnvironmentFailure = (message: string) => new EnvironmentFailure({ message });

export const mapEnvironmentError = (error: unknown): EnvironmentFailure => {
  if (Schema.is(EnvironmentFailure)(error)) {
    return error;
  }
  if (Schema.is(DatabaseError)(error)) {
    return toEnvironmentFailure(error.message);
  }
  return toEnvironmentFailure("Environment request failed");
};
