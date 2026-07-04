import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { getCurrentUser, listEnvironments } from "../../lib/gateway-api.ts";

export const Route = createFileRoute("/envs/")({
  component: EnvironmentsPage,
});

function EnvironmentsPage() {
  const navigate = useNavigate();

  const currentUserQuery = useQuery({
    queryKey: ["gateway", "me"],
    queryFn: getCurrentUser,
  });

  const environmentsQuery = useQuery({
    queryKey: ["gateway", "environments"],
    queryFn: listEnvironments,
    enabled: currentUserQuery.data != null,
  });

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  if (currentUserQuery.isLoading || currentUserQuery.data === null) {
    return <AdminShell title="Environments">Loading...</AdminShell>;
  }

  return (
    <AdminShell
      title="Environments"
      description="Manage attached t3code environments registered with this gateway."
    >
      <div className="flex justify-end">
        <Link className="rounded-md bg-foreground px-3 py-2 text-sm text-background" to="/envs/new">
          Add environment
        </Link>
      </div>

      {environmentsQuery.isLoading ? <p className="text-sm">Loading environments...</p> : null}
      {environmentsQuery.error ? (
        <p className="text-sm text-red-600">
          {environmentsQuery.error instanceof Error
            ? environmentsQuery.error.message
            : "Failed to load environments"}
        </p>
      ) : null}

      {environmentsQuery.data && environmentsQuery.data.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No environments yet. Add one to start routing and syncing credentials.
        </p>
      ) : null}

      {environmentsQuery.data && environmentsQuery.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Environment ID</th>
                <th className="px-4 py-3 font-medium">Public URL</th>
                <th className="px-4 py-3 font-medium">Enabled</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {environmentsQuery.data.map((environment) => (
                <tr
                  className="border-b border-border last:border-b-0"
                  key={environment.environmentId}
                >
                  <td className="px-4 py-3">{environment.label}</td>
                  <td className="px-4 py-3 font-mono text-xs">{environment.slug}</td>
                  <td className="px-4 py-3 font-mono text-xs">{environment.environmentId}</td>
                  <td className="px-4 py-3">
                    <a className="underline" href={environment.publicHttpBaseUrl}>
                      {environment.publicHttpBaseUrl}
                    </a>
                  </td>
                  <td className="px-4 py-3">{environment.enabled ? "yes" : "no"}</td>
                  <td className="px-4 py-3">
                    <Link
                      className="underline"
                      params={{ environmentId: environment.environmentId }}
                      to="/envs/$environmentId"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}
