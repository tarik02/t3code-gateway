import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { GatewayRuntimeConfig } from "../config.ts";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class SecretEncryption extends Context.Service<
  SecretEncryption,
  {
    readonly encrypt: (plaintext: string) => Effect.Effect<Buffer, SecretEncryptionError>;
    readonly decrypt: (ciphertext: Buffer) => Effect.Effect<string, SecretEncryptionError>;
  }
>()("@t3code-gateway/server/crypto/secret-encryption/SecretEncryption") {}

export class SecretEncryptionError extends Error {
  readonly _tag = "SecretEncryptionError";

  constructor(message: string) {
    super(message);
    this.name = "SecretEncryptionError";
  }
}

const encryptWithKey = (plaintext: string, key: Buffer): Buffer => {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, encrypted, tag]);
};

const decryptWithKey = (blob: Buffer, key: Buffer): string => {
  if (blob.length < NONCE_LENGTH + AUTH_TAG_LENGTH) {
    throw new SecretEncryptionError("Encrypted payload is too short");
  }

  const nonce = blob.subarray(0, NONCE_LENGTH);
  const tag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(NONCE_LENGTH, blob.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

const loadMasterKey = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;
  const keyFile = Option.getOrUndefined(config.secretKeyFile);
  if (keyFile === undefined) {
    return yield* Effect.fail(
      new SecretEncryptionError("T3_GATEWAY_SECRET_KEY_FILE is required for token encryption"),
    );
  }

  const fs = yield* FileSystem.FileSystem;
  const keyBytes = yield* fs
    .readFile(keyFile)
    .pipe(
      Effect.mapError(
        (error) => new SecretEncryptionError(`Failed to read secret key file: ${error.message}`),
      ),
    );

  if (keyBytes.length !== KEY_LENGTH) {
    return yield* Effect.fail(
      new SecretEncryptionError(
        `Secret key file must contain exactly ${KEY_LENGTH} bytes, got ${keyBytes.length}`,
      ),
    );
  }

  return Buffer.from(keyBytes);
});

export const layer = Layer.effect(
  SecretEncryption,
  Effect.gen(function* () {
    const key = yield* loadMasterKey;

    return SecretEncryption.of({
      encrypt: (plaintext) =>
        Effect.try({
          try: () => encryptWithKey(plaintext, key),
          catch: (cause) =>
            new SecretEncryptionError(cause instanceof Error ? cause.message : "Encryption failed"),
        }),
      decrypt: (ciphertext) =>
        Effect.try({
          try: () => decryptWithKey(ciphertext, key),
          catch: (cause) =>
            new SecretEncryptionError(cause instanceof Error ? cause.message : "Decryption failed"),
        }),
    });
  }),
);
