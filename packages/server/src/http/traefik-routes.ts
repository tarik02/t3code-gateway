import type { TraefikConfigResponse } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { TraefikReconciler } from "../traefik/reconciler.ts";

const withJson = <A>(body: A) => HttpServerResponse.json(body).pipe(Effect.orDie);

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const traefik = yield* TraefikReconciler;

    yield* router.add("GET", "/api/gateway/traefik/config", () =>
      Effect.gen(function* () {
        const config = yield* traefik.getConfig();
        return yield* withJson(config satisfies TraefikConfigResponse);
      }),
    );
  }),
);
