import type {
  ChangePasswordRequest,
  CurrentUser,
  GatewayStatus,
  LoginRequest,
  LoginResponse,
} from "@t3code-gateway/contracts/schemas";

const jsonHeaders = {
  "content-type": "application/json",
} as const;

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await fetch("/api/gateway/auth/login", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  return readJson<LoginResponse>(response);
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/gateway/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  await readJson<void>(response);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/gateway/auth/me", {
    credentials: "include",
  });

  return readJson<CurrentUser | null>(response);
}

export async function changePassword(payload: ChangePasswordRequest): Promise<void> {
  const response = await fetch("/api/gateway/auth/change-password", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  await readJson<void>(response);
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  const response = await fetch("/api/gateway/status", {
    credentials: "include",
  });

  return readJson<GatewayStatus>(response);
}
