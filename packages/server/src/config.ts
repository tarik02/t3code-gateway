import * as Config from "effect/Config";

export const GatewayConfig = Config.all({
  databasePath: Config.string("T3_GATEWAY_DATABASE_PATH").pipe(
    Config.withDefault("/var/lib/t3code-gateway/gateway.sqlite"),
  ),
  publicBaseDomain: Config.string("T3_GATEWAY_PUBLIC_BASE_DOMAIN"),
  secretKeyFile: Config.string("T3_GATEWAY_SECRET_KEY_FILE"),
  traefikDynamicFile: Config.string("T3_GATEWAY_TRAEFIK_DYNAMIC_FILE"),
  traefikEntrypoint: Config.string("T3_GATEWAY_TRAEFIK_ENTRYPOINT").pipe(
    Config.withDefault("websecure"),
  ),
});

export type GatewayConfig = Config.Success<typeof GatewayConfig>;
