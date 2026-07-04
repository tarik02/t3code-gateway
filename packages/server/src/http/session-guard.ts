import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { AuthService } from "../auth/service.ts";
import { readSessionToken } from "./cookies.ts";

const publicGatewayRoutes = new Set([
  "POST /api/gateway/auth/login",
  "POST /api/gateway/auth/logout",
  "GET /api/gateway/auth/me",
]);

const pathname = (url: string) => new URL(url, "http://gateway.local").pathname;

const sessionRequiredFor = (request: HttpServerRequest.HttpServerRequest) => {
  const path = pathname(request.url);

  if (publicGatewayRoutes.has(`${request.method} ${path}`)) {
    return false;
  }

  if (path.startsWith("/api/gateway/")) {
    return true;
  }

  if (path === "/admin/login" || path.startsWith("/admin/login/")) {
    return false;
  }

  if (
    path.startsWith("/admin/assets/") ||
    path === "/admin/favicon.svg" ||
    path === "/admin/site.webmanifest"
  ) {
    return false;
  }

  return path === "/admin" || path.startsWith("/admin/");
};

const unauthenticatedResponse = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse> => {
  const path = pathname(request.url);

  if (path === "/admin" || path.startsWith("/admin/")) {
    return Effect.succeed(HttpServerResponse.redirect("/admin/login", { status: 302 }));
  }

  return Effect.succeed(
    HttpServerResponse.jsonUnsafe({ error: "Authentication required" }, { status: 401 }),
  );
};

export const sessionGuard = <E, R>(
  handler: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    E,
    HttpServerRequest.HttpServerRequest | R
  >,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  E,
  HttpServerRequest.HttpServerRequest | AuthService | R
> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;

    if (!sessionRequiredFor(request)) {
      return yield* handler;
    }

    const auth = yield* AuthService;
    const user = yield* auth.currentUser(readSessionToken(request.cookies)).pipe(Effect.orDie);
    if (user !== null) {
      return yield* handler;
    }

    return yield* unauthenticatedResponse(request);
  });
