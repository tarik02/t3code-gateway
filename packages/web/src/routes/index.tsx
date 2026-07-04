import { createFileRoute } from "@tanstack/react-router";

import { EnvironmentPage } from "../features/environments/environment-page.tsx";

export const Route = createFileRoute("/")({
  component: EnvironmentPage,
});
