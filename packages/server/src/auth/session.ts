import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";

export const createSessionToken = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const bytes = yield* crypto.randomBytes(32);
  return Encoding.encodeHex(bytes);
});

export const hashSessionToken = (token: string) =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(token));
    return Encoding.encodeHex(digest);
  });
