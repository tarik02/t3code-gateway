import { create } from "zustand";

type OpenInput = {
  readonly environmentId: string;
  readonly clientLabel: string | null;
};

type T3CodeCatalogPopoverStore = {
  readonly openEnvironmentId: string | null;
  readonly editingClientLabel: boolean;
  readonly clientLabelInput: string;
  readonly openFor: (input: OpenInput) => void;
  readonly close: () => void;
  readonly editClientLabel: () => void;
  readonly useRememberedClientLabel: () => void;
  readonly setClientLabelInput: (clientLabelInput: string) => void;
};

export const useT3CodeCatalogPopoverStore = create<T3CodeCatalogPopoverStore>((set) => ({
  openEnvironmentId: null,
  editingClientLabel: false,
  clientLabelInput: "",
  openFor: ({ environmentId, clientLabel }) =>
    set({
      openEnvironmentId: environmentId,
      editingClientLabel: clientLabel === null,
      clientLabelInput: clientLabel ?? "",
    }),
  close: () =>
    set({
      openEnvironmentId: null,
      editingClientLabel: false,
      clientLabelInput: "",
    }),
  editClientLabel: () => set({ editingClientLabel: true }),
  useRememberedClientLabel: () => set({ editingClientLabel: false }),
  setClientLabelInput: (clientLabelInput) => set({ clientLabelInput }),
}));
