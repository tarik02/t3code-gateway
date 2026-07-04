import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 px-6 py-8">
        <h1 className="text-2xl font-semibold">t3code gateway</h1>
      </section>
    </main>
  );
}
