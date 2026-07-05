export function parsePairingFields(
  value: string,
): { readonly endpoint: string; readonly pairingCode: string } | null {
  try {
    const url = new URL(value);
    const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    const pairingCode = hashParams.get("token") ?? url.searchParams.get("token");
    if (pairingCode === null || pairingCode.length === 0) {
      return null;
    }

    const explicitHost = url.searchParams.get("host");
    if (explicitHost !== null && explicitHost.length > 0) {
      return { endpoint: new URL(explicitHost).origin, pairingCode };
    }

    return { endpoint: url.origin, pairingCode };
  } catch {
    return null;
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}
