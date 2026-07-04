import { blob, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  passwordChangedAt: text("password_changed_at"),
});

export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionTokenHash: text("session_token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const environments = sqliteTable("environments", {
  environmentId: text("environment_id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  internalHttpBaseUrl: text("internal_http_base_url").notNull(),
  internalWsBaseUrl: text("internal_ws_base_url").notNull(),
  publicHttpBaseUrl: text("public_http_base_url").notNull(),
  publicWsBaseUrl: text("public_ws_base_url").notNull(),
  descriptorJson: text("descriptor_json"),
  browserTokenScopesJson: text("browser_token_scopes_json").notNull(),
  adminTokenEncrypted: blob("admin_token_encrypted", { mode: "buffer" }).notNull(),
  adminTokenSessionId: text("admin_token_session_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastHealthStatus: text("last_health_status"),
  lastHealthCheckedAt: text("last_health_checked_at"),
  lastHealthError: text("last_health_error"),
  lastCatalogSyncStatus: text("last_catalog_sync_status"),
  lastCatalogSyncedAt: text("last_catalog_synced_at"),
  lastCatalogSyncError: text("last_catalog_sync_error"),
});

export const deviceSessions = sqliteTable(
  "device_sessions",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    environmentId: text("environment_id")
      .notNull()
      .references(() => environments.environmentId, { onDelete: "cascade" }),
    environmentSessionId: text("environment_session_id"),
    bearerTokenEncrypted: blob("bearer_token_encrypted", { mode: "buffer" }).notNull(),
    scopesJson: text("scopes_json").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [unique().on(table.deviceId, table.environmentId)],
);
