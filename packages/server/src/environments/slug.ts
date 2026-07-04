const DNS_SAFE_SLUG_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const isDnsSafeSlug = (slug: string) => DNS_SAFE_SLUG_PATTERN.test(slug);
