variable "EXTERNAL_TRAEFIK_IMAGE" {
  default = "t3code-gateway"
}

variable "BUNDLED_TRAEFIK_IMAGE" {
  default = "t3code-gateway/bundled-traefik"
}

variable "VERSION" {
  default = "0.0.0-dev"
}

target "_common" {
  context = "."
  platforms = ["linux/amd64", "linux/arm64"]
}

target "external-traefik" {
  inherits = ["_common"]
  dockerfile = "Containerfile.external-traefik"
  tags = ["${EXTERNAL_TRAEFIK_IMAGE}:${VERSION}"]
  cache-from = ["type=gha,scope=external-traefik", "type=gha,scope=bundled-traefik"]
  cache-to = ["type=gha,scope=external-traefik,mode=max"]
}

target "bundled-traefik" {
  inherits = ["_common"]
  dockerfile = "Containerfile.bundled-traefik"
  tags = ["${BUNDLED_TRAEFIK_IMAGE}:${VERSION}"]
  cache-from = ["type=gha,scope=bundled-traefik", "type=gha,scope=external-traefik"]
  cache-to = ["type=gha,scope=bundled-traefik,mode=max"]
}

target "external-traefik-no-t3code-web" {
  inherits = ["external-traefik"]
  args = {
    T3CODE_RUNTIME_APP_DIR = "packaging/runtime/app-no-t3code-web"
  }
  tags = ["${EXTERNAL_TRAEFIK_IMAGE}:${VERSION}-no-t3code-web"]
  cache-from = ["type=gha,scope=external-traefik-no-t3code-web", "type=gha,scope=external-traefik"]
  cache-to = ["type=gha,scope=external-traefik-no-t3code-web,mode=max"]
}

target "bundled-traefik-no-t3code-web" {
  inherits = ["bundled-traefik"]
  args = {
    T3CODE_RUNTIME_APP_DIR = "packaging/runtime/app-no-t3code-web"
  }
  tags = ["${BUNDLED_TRAEFIK_IMAGE}:${VERSION}-no-t3code-web"]
  cache-from = ["type=gha,scope=bundled-traefik-no-t3code-web", "type=gha,scope=bundled-traefik"]
  cache-to = ["type=gha,scope=bundled-traefik-no-t3code-web,mode=max"]
}

group "default" {
  targets = [
    "external-traefik",
    "bundled-traefik",
    "external-traefik-no-t3code-web",
    "bundled-traefik-no-t3code-web",
  ]
}
