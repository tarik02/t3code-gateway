import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { changePassword } from "../lib/gateway-api.ts";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setMessage("Password updated.");
      setError(null);
      setCurrentPassword("");
      setNextPassword("");
    },
    onError: (cause) => {
      setMessage(null);
      setError(cause instanceof Error ? cause.message : "Password change failed");
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Change password</h1>
        <p className="text-sm text-muted-foreground">Update the local gateway admin password.</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          changePasswordMutation.mutate({ currentPassword, nextPassword });
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Current password</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">New password</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            type="password"
            autoComplete="new-password"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />
        </label>

        {message !== null ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error !== null ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-60"
          type="submit"
          disabled={changePasswordMutation.isPending}
        >
          {changePasswordMutation.isPending ? "Saving..." : "Save password"}
        </button>
      </form>

      <Link className="text-sm text-muted-foreground underline" to="/">
        Back to dashboard
      </Link>
    </main>
  );
}
