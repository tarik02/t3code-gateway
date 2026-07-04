import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { AuthService } from "../auth/service.ts";
import { readSessionToken } from "./cookies.ts";

const requestPath = (url: string) => {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
};

const isPublicGatewayApi = (path: string, method: string) =>
  (method === "POST" && path === "/api/gateway/auth/login") ||
  (method === "POST" && path === "/api/gateway/auth/logout") ||
  (method === "GET" && path === "/api/gateway/auth/me");

const isPublicAdminPath = (path: string) =>
  path === "/admin/login" || path.startsWith("/admin/login/") || path.startsWith("/admin/assets/");

const isProtectedRequest = (request: HttpServerRequest.HttpServerRequest) => {
  const path = requestPath(request.url);
  const method = request.method;

  if (path.startsWith("/api/gateway/")) {
    return !isPublicGatewayApi(path, method);
  }

  if (path === "/admin" || path.startsWith("/admin/")) {
    return !isPublicAdminPath(path);
  }

  return false;
};

const unauthenticatedResponse = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse> => {
  const path = requestPath(request.url);

  if (path === "/admin" || path.startsWith("/admin/")) {
    return Effect.succeed(HttpServerResponse.redirect("/admin/login", { status: 302 }));
  }

  return Effect.succeed(
    HttpServerResponse.jsonUnsafe({ error: "Authentication required" }, { status: 401 }),
  );
};

export const withSessionGuard = <E, R>(
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

    if (!isProtectedRequest(request)) {
      return yield* handler;
    }

    const auth = yield* AuthService;
    const user = yield* auth.currentUser(readSessionToken(request.cookies)).pipe(Effect.orDie);
    if (user !== null) {
      return yield* handler;
    }

    return yield* unauthenticatedResponse(request);
  });
