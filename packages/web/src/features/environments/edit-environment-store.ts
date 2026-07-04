import type { EnvironmentRecord } from "@t3code-gateway/contracts/schemas";
import { create } from "zustand";

type EditEnvironmentDialogState = {
  readonly open: boolean;
  readonly environment: EnvironmentRecord | null;
  readonly label: string;
  readonly slug: string;
  readonly enabled: boolean;
  readonly error: string | null;
  readonly openFor: (environment: EnvironmentRecord) => void;
  readonly setOpen: (open: boolean) => void;
  readonly setLabel: (label: string) => void;
  readonly setSlug: (slug: string) => void;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly reset: () => void;
};

export const useEditEnvironmentDialogStore = create<EditEnvironmentDialogState>((set) => ({
  open: false,
  environment: null,
  label: "",
  slug: "",
  enabled: true,
  error: null,
  openFor: (environment) =>
    set({
      open: true,
      environment,
      label: environment.label,
      slug: environment.slug,
      enabled: environment.enabled,
      error: null,
    }),
  setOpen: (open) => set({ open }),
  setLabel: (label) => set({ label }),
  setSlug: (slug) => set({ slug }),
  setEnabled: (enabled) => set({ enabled }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      open: false,
      environment: null,
      label: "",
      slug: "",
      enabled: true,
      error: null,
    }),
}));
