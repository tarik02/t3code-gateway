import type { EnvironmentRecord, TraefikConfigResponse } from "@t3code-gateway/contracts/schemas";
import { createHash } from "node:crypto";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import { GatewayRuntimeConfig } from "../config.ts";
import { EnvironmentService } from "../environments/service.ts";
import { buildTraefikDynamicConfig, serializeTraefikDynamicConfig } from "./build.ts";
import { TraefikWriteError } from "./errors.ts";

export class TraefikReconciler extends Context.Service<
  TraefikReconciler,
  {
    readonly getConfig: () => Effect.Effect<TraefikConfigResponse>;
    readonly reconcile: () => Effect.Effect<void>;
  }
>()("@t3code-gateway/server/traefik/reconciler/TraefikReconciler") {}

const hashContent = (content: string) => createHash("sha256").update(content).digest("hex");

const makeTraefikReconciler = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;
  const environments = yield* EnvironmentService;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const lock = yield* Semaphore.make(1);
  const currentYaml = yield* Ref.make("http:\n  routers: {}\n  services: {}\n");

  const readFileHash = (filePath: string) =>
    Effect.gen(function* () {
      const content = yield* fs
        .readFileString(filePath)
        .pipe(Effect.catchTag("PlatformError", () => Effect.succeed(null)));
      return content === null ? undefined : hashContent(content);
    });

  const writeAtomic = (targetPath: string, content: string) =>
    Effect.gen(function* () {
      const tempPath = yield* fs.makeTempFile({
        directory: path.dirname(targetPath),
        prefix: `${path.basename(targetPath)}.`,
      });

      yield* Effect.gen(function* () {
        yield* fs.writeFileString(tempPath, content);
        yield* fs.rename(tempPath, targetPath);
      }).pipe(Effect.ensuring(fs.remove(tempPath, { force: true }).pipe(Effect.ignore)));
    }).pipe(
      Effect.mapError(
        (error) =>
          new TraefikWriteError({
            message: error.message,
          }),
      ),
    );

  const buildYaml = (items: ReadonlyArray<EnvironmentRecord>) => {
    const dynamicConfig = buildTraefikDynamicConfig(items, config);
    return serializeTraefikDynamicConfig(dynamicConfig);
  };

  const getConfig = () =>
    Ref.get(currentYaml).pipe(
      Effect.map(
        (yaml) =>
          ({
            yaml,
            dynamicFilePath: Option.getOrUndefined(config.traefikDynamicFile),
          }) satisfies TraefikConfigResponse,
      ),
    );

  const reconcile = () =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const items = yield* environments.list();
        const yaml = buildYaml(items);
        yield* Ref.set(currentYaml, yaml);

        const dynamicFile = Option.getOrNull(config.traefikDynamicFile);
        if (dynamicFile === null) {
          return;
        }

        const nextHash = hashContent(yaml);
        const existingHash = yield* readFileHash(dynamicFile);
        if (existingHash === nextHash) {
          return;
        }

        yield* writeAtomic(dynamicFile, yaml);
      }).pipe(
        Effect.catchTags({
          DatabaseError: (error) => Console.error(`Traefik reconcile failed: ${error.message}`),
          TraefikWriteError: (error) =>
            Console.error(`Failed to write Traefik dynamic config: ${error.message}`),
        }),
      ),
    );

  return TraefikReconciler.of({ getConfig, reconcile });
});

export const layer = Layer.effect(TraefikReconciler, makeTraefikReconciler);
