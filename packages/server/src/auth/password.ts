import { scrypt } from "@noble/hashes/scrypt.js";
import { randomBytes } from "@noble/hashes/utils.js";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Result from "effect/Result";

const keyLength = 64;
const saltLength = 16;

const scryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  dkLen: keyLength,
  maxmem: 64 * 1024 * 1024,
} as const;

const equalBytes = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
};

export const hashPassword = (password: string) =>
  Effect.sync(() => {
    const salt = randomBytes(saltLength);
    const key = scrypt(password, salt, scryptOptions);

    return `scrypt:${Encoding.encodeBase64Url(salt)}:${Encoding.encodeBase64Url(key)}`;
  });

export const verifyPassword = (password: string, passwordHash: string) =>
  Effect.sync(() => {
    const [algorithm = "", encodedSalt = "", encodedKey = ""] = passwordHash.split(":");
    if (algorithm !== "scrypt" || encodedSalt.length === 0 || encodedKey.length === 0) {
      return false;
    }

    const decodedSalt = Encoding.decodeBase64Url(encodedSalt);
    const decodedKey = Encoding.decodeBase64Url(encodedKey);
    if (Result.isFailure(decodedSalt) || Result.isFailure(decodedKey)) {
      return false;
    }

    const salt = decodedSalt.success;
    const expectedKey = decodedKey.success;
    const key = scrypt(password, salt, scryptOptions);

    return equalBytes(key, expectedKey);
  });
