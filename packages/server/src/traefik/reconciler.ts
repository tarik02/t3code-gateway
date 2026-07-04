import type { EnvironmentRecord, TraefikConfigResponse } from "@t3code-gateway/contracts/schemas";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import process from "node:process";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
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

const readFileHash = (path: string) =>
  Effect.sync(() => {
    try {
      return hashContent(fs.readFileSync(path, "utf8"));
    } catch {
      return undefined;
    }
  });

const writeAtomic = (targetPath: string, content: string) =>
  Effect.tryPromise({
    try: async () => {
      const tempPath = `${targetPath}.tmp-${process.pid}`;
      const handle = await fs.promises.open(tempPath, "w");
      try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.promises.rename(tempPath, targetPath);
    },
    catch: (cause) =>
      new TraefikWriteError({
        message: cause instanceof Error ? cause.message : "Failed to write Traefik config",
      }),
  });

const makeTraefikReconciler = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;
  const environments = yield* EnvironmentService;
  const lock = yield* Semaphore.make(1);
  const currentYaml = yield* Ref.make("http:\n  routers: {}\n  services: {}\n");

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
