# t3code gateway implementation plan

## Goal

Build a separate gateway product that makes multiple self-hosted t3code environments feel like one hosted installation at a configured public base domain, without requiring source changes in t3code.

The gateway will:

- Serve the built t3code web UI at `/`.
- Serve a separate gateway admin panel at `/admin`.
- Expose gateway APIs at `/api/gateway/*`.
- Reconcile Traefik dynamic configuration for public environment subdomains.
- Store each attached environment's administrative bearer token.
- Use existing t3code environment auth APIs to create, list, and revoke credentials.
- Provide a minimal built-in single-user login for the gateway/admin UI.
- Bootstrap the t3code web UI with preconfigured environment connections by modifying the built `index.html` artifact, not the t3code source tree.

Out of scope:

- Per-user authorization inside the gateway. V1 has one local gateway user and assumes that user can access every enabled environment.
- Tunnels. Environments must be reachable by the gateway host through normal network routing.
- A full T3 Cloud compatible relay/control plane.
- Changes to upstream t3code source for the first version.

## Target topology

```text
{gatewayHost}
  /                  gateway-served built t3code web UI
  /admin             gateway admin panel
  /api/gateway/*     gateway API
  /assets/*          t3code/gateway static assets as needed

{env}.{publicBaseDomain}
  /*                 Traefik reverse proxy to the attached t3code environment
```

Example:

```text
code.example.com                      gateway
desktop.code.example.com              Traefik -> http://10.0.0.12:3773
laptop.code.example.com               Traefik -> http://10.0.0.13:3773
workstation.code.example.com          Traefik -> http://10.0.0.14:3773
```

The gateway process does not proxy hot-path t3code traffic. Traefik owns that path for lower latency, websocket handling, TLS, logging, and operational visibility.

## Main components

### Gateway server

Responsibilities:

- HTTP server for `/admin`, `/api/gateway/*`, and the t3code web app.
- SQLite persistence.
- Secret encryption/decryption for stored environment admin tokens and generated per-device tokens.
- Calls attached t3code environments over their internal base URLs.
- Reconciles Traefik file-provider configuration.
- Performs health checks.
- Produces the bootstrap catalog consumed by the no-source-patch t3code web bootstrap.
- Runs as one deployable Node process serving API routes, the admin SPA, `gateway-bootstrap.js`, and copied t3code web assets.
- Handles local session-cookie auth for the gateway host.

Chosen stack:

- Runtime: Node.js.
- Effect: Effect 4 beta.
- HTTP framework: Effect HTTP.
- Database: SQLite.
- SQLite driver: native `node:sqlite`.
- ORM/query builder: Drizzle 1 release candidate with its Effect adapter.
- Validation: Effect Schema.
- UI: React + Vite + TanStack Start in SPA mode, TanStack Query, Tailwind, shadcn/ui, matching t3code visual conventions.
- Package manager: pnpm.
- Tooling: vite-plus for linting/formatting and full-bundle dev mode, following the t3code repo conventions.
- SSR: none for v1.

Package split:

- `packages/contracts`: Effect Schema, Effect RPC definitions, shared protocol types.
- `packages/server`: Effect HTTP server, SQLite, Traefik reconciler, t3code environment client, static asset serving.
- `packages/web`: admin SPA and gateway bootstrap packaging code.

Use Effect RPC for client-server communication between `web` and `server`, reusing `contracts`.

Keep the gateway independent from t3code packages at runtime for easier upgrades. Copy only small protocol constants and schemas that are stable enough, or define local request/response schemas for the HTTP endpoints the gateway uses.

### Gateway admin app

Served under `/admin`.

Responsibilities:

- Manage attached environments.
- Display environment health and token sync status.
- Create and copy pairing links.
- List and revoke pairing links.
- List and revoke client sessions.
- Replace the gateway's stored administrative token for an environment.
- Show generated Traefik config for inspection.
- Login and change the local gateway user's password.

Do not embed the admin panel into t3code. It is a separate app that reuses the same general shadcn/Tailwind style so it feels consistent.

### Built t3code web app

Served under `/`.

No t3code source patch for v1. The gateway build/package step expects a built t3code web dist directory to be available and modifies that dist's `index.html` artifact:

1. Receive a built t3code web dist directory as a packaging input.
2. Copy the build output into the gateway deploy image/artifact.
3. Find the original module script in `index.html`.
4. Replace it with `/gateway-bootstrap.js`.
5. The bootstrap script syncs gateway-managed environments into t3code IndexedDB.
6. The bootstrap script then imports the original t3code module entry.

This is intentionally a build artifact patch. It avoids carrying a long-lived source fork while still making `/` come up with gateway-managed environments.

### Traefik

Traefik is configured with the file provider. Gateway writes one generated dynamic config file.

Static Traefik config is managed outside the gateway. The gateway only owns dynamic routers/services/middlewares for attached environments.

Example generated file:

```yaml
http:
  routers:
    t3-env-desktop:
      rule: Host(`desktop.code.example.com`)
      entryPoints:
        - websecure
      service: t3-env-desktop
      tls: {}

  services:
    t3-env-desktop:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: http://10.0.0.12:3773
```

If the external reverse proxy auth layer must protect every env subdomain, configure that auth in Traefik static config or a gateway-generated middleware. Gateway v1 should assume auth middleware names are supplied by config and only attach them.

## Environment auth model

Each attached t3code environment has one stored gateway admin bearer token.

Initial one-time setup on each environment:

```bash
t3 auth session issue --json --label gateway
```

The returned bearer token must include administrative scopes:

```text
orchestration:read
orchestration:operate
terminal:operate
review:write
relay:read
access:read
access:write
relay:write
```

The gateway stores the token encrypted at rest. The token is never returned to browser clients.

The gateway uses the stored token to call existing t3code endpoints:

```text
GET  /.well-known/t3/environment
POST /api/auth/pairing-token
GET  /api/auth/pairing-links
POST /api/auth/pairing-links/revoke
GET  /api/auth/clients
POST /api/auth/clients/revoke
POST /api/auth/clients/revoke-others
POST /oauth/token
```

## Transparent web access model

The gateway should make `/` transparent by minting normal per-device bearer sessions for each attached environment.

Because authentication is out of scope and delegated to the external reverse proxy, the gateway uses a non-security identity cookie only for token cache partitioning:

```text
gateway_device_id=<uuid>
```

This cookie is not an auth credential. It only lets the gateway avoid minting a fresh environment bearer token on every page load.

Flow for `POST /api/gateway/t3code-catalog/sync`:

1. Read or set `gateway_device_id`.
2. Read the browser's submitted list of currently installed gateway-managed environment IDs.
3. For each enabled environment:
   - If the browser already has the environment and the server-side cached per-device bearer token is still valid, return metadata without a credential.
   - If the browser is missing the environment, the server-side cache is missing, or the cached token is near expiry, create a pairing token with the stored environment admin bearer token.
   - Exchange that pairing token at the environment's `/oauth/token`.
   - Store the resulting bearer token encrypted with expiry.
   - Return the resulting credential as an upsert for that environment.
4. Return stale gateway-managed environment IDs that the bootstrap must remove from IndexedDB.

Returned browser credentials are only normal bearer tokens scoped for t3code UI use. The response must never include environment admin tokens.

Browser token scopes are configurable per environment. Default browser token scopes:

```text
orchestration:read
orchestration:operate
terminal:operate
review:write
relay:read
```

## T3Code IndexedDB bootstrap

Current t3code web connection catalog:

```text
database: t3code:connection-runtime
version: 2
object store: catalog
key: document
```

Document shape:

```ts
type ConnectionCatalogDocument = {
  schemaVersion: 1;
  targets: Array<BearerConnectionTarget>;
  profiles: Array<BearerConnectionProfile>;
  credentials: Array<StoredConnectionCredential>;
  remoteDpopTokens: Array<unknown>;
};
```

Gateway-managed entries should use the same shape created by t3code pairing:

```ts
type BearerConnectionTarget = {
  _tag: "BearerConnectionTarget";
  environmentId: string;
  label: string;
  connectionId: string;
};

type BearerConnectionProfile = {
  _tag: "BearerConnectionProfile";
  connectionId: string;
  environmentId: string;
  label: string;
  httpBaseUrl: string;
  wsBaseUrl: string;
};

type BearerConnectionCredential = {
  _tag: "BearerConnectionCredential";
  token: string;
};

type StoredConnectionCredential = {
  connectionId: string;
  credential: BearerConnectionCredential;
};
```

Use deterministic connection IDs:

```text
gateway:{environmentId}
```

Bootstrap merge rules:

- Only manage targets whose connection ID starts with `gateway:`.
- Preserve all user-created non-gateway connections.
- Send the current gateway-managed environment IDs to `/api/gateway/t3code-catalog/sync` before modifying the catalog.
- Upsert gateway metadata returned by the sync response.
- Upsert credentials only for environments whose sync entry includes a replacement credential.
- Remove gateway entries whose environment IDs are returned in `removeEnvironmentIds`.
- Preserve `remoteDpopTokens` unchanged.
- If the existing catalog is invalid, quarantine it under a timestamped key and write a clean catalog.
- If sync or IndexedDB update fails, log to browser console and import the original t3code entry anyway.

Bootstrap pseudo-code:

```ts
const db = await openIndexedDb("t3code:connection-runtime", 2);
const raw = await read("catalog", "document");
const catalog = decodeOrEmpty(raw);

const installedGatewayEnvironmentIds = catalog.targets
  .filter((target) => target.connectionId.startsWith("gateway:"))
  .map((target) => target.environmentId);

const response = await fetch("/api/gateway/t3code-catalog/sync", {
  method: "POST",
  credentials: "include",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ installedGatewayEnvironmentIds }),
});
const sync = await response.json();

const unmanagedTargets = catalog.targets.filter((target) => !isGatewayTarget(target));
const unmanagedProfiles = catalog.profiles.filter(
  (profile) => !profile.connectionId.startsWith("gateway:"),
);
const unmanagedCredentials = catalog.credentials.filter(
  (entry) => !entry.connectionId.startsWith("gateway:"),
);
const retainedGatewayTargets = catalog.targets.filter(
  (target) =>
    target.connectionId.startsWith("gateway:") &&
    !sync.removeEnvironmentIds.includes(target.environmentId) &&
    !sync.upsertTargets.some((upsert) => upsert.environmentId === target.environmentId),
);
const retainedGatewayProfiles = catalog.profiles.filter(
  (profile) =>
    profile.connectionId.startsWith("gateway:") &&
    !sync.removeEnvironmentIds.includes(profile.environmentId) &&
    !sync.upsertProfiles.some((upsert) => upsert.environmentId === profile.environmentId),
);
const retainedGatewayCredentials = catalog.credentials.filter(
  (entry) =>
    entry.connectionId.startsWith("gateway:") &&
    !sync.removeEnvironmentIds.includes(entry.connectionId.replace("gateway:", "")) &&
    !sync.upsertCredentials.some((upsert) => upsert.connectionId === entry.connectionId),
);

const next = {
  schemaVersion: 1,
  targets: [...unmanagedTargets, ...retainedGatewayTargets, ...sync.upsertTargets],
  profiles: [...unmanagedProfiles, ...retainedGatewayProfiles, ...sync.upsertProfiles],
  credentials: [...unmanagedCredentials, ...retainedGatewayCredentials, ...sync.upsertCredentials],
  remoteDpopTokens: catalog.remoteDpopTokens ?? [],
};

await write("catalog", "document", JSON.stringify(next));
await import("/assets/original-t3code-entry.js");
```

Risk: this couples the gateway artifact injection to t3code's persisted connection catalog schema. Mitigation: keep the bootstrap small, schema-version gated, and fail open by importing t3code without modifying IndexedDB when the schema is unknown.

## Gateway API

Gateway APIs are defined in `packages/contracts` and exposed to the admin SPA through Effect RPC.

### Auth APIs

```text
POST /api/gateway/auth/login
POST /api/gateway/auth/logout
GET  /api/gateway/auth/me
POST /api/gateway/auth/change-password
```

On startup, if the `users` table is empty, create the first local user and log the generated password. Store only a password hash. The login flow sets an HTTP-only session cookie. The admin UI has a small login screen and change-password form.

Password/session storage:

- Hash passwords with argon2id.
- The generated first password is shown only in gateway logs.
- Generate session tokens with cryptographically secure random bytes.
- Store only a hash of the session token in SQLite.
- Session TTL is 30 days.
- Changing password revokes existing sessions except the current one.
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` when served over HTTPS.
- Unauthenticated gateway-host requests redirect to `/admin/login`, preserving the originally requested path for post-login redirect.

### Runtime/bootstrap APIs

```text
POST /api/gateway/t3code-catalog/sync
```

Reconciles the browser's gateway-managed t3code connection catalog entries. The request lists installed gateway environment IDs. The response returns metadata upserts, credential upserts only when the browser is missing a token or the server wants a refresh, and environment IDs to remove.

Request:

```json
{
  "installedGatewayEnvironmentIds": ["env_123"]
}
```

Response:

```json
{
  "schemaVersion": 1,
  "upsertTargets": [],
  "upsertProfiles": [],
  "upsertCredentials": [],
  "removeEnvironmentIds": []
}
```

```text
GET /api/gateway/status
```

Returns gateway health, t3code build metadata, and database migration status.

### Environment management

```text
GET    /api/gateway/environments
POST   /api/gateway/environments
GET    /api/gateway/environments/:environmentId
PATCH  /api/gateway/environments/:environmentId
DELETE /api/gateway/environments/:environmentId
POST   /api/gateway/environments/validate
POST   /api/gateway/environments/:environmentId/health-check
```

Create payload:

```json
{
  "slug": "desktop",
  "label": "Desktop",
  "internalHttpBaseUrl": "http://10.0.0.12:3773",
  "internalWsBaseUrl": "ws://10.0.0.12:3773",
  "adminBearerToken": "...",
  "browserTokenScopes": [
    "orchestration:read",
    "orchestration:operate",
    "terminal:operate",
    "review:write",
    "relay:read"
  ]
}
```

Stored computed fields:

- `publicHttpBaseUrl`: `https://desktop.code.example.com/`
- `publicWsBaseUrl`: `wss://desktop.code.example.com/`
- `environmentId`: primary environment identity read from `/.well-known/t3/environment`
- `descriptorJson`: full descriptor snapshot

Validation:

- Slug must be DNS-safe and unique.
- Internal URLs must be absolute.
- Gateway must reach `/.well-known/t3/environment`.
- The descriptor environment ID must not conflict with another env.
- Admin token must authenticate against `/api/auth/clients` or another endpoint requiring `access:read`.
- Create is validate-before-save. The gateway does not persist environment rows without a known t3code `environmentId`.
- Delete removes the gateway row, cached encrypted browser tokens, and generated Traefik route only. It must not revoke any sessions or pairing links in the t3code environment.

### Pairing links

```text
POST /api/gateway/environments/:environmentId/pairing-links
GET  /api/gateway/environments/:environmentId/pairing-links
POST /api/gateway/environments/:environmentId/pairing-links/:linkId/revoke
```

Create payload:

```json
{
  "label": "phone",
  "scopes": [
    "orchestration:read",
    "orchestration:operate",
    "terminal:operate",
    "review:write",
    "relay:read"
  ]
}
```

Response:

```json
{
  "id": "pairing-id",
  "credential": "secret",
  "pairingUrl": "https://desktop.code.example.com/pair#token=secret",
  "expiresAt": "2026-07-04T12:00:00.000Z"
}
```

### Client sessions

```text
GET  /api/gateway/environments/:environmentId/clients
POST /api/gateway/environments/:environmentId/clients/:sessionId/revoke
```

The UI should clearly mark the gateway admin session and per-device gateway-minted sessions where possible by label.

### Traefik

```text
GET /api/gateway/traefik/config
```

Returns the currently generated config for inspection. It must redact sensitive values, though the Traefik config should not contain environment tokens.

## Database schema

Use SQLite.

### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  password_changed_at TEXT
);
```

V1 creates one user, for example `admin`, when the table is empty.

### user_sessions

```sql
CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### environments

```sql
CREATE TABLE environments (
  environment_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  internal_http_base_url TEXT NOT NULL,
  internal_ws_base_url TEXT NOT NULL,
  public_http_base_url TEXT NOT NULL,
  public_ws_base_url TEXT NOT NULL,
  descriptor_json TEXT,
  browser_token_scopes_json TEXT NOT NULL,
  admin_token_encrypted BLOB NOT NULL,
  admin_token_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_health_status TEXT,
  last_health_checked_at TEXT,
  last_health_error TEXT,
  last_catalog_sync_status TEXT,
  last_catalog_synced_at TEXT,
  last_catalog_sync_error TEXT
);
```

### device_sessions

```sql
CREATE TABLE device_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  environment_id TEXT NOT NULL REFERENCES environments(environment_id) ON DELETE CASCADE,
  environment_session_id TEXT,
  bearer_token_encrypted BLOB NOT NULL,
  scopes_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(device_id, environment_id)
);
```

## Secret encryption

Use envelope-style local encryption with one gateway master key.

Configuration:

```text
T3_GATEWAY_SECRET_KEY_FILE=/run/secrets/t3-gateway-key
```

Implementation:

- Require a deployment-provided 32-byte master key file. Gateway startup fails if the key file is missing or invalid.
- Encrypt each stored token with AES-256-GCM.
- Use `effect/Crypto` via `@effect/platform-node/NodeCrypto` for cryptographically secure random bytes/nonces.
- Effect 4 beta's Crypto service does not provide AES-GCM encryption/decryption, so implement AES-256-GCM with Node `node:crypto` behind a small Effect service.
- Store nonce, ciphertext, and auth tag in one binary/blob encoding. Do not add key rotation metadata in v1.
- Never log plaintext tokens.
- Redact tokens from HTTP errors before logging.

Treat the gateway as root for every attached environment because it stores administrative environment tokens.

## Traefik reconciliation design

Config:

```text
T3_GATEWAY_PUBLIC_BASE_DOMAIN=code.example.com
T3_GATEWAY_TRAEFIK_DYNAMIC_FILE=/etc/traefik/dynamic/t3code-gateway.yml
T3_GATEWAY_TRAEFIK_ENTRYPOINT=websecure
T3_GATEWAY_TRAEFIK_TLS_ENABLED=true
T3_GATEWAY_TRAEFIK_CERT_RESOLVER=
T3_GATEWAY_TRAEFIK_AUTH_MIDDLEWARES=external-auth@file
```

Load gateway and Traefik target settings through Effect Config. Traefik is deployed separately; the gateway only writes the configured generated file that is included by the main Traefik configuration.

Reconcile algorithm:

1. Load enabled environments.
2. Build deterministic Traefik config sorted by slug.
3. Serialize YAML.
4. Hash YAML.
5. If file content already matches, do nothing.
6. Write to `${file}.tmp-${pid}`.
7. Fsync temp file if practical.
8. Rename over target path.
9. Log failures.

Use a single-process lock around reconciliation. If multiple gateway instances are planned later, add DB-level lock/lease.

Router naming:

```text
t3-env-{slug}
```

Service naming:

```text
t3-env-{slug}
```

Generated router:

```yaml
http:
  routers:
    t3-env-desktop:
      rule: Host(`desktop.code.example.com`)
      entryPoints:
        - websecure
      service: t3-env-desktop
      middlewares:
        - external-auth@file
      tls: {}
```

Generated service:

```yaml
http:
  services:
    t3-env-desktop:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: http://10.0.0.12:3773
```

For websocket support, no special Traefik config should be needed if normal HTTP upgrade headers are preserved.

## Health checks

Internal health:

```text
GET {internalHttpBaseUrl}/.well-known/t3/environment
```

Admin token health:

```text
GET {internalHttpBaseUrl}/api/auth/clients
Authorization: Bearer <admin-token>
```

Health status values:

```text
unknown
healthy
internal_unreachable
auth_failed
descriptor_mismatch
error
```

Run health checks:

- On environment attach.
- Periodically, for example every 60 seconds, with low concurrency.
- Manually from admin UI.

Scheduled health checks cover only internal descriptor reachability and admin-token validity. They do not probe public subdomains in v1.

## Admin UI pages

### `/admin`

Dashboard:

- Environment count.
- Healthy/unhealthy count.
- Last gateway error.
- Quick links to env subdomains.
- Small diagnostics section with generated Traefik config inspection.

### `/admin/envs`

Environment table:

- Label.
- Slug.
- Internal URL.
- Public URL.
- Environment ID.
- Health.
- Enabled.
- Actions.

Actions:

- Open env.
- Create pairing link.
- View clients.
- Disable.
- Delete.

### `/admin/envs/new`

Form:

- Slug.
- Label.
- Internal HTTP base URL.
- Internal WS base URL.
- Admin bearer token.
- Browser token scopes.

UX:

- Validate before save.
- Show descriptor after validation.
- Save and reconcile.

### `/admin/envs/:id`

Tabs:

- Overview.
- Pairing links.
- Client sessions.
- Admin token replacement.
- Raw descriptor.

Traefik reconcile runs automatically after routing-affecting environment mutations. There is no manual force-reconcile action in v1.

## Build and packaging

Suggested monorepo layout:

```text
t3code-gateway/
  packages/
    contracts/
    server/
    web/
  plans/
    t3code-gateway-implementation-plan.md
  deploy/
    traefik/
    docker-compose.yml
```

Build flow:

1. Provide a prebuilt t3code web dist directory during packaging/build.
2. Copy t3code web dist into gateway server public directory.
3. Copy original `index.html` to `index.original.html` for debugging.
4. Rewrite `index.html` to load `/gateway-bootstrap.js`.
5. Store the original t3code module script URL in the bootstrap script config.
6. Build gateway admin app and mount it under `/admin`.
7. Build gateway server.
8. CI builds the gateway container image with the supplied t3code web dist.

The artifact patcher should be deterministic and fail if it cannot find exactly one t3code module entry.

## Deployment

Minimum deployment:

```text
one gateway server container/process
separately deployed Traefik
sqlite volume
secret key file
traefik dynamic config volume shared read/write
```

Gateway auth:

- The configured gateway host uses the built-in single-user login/session flow.
- `/`, `/admin`, `gateway-bootstrap.js`, copied web assets, and `/api/gateway/*` require a valid gateway session, except auth endpoints and login assets.
- The transparent t3code catalog sync requires a valid gateway session.
- Environment hosts may still be protected by an external reverse proxy, but gateway v1 does not require that for its own admin auth.

Network requirements:

- Gateway server can reach internal t3code environment URLs.
- Traefik can reach internal t3code environment URLs.
- Browsers can reach the configured gateway host and environment hosts.

## Milestones

### Milestone 1: gateway skeleton

- Create server app.
- Create admin app.
- Create SQLite migrations.
- Add config loader.
- Add first-user bootstrap, login, logout, and change-password flow.
- Serve `/admin`.
- Serve placeholder `/api/gateway/status`.

Done when:

- Gateway boots.
- First startup creates a local user and logs the generated password.
- Admin shell renders.
- Login and password change work.
- Status API returns config and DB status.

### Milestone 2: environment registry

- Add environment CRUD APIs.
- Validate internal descriptor endpoint.
- Store encrypted admin token.
- Add env list/create pages.

Done when:

- An environment can be added from `/admin`.
- Gateway stores descriptor and encrypted admin token.
- Invalid tokens and unreachable envs fail validation.

### Milestone 3: Traefik reconciler

- Generate Traefik dynamic YAML.
- Atomically write file.
- Add generated Traefik config inspection to admin diagnostics.

Done when:

- Adding/disabling/deleting env updates Traefik config.
- Public subdomain reaches the correct env after Traefik reloads file provider config.

### Milestone 4: token management

- Create pairing links.
- List pairing links.
- Revoke pairing links.
- List clients.
- Revoke clients.

Done when:

- `/admin/envs/:id` can create and copy a pairing URL.
- Existing pairing links and sessions are visible.
- Revocation works.

### Milestone 5: transparent t3code bootstrap

- Implement `/api/gateway/t3code-catalog/sync`.
- Implement per-device token cache.
- Implement built `index.html` injection.
- Implement `gateway-bootstrap.js` IndexedDB sync.

Done when:

- Opening the configured gateway host loads t3code UI.
- Gateway-managed environments appear without manual pairing.
- Non-gateway connections in the browser are preserved.

### Milestone 6: hardening

- Redaction in logs/errors.
- Health check scheduler.
- Backup/restore notes for SQLite and secret key.
- Basic operational docs.

Done when:

- Gateway can be restored from DB plus secret key.
- Token material is never logged in normal error paths.

## Open decisions

- Decide if gateway should generate Traefik auth middleware references or only attach configured middleware names.
- Decide token TTL for gateway-minted browser env sessions. Start with t3code default and refresh on bootstrap when near expiry.

## Known risks

- IndexedDB catalog injection depends on t3code's current persisted schema. Keep it version-gated and fail open.
- Gateway compromise compromises every attached environment because it stores administrative tokens.
- Weak local gateway password or leaked session compromises every attached environment.
- Public environment hosts still expose t3code environment routes; use external proxy protection if bearer-token-only access is not acceptable.
- If an environment is reachable by Traefik but not by gateway server, admin token operations fail while proxy traffic may still work.
- If public env hosts use different origins, browser storage stays under the gateway host but websocket/http calls go cross-origin. Existing t3code bearer flow supports this, but CORS and websocket ticket behavior must be verified with the deployed hostnames.

## Verification checklist

- Add env with valid token.
- Start with an empty DB and confirm the first user is created and the generated password is logged.
- Log in, change password, log out, and log in with the new password.
- Add env with invalid token and confirm validation error.
- Add env with duplicate slug and confirm validation error.
- Add env with duplicate environment ID and confirm validation error.
- Reconcile Traefik and inspect generated YAML.
- Confirm `https://{slug}.{publicBaseDomain}/.well-known/t3/environment` returns the expected descriptor.
- Create pairing link and open copied URL.
- Revoke pairing link and confirm it disappears.
- List clients and revoke a non-current client.
- Open the configured gateway host in a fresh browser profile and confirm envs appear.
- Confirm a manually paired non-gateway env is not removed by bootstrap.
- Disable env and confirm it disappears from t3code after reload.
- Replace admin token manually and confirm future operations still work.
- Build the container image with a supplied t3code web dist and confirm the build fails if `index.html` cannot be patched exactly once.
