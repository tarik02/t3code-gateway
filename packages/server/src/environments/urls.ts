export const stripTrailingSlash = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

export const deriveWsBaseUrl = (httpBaseUrl: string) => {
  const parsed = new URL(httpBaseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return stripTrailingSlash(parsed.toString());
};

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

const urlHasUserinfo = (parsed: URL) => parsed.username.length > 0 || parsed.password.length > 0;

export const hasUrlUserinfo = (url: string) => {
  try {
    return urlHasUserinfo(new URL(url));
  } catch {
    return false;
  }
};

export const isAbsoluteHttpUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.host.length > 0 &&
      !urlHasUserinfo(parsed)
    );
  } catch {
    return false;
  }
};

export const isHttpOriginUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" && parsed.search.length === 0 && parsed.hash.length === 0;
  } catch {
    return false;
  }
};

export const isAbsoluteWsUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "ws:" || parsed.protocol === "wss:") &&
      parsed.host.length > 0 &&
      !urlHasUserinfo(parsed)
    );
  } catch {
    return false;
  }
};
