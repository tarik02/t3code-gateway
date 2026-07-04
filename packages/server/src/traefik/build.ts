import type { EnvironmentRecord } from "@t3code-gateway/contracts/schemas";
import type { GatewayConfig } from "../config.ts";
import { stripTrailingSlash } from "../environments/urls.ts";
import { stringify } from "yaml";

type TraefikRouter = {
  rule: string;
  entryPoints: ReadonlyArray<string>;
  service: string;
  middlewares?: ReadonlyArray<string>;
  tls?: Record<string, string> | Record<string, never>;
};

type TraefikService = {
  loadBalancer: {
    passHostHeader: true;
    servers: ReadonlyArray<{ url: string }>;
  };
};

export type TraefikDynamicConfig = {
  http: {
    routers: Record<string, TraefikRouter>;
    services: Record<string, TraefikService>;
  };
};

const routeName = (slug: string) => `t3-env-${slug}`;

const parseCsv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const publicHost = (environment: EnvironmentRecord) =>
  new URL(stripTrailingSlash(environment.publicUrl)).host;

export const buildTraefikDynamicConfig = (
  environments: ReadonlyArray<EnvironmentRecord>,
  config: GatewayConfig,
): TraefikDynamicConfig => {
  const entryPoints = parseCsv(config.traefikEntrypoint);
  const middlewares = parseCsv(config.traefikAuthMiddlewares);
  const routers: Record<string, TraefikRouter> = {};
  const services: Record<string, TraefikService> = {};

  const enabledEnvironments = environments
    .filter((environment) => environment.enabled)
    .toSorted((left, right) => left.slug.localeCompare(right.slug));

  for (const environment of enabledEnvironments) {
    const name = routeName(environment.slug);
    const router: TraefikRouter = {
      rule: `Host(\`${publicHost(environment)}\`)`,
      entryPoints: entryPoints.length > 0 ? entryPoints : ["websecure"],
      service: name,
    };

    if (middlewares.length > 0) {
      router.middlewares = middlewares;
    }

    if (config.traefikTlsEnabled) {
      router.tls =
        config.traefikCertResolver.length > 0 ? { certResolver: config.traefikCertResolver } : {};
    }

    routers[name] = router;
    services[name] = {
      loadBalancer: {
        passHostHeader: true,
        servers: [{ url: stripTrailingSlash(environment.endpoint) }],
      },
    };
  }

  return { http: { routers, services } };
};

export const serializeTraefikDynamicConfig = (config: TraefikDynamicConfig) =>
  stringify(config, { sortMapEntries: true, lineWidth: 0 });
