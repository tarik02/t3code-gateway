import * as Effect from "effect/Effect";
import { hash, verify } from "@node-rs/argon2";

import { PasswordError } from "./errors.ts";

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (password: string) =>
  Effect.tryPromise({
    try: () => hash(password, ARGON2_OPTIONS),
    catch: () => new PasswordError({ message: "Failed to hash password" }),
  });

export const verifyPassword = (password: string, passwordHash: string) =>
  Effect.tryPromise({
    try: () => verify(passwordHash, password, ARGON2_OPTIONS),
    catch: () => new PasswordError({ message: "Failed to verify password" }),
  });
