import { DEFAULT_BROWSER_TOKEN_SCOPES } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import {
  deleteEnvironment,
  getCurrentUser,
  getEnvironment,
  updateEnvironment,
  validateEnvironmentForEdit,
} from "../../lib/gateway-api.ts";

export const Route = createFileRoute("/envs/$environmentId")({
  component: EditEnvironmentPage,
});

function EditEnvironmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { environmentId } = Route.useParams();

  const currentUserQuery = useQuery({
    queryKey: ["gateway", "me"],
    queryFn: getCurrentUser,
  });

  const environmentQuery = useQuery({
    queryKey: ["gateway", "environments", environmentId],
    queryFn: () => getEnvironment(environmentId),
    enabled: currentUserQuery.data != null,
  });

  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [internalHttpBaseUrl, setInternalHttpBaseUrl] = useState("");
  const [internalWsBaseUrl, setInternalWsBaseUrl] = useState("");
  const [adminBearerToken, setAdminBearerToken] = useState("");
  const [browserTokenScopes, setBrowserTokenScopes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  useEffect(() => {
    if (environmentQuery.data === undefined) {
      return;
    }

    const environment = environmentQuery.data;
    setSlug(environment.slug);
    setLabel(environment.label);
    setInternalHttpBaseUrl(environment.internalHttpBaseUrl);
    setInternalWsBaseUrl(environment.internalWsBaseUrl);
    setBrowserTokenScopes(environment.browserTokenScopes.join("\n"));
    setEnabled(environment.enabled);
    setAdminBearerToken("");
  }, [environmentQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateEnvironment>[1]) =>
      updateEnvironment(environmentId, payload),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["gateway", "environments"] });
      await queryClient.invalidateQueries({ queryKey: ["gateway", "environments", environmentId] });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Update failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEnvironment(environmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gateway", "environments"] });
      await navigate({ to: "/envs" });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Delete failed");
    },
  });

  const validateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof validateEnvironmentForEdit>[1]) =>
      validateEnvironmentForEdit(environmentId, payload),
    onSuccess: (result) => {
      setValidationMessage(`Validated ${result.environmentId}`);
      setError(null);
    },
    onError: (cause) => {
      setValidationMessage(null);
      setError(cause instanceof Error ? cause.message : "Validation failed");
    },
  });

  if (currentUserQuery.isLoading || environmentQuery.isLoading) {
    return <AdminShell title="Environment">Loading...</AdminShell>;
  }

  if (environmentQuery.error) {
    return (
      <AdminShell title="Environment">
        <p className="text-sm text-red-600">
          {environmentQuery.error instanceof Error
            ? environmentQuery.error.message
            : "Failed to load environment"}
        </p>
      </AdminShell>
    );
  }

  const environment = environmentQuery.data;
  if (environment === undefined) {
    return <AdminShell title="Environment">Environment not found.</AdminShell>;
  }

  return (
    <AdminShell
      title={environment.label}
      description={`Registered environment ${environment.environmentId}`}
    >
      <form
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          updateMutation.mutate({
            slug,
            label,
            internalHttpBaseUrl,
            internalWsBaseUrl,
            enabled,
            browserTokenScopes: browserTokenScopes
              .split("\n")
              .map((scope) => scope.trim())
              .filter((scope) => scope.length > 0),
            ...(adminBearerToken.length > 0 ? { adminBearerToken } : {}),
          });
        }}
      >
        <Field label="Slug" value={slug} onChange={setSlug} />
        <Field label="Label" value={label} onChange={setLabel} />
        <Field
          label="Internal HTTP base URL"
          value={internalHttpBaseUrl}
          onChange={setInternalHttpBaseUrl}
        />
        <Field
          label="Internal WebSocket base URL"
          value={internalWsBaseUrl}
          onChange={setInternalWsBaseUrl}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={enabled}
            type="checkbox"
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>Enabled</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Replace admin bearer token (optional)</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            value={adminBearerToken}
            onChange={(event) => setAdminBearerToken(event.target.value)}
            placeholder="Leave blank to keep the stored token"
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Browser token scopes (one per line)</span>
          <textarea
            className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            value={browserTokenScopes}
            onChange={(event) => setBrowserTokenScopes(event.target.value)}
          />
        </label>

        <dl className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Environment ID</dt>
            <dd className="font-mono text-xs">{environment.environmentId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Public HTTP URL</dt>
            <dd>{environment.publicHttpBaseUrl}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Public WebSocket URL</dt>
            <dd>{environment.publicWsBaseUrl}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Default scopes</dt>
            <dd className="font-mono text-xs">{DEFAULT_BROWSER_TOKEN_SCOPES.join(", ")}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
            type="button"
            disabled={validateMutation.isPending || adminBearerToken.length === 0}
            onClick={() => {
              if (adminBearerToken.length === 0) {
                setError("Enter a bearer token to run validation against the environment.");
                return;
              }
              validateMutation.mutate({
                slug,
                label,
                internalHttpBaseUrl,
                internalWsBaseUrl,
                adminBearerToken,
                browserTokenScopes: browserTokenScopes
                  .split("\n")
                  .map((scope) => scope.trim())
                  .filter((scope) => scope.length > 0),
              });
            }}
          >
            {validateMutation.isPending ? "Validating..." : "Validate token and connectivity"}
          </button>
          <button
            className="rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-60"
            type="submit"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </button>
          <button
            className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-60"
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm("Remove this environment from the gateway registry?")) {
                deleteMutation.mutate();
              }
            }}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>

        {validationMessage !== null ? (
          <p className="text-sm text-green-700">{validationMessage}</p>
        ) : null}
        {error !== null ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>

      {environment.descriptor !== undefined ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Descriptor snapshot</h2>
          <pre className="overflow-x-auto rounded-md border border-border p-3 text-xs">
            {JSON.stringify(environment.descriptor, null, 2)}
          </pre>
        </section>
      ) : null}
    </AdminShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="w-full rounded-md border border-border bg-background px-3 py-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
