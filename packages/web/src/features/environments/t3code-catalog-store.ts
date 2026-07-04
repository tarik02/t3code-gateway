import type { T3CodeCatalogEntryResponse } from "@t3code-gateway/contracts/schemas";
import { create } from "zustand";

import { IS_BROWSER } from "./query-keys.ts";
import {
  installT3CodeCatalogEntry,
  listInstalledT3CodeEnvironmentIds,
  removeT3CodeCatalogEnvironment,
} from "./t3code-catalog-storage.ts";

const t3CodeClientLabelStorageKey = "t3code-gateway:t3code-client-label";

type T3CodeCatalogStore = {
  readonly installedEnvironmentIds: ReadonlySet<string>;
  readonly clientLabel: string | null;
  readonly load: () => Promise<void>;
  readonly rememberClientLabel: (clientLabel: string) => void;
  readonly installEntry: (entry: T3CodeCatalogEntryResponse) => Promise<void>;
  readonly removeEnvironment: (environmentId: string) => Promise<void>;
};

export const useT3CodeCatalogStore = create<T3CodeCatalogStore>((set) => ({
  installedEnvironmentIds: new Set(),
  clientLabel: null,
  load: async () => {
    if (!IS_BROWSER) {
      return;
    }

    set({
      clientLabel: window.localStorage.getItem(t3CodeClientLabelStorageKey),
      installedEnvironmentIds: await listInstalledT3CodeEnvironmentIds(),
    });
  },
  rememberClientLabel: (clientLabel) => {
    window.localStorage.setItem(t3CodeClientLabelStorageKey, clientLabel);
    set({ clientLabel });
  },
  installEntry: async (entry) => {
    await installT3CodeCatalogEntry(entry);
    set({ installedEnvironmentIds: await listInstalledT3CodeEnvironmentIds() });
  },
  removeEnvironment: async (environmentId) => {
    await removeT3CodeCatalogEnvironment(environmentId);
    set({ installedEnvironmentIds: await listInstalledT3CodeEnvironmentIds() });
  },
}));
