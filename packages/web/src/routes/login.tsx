import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
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
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl shadow-black/20">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-border bg-primary text-sm font-semibold text-primary-foreground">
            T3
          </div>
          <div>
            <h1 className="text-base font-semibold leading-5">t3code</h1>
          </div>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate({ username, password });
          }}
        >
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              nativeInput
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              nativeInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error !== null ? <p className="text-xs text-destructive-foreground">{error}</p> : null}

          <Button className="w-full" size="xs" type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
