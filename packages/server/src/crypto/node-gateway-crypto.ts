import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { GatewayCrypto, GatewayCryptoError } from "./gateway-crypto.ts";

const AES_256_GCM_KEY_LENGTH = 32;
const AES_GCM_NONCE_LENGTH = 12;
const AES_GCM_AUTH_TAG_LENGTH = 16;
const AES_256_GCM_ALGORITHM = "aes-256-gcm";

export const layer = Layer.succeed(
  GatewayCrypto,
  GatewayCrypto.of({
    randomBytes: (length) =>
      Effect.sync(() => randomBytes(length)).pipe(
        Effect.catchDefect((cause: unknown) =>
          Effect.fail(
            new GatewayCryptoError({
              operation: "randomBytes",
              reason: "randomFailed",
              cause,
            }),
          ),
        ),
      ),
    scrypt: (input) =>
      Effect.effectify(
        scrypt,
        (error) =>
          new GatewayCryptoError({
            operation: "scrypt",
            reason: "derivationFailed",
            cause: error,
          }),
      )(input.password, input.salt, input.keyLength, {
        N: input.N,
        r: input.r,
        p: input.p,
        maxmem: input.maxmem,
      }),
    timingSafeEqual: (left, right) =>
      Effect.sync(() => left.length === right.length && timingSafeEqual(left, right)).pipe(
        Effect.catchDefect((cause: unknown) =>
          Effect.fail(
            new GatewayCryptoError({
              operation: "timingSafeEqual",
              reason: "comparisonFailed",
              cause,
            }),
          ),
        ),
      ),
    aes256GcmEncrypt: ({ key, nonce, plaintext }) =>
      Effect.sync(() => {
        if (key.length !== AES_256_GCM_KEY_LENGTH || nonce.length !== AES_GCM_NONCE_LENGTH) {
          throw new Error("Invalid AES-256-GCM key or nonce length");
        }

        const cipher = createCipheriv(AES_256_GCM_ALGORITHM, key, nonce);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return Buffer.concat([ciphertext, cipher.getAuthTag()]);
      }).pipe(
        Effect.catchDefect((cause: unknown) =>
          Effect.fail(
            new GatewayCryptoError({
              operation: "aes256GcmEncrypt",
              reason: "cipherFailed",
              cause,
            }),
          ),
        ),
      ),
    aes256GcmDecrypt: ({ key, nonce, ciphertextWithTag }) =>
      Effect.sync(() => {
        if (key.length !== AES_256_GCM_KEY_LENGTH || nonce.length !== AES_GCM_NONCE_LENGTH) {
          throw new Error("Invalid AES-256-GCM key or nonce length");
        }
        if (ciphertextWithTag.length < AES_GCM_AUTH_TAG_LENGTH) {
          throw new Error("AES-256-GCM ciphertext is missing authentication tag");
        }

        const ciphertext = ciphertextWithTag.subarray(
          0,
          ciphertextWithTag.length - AES_GCM_AUTH_TAG_LENGTH,
        );
        const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - AES_GCM_AUTH_TAG_LENGTH);
        const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, key, nonce);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      }).pipe(
        Effect.catchDefect((cause: unknown) =>
          Effect.fail(
            new GatewayCryptoError({
              operation: "aes256GcmDecrypt",
              reason: "cipherFailed",
              cause,
            }),
          ),
        ),
      ),
  }),
);
