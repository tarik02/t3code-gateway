import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import * as Effect from "effect/Effect";

import { PasswordError } from "./errors.ts";

const keyLength = 64;
const saltLength = 16;

const scryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

const derivePasswordKey = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });

export const hashPassword = (password: string) =>
  Effect.tryPromise({
    try: async () => {
      const salt = randomBytes(saltLength);
      const key = await derivePasswordKey(password, salt);

      return `scrypt:${salt.toString("base64url")}:${key.toString("base64url")}`;
    },
    catch: () => new PasswordError({ message: "Failed to hash password" }),
  });

export const verifyPassword = (password: string, passwordHash: string) =>
  Effect.tryPromise({
    try: async () => {
      const [algorithm = "", encodedSalt = "", encodedKey = ""] = passwordHash.split(":");
      if (algorithm !== "scrypt" || encodedSalt.length === 0 || encodedKey.length === 0) {
        return false;
      }

      const salt = Buffer.from(encodedSalt, "base64url");
      const expectedKey = Buffer.from(encodedKey, "base64url");
      const key = await derivePasswordKey(password, salt);

      return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
    },
    catch: () => new PasswordError({ message: "Failed to verify password" }),
  });
