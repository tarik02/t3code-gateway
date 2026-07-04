import { create } from "zustand";

import { parsePairingFields, slugify } from "./form-utils.ts";

type AddEnvironmentDialogState = {
  readonly open: boolean;
  readonly label: string;
  readonly slug: string;
  readonly slugTouched: boolean;
  readonly host: string;
  readonly pairingCode: string;
  readonly error: string | null;
  readonly setOpen: (open: boolean) => void;
  readonly setLabel: (label: string) => void;
  readonly setSlug: (slug: string) => void;
  readonly setHost: (host: string) => void;
  readonly setPairingCode: (pairingCode: string) => void;
  readonly setError: (error: string | null) => void;
  readonly applyPairingFields: (value: string) => boolean;
  readonly reset: () => void;
};

const initialState = {
  open: false,
  label: "",
  slug: "",
  slugTouched: false,
  host: "",
  pairingCode: "",
  error: null,
};

export const useAddEnvironmentDialogStore = create<AddEnvironmentDialogState>((set, get) => ({
  ...initialState,
  setOpen: (open) => set({ open }),
  setLabel: (label) =>
    set((state) => ({
      label,
      slug: state.slugTouched ? state.slug : slugify(label),
    })),
  setSlug: (slug) => set({ slug, slugTouched: true }),
  setHost: (host) => {
    const parsed = parsePairingFields(host);
    if (parsed !== null) {
      set({ host: parsed.host, pairingCode: parsed.pairingCode });
      return;
    }
    set({ host });
  },
  setPairingCode: (pairingCode) => set({ pairingCode }),
  setError: (error) => set({ error }),
  applyPairingFields: (value) => {
    const parsed = parsePairingFields(value);
    if (parsed === null) {
      return false;
    }
    set({ host: parsed.host, pairingCode: parsed.pairingCode });
    return true;
  },
  reset: () => set({ ...initialState, open: get().open }),
}));
