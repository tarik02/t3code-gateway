import { gcm } from "@noble/ciphers/aes.js";
import { bytesToUtf8, concatBytes, randomBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { GatewayRuntimeConfig } from "../config.ts";

const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const SecretEncryptionOperation = Schema.Literals(["loadKey", "encrypt", "decrypt"]);
const SecretEncryptionFailureReason = Schema.Literals([
  "cipherFailed",
  "invalidKeyLength",
  "missingKeyFile",
  "payloadTooShort",
  "readKeyFile",
]);

export class SecretEncryption extends Context.Service<
  SecretEncryption,
  {
    readonly encrypt: (plaintext: string) => Effect.Effect<Buffer, SecretEncryptionError>;
    readonly decrypt: (ciphertext: Buffer) => Effect.Effect<string, SecretEncryptionError>;
  }
>()("@t3code-gateway/server/crypto/secret-encryption/SecretEncryption") {}

export class SecretEncryptionError extends Schema.TaggedErrorClass<SecretEncryptionError>()(
  "SecretEncryptionError",
  {
    operation: SecretEncryptionOperation,
    reason: SecretEncryptionFailureReason,
    path: Schema.optionalKey(Schema.String),
    expectedBytes: Schema.optionalKey(Schema.Number),
    actualBytes: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Unknown),
  },
) {
  override get message() {
    if (this.reason === "missingKeyFile") {
      return "T3_GATEWAY_SECRET_KEY_FILE is required for token encryption";
    }
    if (this.reason === "invalidKeyLength") {
      return `Secret key file must contain exactly ${this.expectedBytes} bytes, got ${this.actualBytes}`;
    }
    if (this.reason === "readKeyFile") {
      return "Failed to read secret key file";
    }
    if (this.reason === "payloadTooShort") {
      return "Encrypted payload is too short";
    }
    if (this.operation === "decrypt") {
      return "Decryption failed";
    }
    return "Encryption failed";
  }
}

const encryptWithKey = (plaintext: string, key: Buffer): Buffer => {
  const nonce = randomBytes(NONCE_LENGTH);
  const encrypted = gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
  return Buffer.from(concatBytes(nonce, encrypted));
};

const decryptWithKey = (blob: Buffer, key: Buffer): string => {
  const nonce = blob.subarray(0, NONCE_LENGTH);
  const ciphertext = blob.subarray(NONCE_LENGTH);
  return bytesToUtf8(gcm(key, nonce).decrypt(ciphertext));
};

const loadMasterKey = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;
  const keyFile = Option.getOrUndefined(config.secretKeyFile);
  if (keyFile === undefined) {
    return yield* new SecretEncryptionError({ operation: "loadKey", reason: "missingKeyFile" });
  }

  const fs = yield* FileSystem.FileSystem;
  const keyBytes = yield* fs.readFile(keyFile).pipe(
    Effect.mapError(
      (error) =>
        new SecretEncryptionError({
          operation: "loadKey",
          reason: "readKeyFile",
          path: keyFile,
          cause: error,
        }),
    ),
  );

  if (keyBytes.length !== KEY_LENGTH) {
    return yield* new SecretEncryptionError({
      operation: "loadKey",
      reason: "invalidKeyLength",
      path: keyFile,
      expectedBytes: KEY_LENGTH,
      actualBytes: keyBytes.length,
    });
  }

  return Buffer.from(keyBytes);
});

export const layer = Layer.effect(
  SecretEncryption,
  Effect.gen(function* () {
    const key = yield* loadMasterKey;

    return SecretEncryption.of({
      encrypt: (plaintext) =>
        Effect.sync(() => encryptWithKey(plaintext, key)).pipe(
          Effect.catchDefect((cause: unknown) =>
            Effect.fail(
              new SecretEncryptionError({
                operation: "encrypt",
                reason: "cipherFailed",
                cause,
              }),
            ),
          ),
        ),
      decrypt: (ciphertext) =>
        Effect.gen(function* () {
          if (ciphertext.length < NONCE_LENGTH + AUTH_TAG_LENGTH) {
            return yield* new SecretEncryptionError({
              operation: "decrypt",
              reason: "payloadTooShort",
              actualBytes: ciphertext.length,
            });
          }

          return yield* Effect.sync(() => decryptWithKey(ciphertext, key)).pipe(
            Effect.catchDefect((cause: unknown) =>
              Effect.fail(
                new SecretEncryptionError({
                  operation: "decrypt",
                  reason: "cipherFailed",
                  cause,
                }),
              ),
            ),
          );
        }),
    });
  }),
);
