# @t3code-gateway/server

## 0.1.0

### Minor Changes

- 784e370: Initial T3 Code Gateway release.

### Patch Changes

- db5a1df: Bundle the pinned T3 Code web dist in published container images.
- d79fa6d: Disable host header forwarding for gateway-generated environment services.
- 54ec104: Fix gateway session cookie lifetime to match the configured session TTL.
- 040154a: Store the T3 Code catalog bootstrap document as JSON for the bundled web app.
- caccae4: Gate bundled T3 Code pages behind gateway login, move browser catalog injection to a manual admin action, route admin environment operations through Effect RPC, and clean up the admin browser-install flow with toast feedback and schema-backed catalog parsing.
- f46bc0c: Allow deployments to disable the T3 Code web UI, make bundled Traefik optional in one image, and reduce the published image size.
- 7f60299: Refactor gateway persistence into database-backed auth and environment repositories.
- 0bd879f: Update the pinned bundled T3 Code web dist.
- bad79ff: Use node:sqlite for gateway persistence to avoid packaging native SQLite addons.
- Updated dependencies [db5a1df]
- Updated dependencies [784e370]
- Updated dependencies [caccae4]
- Updated dependencies [0bd879f]
  - @t3code-gateway/contracts@0.1.0
