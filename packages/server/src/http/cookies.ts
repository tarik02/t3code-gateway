import * as Duration from "effect/Duration";

import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "../auth/constants.ts";

export const readSessionToken = (cookies: Readonly<Record<string, string | undefined>>) =>
  cookies[SESSION_COOKIE_NAME];

export const sessionCookieOptions = (secure: boolean) =>
  ({
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
    maxAge: Duration.millis(SESSION_TTL_MS),
  }) as const;
