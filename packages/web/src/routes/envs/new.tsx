import { DEFAULT_BROWSER_TOKEN_SCOPES } from "@t3code-gateway/contracts/schemas";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { createEnvironment, validateEnvironment } from "../../lib/gateway-api.ts";

export const Route = createFileRoute("/envs/new")({
  component: NewEnvironmentPage,
});

function NewEnvironmentPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [internalHttpBaseUrl, setInternalHttpBaseUrl] = useState("http://127.0.0.1:3773");
  const [internalWsBaseUrl, setInternalWsBaseUrl] = useState("ws://127.0.0.1:3773");
  const [adminBearerToken, setAdminBearerToken] = useState("");
  const [browserTokenScopes, setBrowserTokenScopes] = useState(
    DEFAULT_BROWSER_TOKEN_SCOPES.join("\n"),
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validatedDescriptor, setValidatedDescriptor] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const payload = {
    slug,
    label,
    internalHttpBaseUrl,
    internalWsBaseUrl,
    adminBearerToken,
    browserTokenScopes: browserTokenScopes
      .split("\n")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0),
  };

  const validateMutation = useMutation({
    mutationFn: validateEnvironment,
    onSuccess: (result) => {
      setError(null);
      setValidationMessage(
        `Validated environment ${result.environmentId}. Public URL: ${result.publicHttpBaseUrl}`,
      );
      setValidatedDescriptor(result.descriptor);
    },
    onError: (cause) => {
      setValidationMessage(null);
      setValidatedDescriptor(null);
      setError(cause instanceof Error ? cause.message : "Validation failed");
    },
  });

  const createMutation = useMutation({
    mutationFn: createEnvironment,
    onSuccess: async (environment) => {
      setError(null);
      await navigate({
        to: "/envs/$environmentId",
        params: { environmentId: environment.environmentId },
      });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Create failed");
    },
  });

  return (
    <AdminShell
      title="Add environment"
      description="Validate connectivity and admin token access before saving."
    >
      <form
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate(payload);
        }}
      >
        <Field label="Slug" value={slug} onChange={setSlug} placeholder="desktop" />
        <Field label="Label" value={label} onChange={setLabel} placeholder="Desktop" />
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
        <label className="block space-y-1">
          <span className="text-sm font-medium">Admin bearer token</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            value={adminBearerToken}
            onChange={(event) => setAdminBearerToken(event.target.value)}
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

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
            type="button"
            disabled={validateMutation.isPending}
            onClick={() => {
              validateMutation.mutate(payload);
            }}
          >
            {validateMutation.isPending ? "Validating..." : "Validate"}
          </button>
          <button
            className="rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-60"
            type="submit"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Saving..." : "Save environment"}
          </button>
        </div>

        {validationMessage !== null ? (
          <p className="text-sm text-green-700">{validationMessage}</p>
        ) : null}
        {validatedDescriptor !== null ? (
          <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs">
            {JSON.stringify(validatedDescriptor, null, 2)}
          </pre>
        ) : null}
        {error !== null ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </AdminShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}>) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="w-full rounded-md border border-border bg-background px-3 py-2"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
