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
}

target "bundled-traefik" {
  inherits = ["_common"]
  dockerfile = "Containerfile.bundled-traefik"
  tags = ["${BUNDLED_TRAEFIK_IMAGE}:${VERSION}"]
}

group "default" {
  targets = ["external-traefik", "bundled-traefik"]
}
