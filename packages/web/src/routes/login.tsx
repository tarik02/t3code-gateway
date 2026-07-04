import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { login } from "../lib/gateway-api.ts";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      setError(null);
      await navigate({ to: "/" });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Login failed");
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Gateway admin</h1>
        <p className="text-sm text-muted-foreground">Sign in to manage the t3code gateway.</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          loginMutation.mutate({ username, password });
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Username</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error !== null ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-60"
          type="submit"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
