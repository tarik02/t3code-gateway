import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "../auth/constants.ts";

export const readSessionToken = (cookies: Readonly<Record<string, string | undefined>>) =>
  cookies[SESSION_COOKIE_NAME];

export const sessionCookieOptions = (secure: boolean) =>
  ({
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
    maxAge: SESSION_TTL_MS / 1000,
  }) as const;
