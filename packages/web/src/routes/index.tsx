import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { getCurrentUser, getGatewayStatus, logout } from "../lib/gateway-api.ts";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();

  const currentUserQuery = useQuery({
    queryKey: ["gateway", "me"],
    queryFn: getCurrentUser,
  });

  const statusQuery = useQuery({
    queryKey: ["gateway", "status"],
    queryFn: getGatewayStatus,
    enabled: currentUserQuery.data != null,
  });

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  if (currentUserQuery.isLoading) {
    return <Shell>Loading session...</Shell>;
  }

  if (currentUserQuery.data === null || currentUserQuery.data === undefined) {
    return <Shell>Redirecting to login...</Shell>;
  }

  const currentUser = currentUserQuery.data;

  return (
    <Shell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">t3code gateway</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{currentUser.username}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link className="underline" to="/change-password">
            Change password
          </Link>
          <button
            className="rounded-md border border-border px-3 py-1.5"
            type="button"
            onClick={() => {
              void logout().then(() => navigate({ to: "/login" }));
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-medium">Gateway status</h2>
        {statusQuery.isLoading ? <p className="mt-2 text-sm">Loading status...</p> : null}
        {statusQuery.data ? (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Healthy</dt>
              <dd>{statusQuery.data.ok ? "yes" : "no"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{statusQuery.data.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Database migrated</dt>
              <dd>{statusQuery.data.database.migrated ? "yes" : "no"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">t3code build</dt>
              <dd>{statusQuery.data.t3codeWeb.buildId ?? "not configured"}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </Shell>
  );
}

function Shell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-8">
        {children}
      </section>
    </main>
  );
}
