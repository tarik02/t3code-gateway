import { and, count, eq, ne } from "drizzle-orm";
import { AuthFailure } from "@t3code-gateway/contracts/schemas";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { GatewayDb } from "../db/client.ts";
import { userSessions, users } from "../db/schema.ts";
import { DEFAULT_ADMIN_USERNAME, SESSION_TTL_MS } from "./constants.ts";
import { DatabaseError, mapServiceError } from "./errors.ts";
import { hashPassword, verifyPassword } from "./password.ts";

export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
}

export interface LoginResult {
  readonly user: AuthenticatedUser;
  readonly sessionToken: string;
}

export class AuthService extends Context.Service<AuthService, AuthServiceShape>()(
  "@t3code-gateway/server/auth/service/AuthService",
) {}

export interface AuthServiceShape {
  readonly bootstrapFirstUser: () => Effect.Effect<void, DatabaseError>;
  readonly login: (
    username: string,
    password: string,
  ) => Effect.Effect<LoginResult, AuthFailure | DatabaseError>;
  readonly logout: (sessionToken: string | undefined) => Effect.Effect<void, DatabaseError>;
  readonly currentUser: (
    sessionToken: string | undefined,
  ) => Effect.Effect<AuthenticatedUser | null, DatabaseError>;
  readonly changePassword: (
    sessionToken: string | undefined,
    currentPassword: string,
    nextPassword: string,
  ) => Effect.Effect<void, AuthFailure | DatabaseError>;
}

const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());

const toAuthenticatedUser = (row: { id: string; username: string }): AuthenticatedUser => ({
  id: row.id,
  username: row.username,
});

const dbEffect = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) =>
      new DatabaseError({
        message: cause instanceof Error ? cause.message : "Database operation failed",
      }),
  });

const mapAuthErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((error) => mapServiceError(error)));

const makeAuthService = Effect.gen(function* () {
  const db = yield* GatewayDb;
  const crypto = yield* Crypto.Crypto;

  const bootstrapFirstUser = () =>
    Effect.gen(function* () {
      const existing = yield* dbEffect(() => db.select({ value: count() }).from(users).get());
      if ((existing?.value ?? 0) > 0) {
        return;
      }

      const userId = yield* crypto.randomUUIDv4;
      const generatedPassword = Encoding.encodeBase64Url(yield* crypto.randomBytes(24));
      const passwordHash = yield* hashPassword(generatedPassword);
      const timestamp = nowIso();

      yield* dbEffect(() =>
        db
          .insert(users)
          .values({
            id: userId,
            username: DEFAULT_ADMIN_USERNAME,
            passwordHash,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run(),
      );

      yield* Console.log(
        `Created initial gateway user "${DEFAULT_ADMIN_USERNAME}" with generated password: ${generatedPassword}`,
      );
    }).pipe(
      Effect.catchTags({
        PasswordError: (error) => Effect.fail(new DatabaseError({ message: error.message })),
      }),
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(new DatabaseError({ message: error.message })),
      ),
    );

  const hashSessionTokenLocal = (token: string) =>
    Effect.gen(function* () {
      const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(token));
      return Encoding.encodeHex(digest);
    });

  const createSessionTokenLocal = () =>
    Effect.gen(function* () {
      const bytes = yield* crypto.randomBytes(32);
      return Encoding.encodeHex(bytes);
    });
  const createSession = (userId: string) =>
    Effect.gen(function* () {
      const sessionId = yield* crypto.randomUUIDv4;
      const sessionToken = yield* createSessionTokenLocal();
      const sessionTokenHash = yield* hashSessionTokenLocal(sessionToken);
      const expiresAt = DateTime.formatIso(
        DateTime.add(DateTime.nowUnsafe(), { milliseconds: SESSION_TTL_MS }),
      );
      const createdAt = nowIso();

      yield* dbEffect(() =>
        db
          .insert(userSessions)
          .values({
            id: sessionId,
            userId,
            sessionTokenHash,
            expiresAt,
            createdAt,
          })
          .run(),
      );

      return sessionToken;
    }).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(new DatabaseError({ message: error.message })),
      ),
    );

  const resolveSession = (sessionToken: string | undefined) =>
    Effect.gen(function* () {
      if (sessionToken === undefined || sessionToken.length === 0) {
        return null;
      }

      const sessionTokenHash = yield* hashSessionTokenLocal(sessionToken);
      const row = yield* dbEffect(() =>
        db
          .select({
            sessionId: userSessions.id,
            expiresAt: userSessions.expiresAt,
            id: users.id,
            username: users.username,
          })
          .from(userSessions)
          .innerJoin(users, eq(userSessions.userId, users.id))
          .where(eq(userSessions.sessionTokenHash, sessionTokenHash))
          .get(),
      );

      if (row === undefined) {
        return null;
      }

      const expiresAt = Option.getOrNull(DateTime.make(row.expiresAt));
      if (expiresAt === null || DateTime.isPastUnsafe(expiresAt)) {
        yield* dbEffect(() =>
          db.delete(userSessions).where(eq(userSessions.id, row.sessionId)).run(),
        );
        return null;
      }

      return toAuthenticatedUser(row);
    }).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(new DatabaseError({ message: error.message })),
      ),
    );

  const login = (username: string, password: string) =>
    mapAuthErrors(
      Effect.gen(function* () {
        const row = yield* dbEffect(() =>
          db
            .select({
              id: users.id,
              username: users.username,
              passwordHash: users.passwordHash,
            })
            .from(users)
            .where(eq(users.username, username))
            .get(),
        );

        if (row === undefined) {
          return yield* new AuthFailure({ message: "Invalid username or password" });
        }

        const valid = yield* verifyPassword(password, row.passwordHash);
        if (!valid) {
          return yield* new AuthFailure({ message: "Invalid username or password" });
        }

        const sessionToken = yield* createSession(row.id);
        return {
          user: toAuthenticatedUser(row),
          sessionToken,
        };
      }),
    );

  const logout = (sessionToken: string | undefined) =>
    Effect.gen(function* () {
      if (sessionToken === undefined || sessionToken.length === 0) {
        return;
      }

      const sessionTokenHash = yield* hashSessionTokenLocal(sessionToken);
      yield* dbEffect(() =>
        db.delete(userSessions).where(eq(userSessions.sessionTokenHash, sessionTokenHash)).run(),
      );
    }).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(new DatabaseError({ message: error.message })),
      ),
    );

  const currentUser = (sessionToken: string | undefined) => resolveSession(sessionToken);

  const changePassword = (
    sessionToken: string | undefined,
    currentPassword: string,
    nextPassword: string,
  ) =>
    mapAuthErrors(
      Effect.gen(function* () {
        const user = yield* resolveSession(sessionToken);
        if (user === null) {
          return yield* new AuthFailure({ message: "Authentication required" });
        }

        const row = yield* dbEffect(() =>
          db
            .select({
              passwordHash: users.passwordHash,
            })
            .from(users)
            .where(eq(users.id, user.id))
            .get(),
        );

        if (row === undefined) {
          return yield* new AuthFailure({ message: "Authentication required" });
        }

        const valid = yield* verifyPassword(currentPassword, row.passwordHash);
        if (!valid) {
          return yield* new AuthFailure({ message: "Current password is incorrect" });
        }

        const passwordHash = yield* hashPassword(nextPassword);
        const timestamp = nowIso();
        const sessionTokenHash =
          sessionToken !== undefined && sessionToken.length > 0
            ? yield* hashSessionTokenLocal(sessionToken)
            : null;

        yield* dbEffect(() =>
          db
            .update(users)
            .set({
              passwordHash,
              updatedAt: timestamp,
              passwordChangedAt: timestamp,
            })
            .where(eq(users.id, user.id))
            .run(),
        );

        if (sessionTokenHash !== null) {
          const currentSession = yield* dbEffect(() =>
            db
              .select({ sessionId: userSessions.id })
              .from(userSessions)
              .where(eq(userSessions.sessionTokenHash, sessionTokenHash))
              .get(),
          );

          if (currentSession !== undefined) {
            yield* dbEffect(() =>
              db
                .delete(userSessions)
                .where(
                  and(
                    eq(userSessions.userId, user.id),
                    ne(userSessions.id, currentSession.sessionId),
                  ),
                )
                .run(),
            );
          }
        }
      }),
    );

  return AuthService.of({
    bootstrapFirstUser,
    login,
    logout,
    currentUser,
    changePassword,
  });
});

export const layer = Layer.effect(AuthService, makeAuthService);
