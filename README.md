# T3 Code Gateway

T3 Code Gateway is a small gateway for managing multiple self-hosted T3 Code environments from one public entry point.

It serves:

- `/` as the T3 Code web app, when a T3 Code web dist is packaged.
- `/admin` as the gateway admin UI.
- `/api/gateway/*` as the gateway API.
- environment subdomains through Traefik file-provider config.

The gateway does not proxy normal T3 Code environment traffic. It writes Traefik dynamic config and lets Traefik route each public environment host directly to that environment.

## Project Layout

- `packages/contracts`: shared schemas and RPC definitions.
- `packages/server`: Effect HTTP server, SQLite persistence, auth, environment registry, Traefik reconciler.
- `packages/web`: admin UI.
- `packaging/container`: s6 service definitions and bundled Traefik config.
- `packaging/runtime/app`: prepared runtime app copied into container images.

## Development

Install dependencies:

```sh
pnpm install
```

Run checks:

```sh
pnpm fmt
pnpm typecheck
pnpm lint
pnpm build
```

The server reads configuration from environment variables.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `T3_GATEWAY_DATABASE_PATH` | `/var/lib/t3code-gateway/gateway.sqlite` | SQLite database path. |
| `T3_GATEWAY_LISTEN_HOST` | `0.0.0.0` | Server bind host. |
| `T3_GATEWAY_LISTEN_PORT` | `8787` | Server bind port. |
| `T3_GATEWAY_PUBLIC_BASE_DOMAIN` | `localhost` | Base domain used for generated environment public URLs. |
| `T3_GATEWAY_SECRET_KEY_FILE` | required by token encryption | 32-byte encryption key file. Container entrypoint creates it when unset. |
| `T3_GATEWAY_TRAEFIK_DYNAMIC_FILE` | unset | Path for generated Traefik file-provider config. Container entrypoint defaults it to `/data/traefik/environments.yml`. |
| `T3_GATEWAY_TRAEFIK_ENTRYPOINT` | `websecure` | Comma-separated Traefik entrypoints for generated routers. |
| `T3_GATEWAY_TRAEFIK_TLS_ENABLED` | `true` | Whether generated routers include TLS config. |
| `T3_GATEWAY_TRAEFIK_CERT_RESOLVER` | empty | Optional Traefik cert resolver name. |
| `T3_GATEWAY_TRAEFIK_AUTH_MIDDLEWARES` | empty | Comma-separated Traefik middleware names attached to generated routers. |
| `T3_GATEWAY_ADMIN_STATIC_ROOT` | unset | Built admin UI root. Container entrypoint defaults it to `/opt/t3code-gateway/packages/web/dist/client`. |
| `T3_GATEWAY_T3CODE_WEB_STATIC_ROOT` | unset | Built T3 Code web dist root served at `/`. Container entrypoint sets it when `/opt/t3code-gateway/t3code-web-dist/index.html` exists. |
| `T3_GATEWAY_T3CODE_WEB_BUILD_ID` | unset | Optional build id exposed to the catalog bootstrap. |

## First Login

On startup the server creates the first local user when no user exists yet and logs the generated password. Use `/admin/login`, then change the password from the admin header.

## Adding Environments

Create an administrative token inside the target T3 Code environment, then add that environment in `/admin`.

The gateway stores that token encrypted at rest and uses it to create normal browser/device credentials for gateway-managed clients. It does not return the administrative token to browsers.

## Traefik

The gateway writes a dynamic config file like:

```yaml
http:
  routers:
    t3-env-example:
      entryPoints:
        - websecure
      rule: Host(`example.code.test`)
      service: t3-env-example
      tls: {}
  services:
    t3-env-example:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: http://10.0.0.20:3773
```

For external Traefik deployments, include the generated file from your main Traefik static config.

For bundled Traefik deployments, the image includes a minimal static config at `/etc/traefik/traefik.yml` and reads dynamic config from `/data/traefik/environments.yml`.

## Container Images

The Containerfiles only package a prepared runtime app. They do not install dependencies or build the project.

Prepare `packaging/runtime/app` before building an image. Required layout:

```text
packaging/runtime/app/
  node_modules/
  packages/server/src/main.ts
  packages/web/dist/client/index.html
```

Optional T3 Code web dist:

```text
packaging/runtime/app/
  t3code-web-dist/index.html
```

Available images:

- `Containerfile.external-traefik`: runs only the gateway under s6.
- `Containerfile.bundled-traefik`: runs gateway and Traefik under s6.

Build both deployment modes for amd64 and arm64:

```sh
docker buildx bake
```

Build one mode:

```sh
docker buildx bake external-traefik
docker buildx bake bundled-traefik
```

Set image name/version:

```sh
IMAGE=ghcr.io/example/t3code-gateway VERSION=2026.7.4 docker buildx bake
```

## Runtime Data

Containers use `/data` for:

- `gateway.sqlite`
- `secret.key`
- `traefik/environments.yml`

Mount `/data` as persistent storage.
