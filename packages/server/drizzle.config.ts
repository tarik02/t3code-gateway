import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.T3_GATEWAY_DATABASE_PATH ?? "/var/lib/t3code-gateway/gateway.sqlite",
  },
});
