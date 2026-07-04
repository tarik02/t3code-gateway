variable "IMAGE" {
  default = "t3code-gateway"
}

variable "VERSION" {
  default = "dev"
}

target "_common" {
  context = "."
  platforms = ["linux/amd64", "linux/arm64"]
}

target "external-traefik" {
  inherits = ["_common"]
  dockerfile = "Containerfile.external-traefik"
  tags = ["${IMAGE}:external-traefik-${VERSION}"]
}

target "bundled-traefik" {
  inherits = ["_common"]
  dockerfile = "Containerfile.bundled-traefik"
  tags = ["${IMAGE}:bundled-traefik-${VERSION}"]
}

group "default" {
  targets = ["external-traefik", "bundled-traefik"]
}
