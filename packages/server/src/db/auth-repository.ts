import { and, count, eq, ne } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { userSessions, users } from "./schema.ts";

export interface AuthenticatedUserRow {
  readonly id: string;
  readonly username: string;
}

export interface UserPasswordRow {
  readonly passwordHash: string;
}

export interface UserSessionRow extends AuthenticatedUserRow {
  readonly sessionId: string;
  readonly expiresAt: string;
}

export interface CreateUserInput {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly sessionTokenHash: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export class AuthRepository extends Context.Service<
  AuthRepository,
  {
    readonly countUsers: Effect.Effect<number, DatabaseError>;
    readonly createUser: (input: CreateUserInput) => Effect.Effect<void, DatabaseError>;
    readonly createSession: (input: CreateSessionInput) => Effect.Effect<void, DatabaseError>;
    readonly findSessionUserByTokenHash: (
      sessionTokenHash: string,
    ) => Effect.Effect<UserSessionRow | undefined, DatabaseError>;
    readonly deleteSessionById: (sessionId: string) => Effect.Effect<void, DatabaseError>;
    readonly findUserByUsername: (
      username: string,
    ) => Effect.Effect<(AuthenticatedUserRow & UserPasswordRow) | undefined, DatabaseError>;
    readonly deleteSessionByTokenHash: (
      sessionTokenHash: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly findUserPasswordById: (
      userId: string,
    ) => Effect.Effect<UserPasswordRow | undefined, DatabaseError>;
    readonly updateUserPassword: (
      userId: string,
      passwordHash: string,
      timestamp: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly findSessionIdByTokenHash: (
      sessionTokenHash: string,
    ) => Effect.Effect<string | undefined, DatabaseError>;
    readonly deleteOtherUserSessions: (
      userId: string,
      sessionId: string,
    ) => Effect.Effect<void, DatabaseError>;
  }
>()("@t3code-gateway/server/db/auth-repository/AuthRepository") {}

export const make = Effect.gen(function* () {
  const { db } = yield* GatewayDatabase;

  const countUsers = db
    .select({ value: count() })
    .from(users)
    .get()
    .pipe(
      Effect.map((row) => row?.value ?? 0),
      Effect.catchTags(queryError("bootstrapUser")),
    );

  const createUser = (input: CreateUserInput) =>
    db
      .insert(users)
      .values(input)
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("bootstrapUser")));

  const createSession = (input: CreateSessionInput) =>
    db
      .insert(userSessions)
      .values(input)
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  const findSessionUserByTokenHash = (sessionTokenHash: string) =>
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
      .get()
      .pipe(Effect.catchTags(queryError("authSession")));

  const deleteSessionById = (sessionId: string) =>
    db
      .delete(userSessions)
      .where(eq(userSessions.id, sessionId))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  const findUserByUsername = (username: string) =>
    db
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.username, username))
      .get()
      .pipe(Effect.catchTags(queryError("authUser")));

  const deleteSessionByTokenHash = (sessionTokenHash: string) =>
    db
      .delete(userSessions)
      .where(eq(userSessions.sessionTokenHash, sessionTokenHash))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  const findUserPasswordById = (userId: string) =>
    db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get()
      .pipe(Effect.catchTags(queryError("authUser")));

  const updateUserPassword = (userId: string, passwordHash: string, timestamp: string) =>
    db
      .update(users)
      .set({
        passwordHash,
        updatedAt: timestamp,
        passwordChangedAt: timestamp,
      })
      .where(eq(users.id, userId))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authUser")));

  const findSessionIdByTokenHash = (sessionTokenHash: string) =>
    db
      .select({ sessionId: userSessions.id })
      .from(userSessions)
      .where(eq(userSessions.sessionTokenHash, sessionTokenHash))
      .get()
      .pipe(
        Effect.map((row) => row?.sessionId),
        Effect.catchTags(queryError("authSession")),
      );

  const deleteOtherUserSessions = (userId: string, sessionId: string) =>
    db
      .delete(userSessions)
      .where(and(eq(userSessions.userId, userId), ne(userSessions.id, sessionId)))
      .run()
      .pipe(Effect.asVoid, Effect.catchTags(queryError("authSession")));

  return AuthRepository.of({
    countUsers,
    createUser,
    createSession,
    findSessionUserByTokenHash,
    deleteSessionById,
    findUserByUsername,
    deleteSessionByTokenHash,
    findUserPasswordById,
    updateUserPassword,
    findSessionIdByTokenHash,
    deleteOtherUserSessions,
  });
});

export const layer = Layer.effect(AuthRepository, make);
