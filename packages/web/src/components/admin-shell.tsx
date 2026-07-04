import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function AdminShell({
  children,
  title,
  description,
}: Readonly<{
  children: ReactNode;
  title: string;
  description?: string;
}>) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="space-y-3">
          <nav className="text-sm text-muted-foreground">
            <Link className="underline" to="/">
              Dashboard
            </Link>
            <span className="px-2">/</span>
            <Link className="underline" to="/envs">
              Environments
            </Link>
          </nav>
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            {description !== undefined ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
