export const stripTrailingSlash = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

export const joinBaseUrl = (baseUrl: string, path: string) => {
  const base = stripTrailingSlash(baseUrl);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
};

export const computePublicUrls = (slug: string, publicBaseDomain: string) => {
  const isLocal = publicBaseDomain === "localhost" || publicBaseDomain.endsWith(".localhost");
  const httpProtocol = isLocal ? "http" : "https";
  const wsProtocol = isLocal ? "ws" : "wss";
  const host = `${slug}.${publicBaseDomain}`;

  return {
    publicHttpBaseUrl: `${httpProtocol}://${host}/`,
    publicWsBaseUrl: `${wsProtocol}://${host}/`,
  };
};

export const isAbsoluteHttpUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host.length > 0;
  } catch {
    return false;
  }
};

export const isAbsoluteWsUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "ws:" || parsed.protocol === "wss:") && parsed.host.length > 0;
  } catch {
    return false;
  }
};
