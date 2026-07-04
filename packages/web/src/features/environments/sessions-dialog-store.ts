import type { EnvironmentRecord } from "@t3code-gateway/contracts/schemas";
import { create } from "zustand";

interface SessionsDialogState {
  readonly open: boolean;
  readonly environment: EnvironmentRecord | null;
  readonly clientError: string | null;
  readonly revokingSessionId: string | null;
  readonly openFor: (environment: EnvironmentRecord) => void;
  readonly setOpen: (open: boolean) => void;
  readonly setClientError: (clientError: string | null) => void;
  readonly setRevokingSessionId: (revokingSessionId: string | null) => void;
  readonly reset: () => void;
}

export const useSessionsDialogStore = create<SessionsDialogState>((set) => ({
  open: false,
  environment: null,
  clientError: null,
  revokingSessionId: null,
  openFor: (environment) =>
    set({
      open: true,
      environment,
      clientError: null,
      revokingSessionId: null,
    }),
  setOpen: (open) => set({ open }),
  setClientError: (clientError) => set({ clientError }),
  setRevokingSessionId: (revokingSessionId) => set({ revokingSessionId }),
  reset: () =>
    set({
      open: false,
      environment: null,
      clientError: null,
      revokingSessionId: null,
    }),
}));
