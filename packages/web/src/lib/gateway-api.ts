import type {
  ChangePasswordRequest,
  CreateEnvironmentPairingLinkRequest,
  CurrentUser,
  EnvironmentClientSession,
  EnvironmentInput,
  EnvironmentPairingLink,
  EnvironmentRecord,
  GatewayStatus,
  LoginRequest,
  LoginResponse,
  RevokeEnvironmentClientResponse,
  TraefikConfigResponse,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
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

export async function getTraefikConfig(): Promise<TraefikConfigResponse> {
  const response = await fetch("/api/gateway/traefik/config", {
    credentials: "include",
  });

  return readJson<TraefikConfigResponse>(response);
}

export async function listEnvironments(): Promise<EnvironmentRecord[]> {
  const response = await fetch("/api/gateway/environments", {
    credentials: "include",
  });

  return readJson<EnvironmentRecord[]>(response);
}

export async function getEnvironment(environmentId: string): Promise<EnvironmentRecord> {
  const response = await fetch(`/api/gateway/environments/${encodeURIComponent(environmentId)}`, {
    credentials: "include",
  });

  return readJson<EnvironmentRecord>(response);
}

export async function validateEnvironment(
  payload: EnvironmentInput,
): Promise<ValidateEnvironmentResponse> {
  const response = await fetch("/api/gateway/environments/validate", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  return readJson<ValidateEnvironmentResponse>(response);
}

export async function validateEnvironmentForEdit(
  environmentId: string,
  payload: EnvironmentInput,
): Promise<ValidateEnvironmentResponse> {
  const response = await fetch(
    `/api/gateway/environments/${encodeURIComponent(environmentId)}/validate`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    },
  );

  return readJson<ValidateEnvironmentResponse>(response);
}

export async function createEnvironment(payload: EnvironmentInput): Promise<EnvironmentRecord> {
  const response = await fetch("/api/gateway/environments", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  return readJson<EnvironmentRecord>(response);
}

export async function updateEnvironment(
  environmentId: string,
  payload: UpdateEnvironmentRequest,
): Promise<EnvironmentRecord> {
  const response = await fetch(`/api/gateway/environments/${encodeURIComponent(environmentId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  return readJson<EnvironmentRecord>(response);
}

export async function deleteEnvironment(environmentId: string): Promise<void> {
  const response = await fetch(`/api/gateway/environments/${encodeURIComponent(environmentId)}`, {
    method: "DELETE",
    credentials: "include",
  });

  await readJson<void>(response);
}

export async function listEnvironmentClients(
  environmentId: string,
): Promise<EnvironmentClientSession[]> {
  const response = await fetch(
    `/api/gateway/environments/${encodeURIComponent(environmentId)}/clients`,
    {
      credentials: "include",
    },
  );

  return readJson<EnvironmentClientSession[]>(response);
}

export async function createEnvironmentPairingLink(
  environmentId: string,
  payload: CreateEnvironmentPairingLinkRequest,
): Promise<EnvironmentPairingLink> {
  const response = await fetch(
    `/api/gateway/environments/${encodeURIComponent(environmentId)}/pairing-link`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    },
  );

  return readJson<EnvironmentPairingLink>(response);
}

export async function revokeEnvironmentClient(
  environmentId: string,
  sessionId: string,
): Promise<RevokeEnvironmentClientResponse> {
  const response = await fetch(
    `/api/gateway/environments/${encodeURIComponent(environmentId)}/clients/${encodeURIComponent(sessionId)}/revoke`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  return readJson<RevokeEnvironmentClientResponse>(response);
}
