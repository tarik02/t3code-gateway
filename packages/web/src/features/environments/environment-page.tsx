import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  createT3CodeCatalogEntry,
  deleteEnvironment,
  getCurrentUser,
  listEnvironments,
  updateEnvironment,
} from "../../lib/gateway-api.ts";
import { AddEnvironmentDialog } from "./add-environment-dialog.tsx";
import { useAddEnvironmentDialogStore } from "./add-environment-store.ts";
import { EditEnvironmentDialog } from "./edit-environment-dialog.tsx";
import { useEditEnvironmentDialogStore } from "./edit-environment-store.ts";
import { EnvironmentTable, EnvironmentTableSkeleton } from "./environment-table.tsx";
import { PairingDialog } from "./pairing-dialog.tsx";
import { usePairingDialogStore } from "./pairing-dialog-store.ts";
import { ENVIRONMENTS_QUERY_KEY, CURRENT_USER_QUERY_KEY, IS_BROWSER } from "./query-keys.ts";
import { SessionsDialog } from "./sessions-dialog.tsx";
import { useSessionsDialogStore } from "./sessions-dialog-store.ts";
import {
  installT3CodeCatalogEntry,
  listInstalledT3CodeEnvironmentIds,
  removeT3CodeCatalogEnvironment,
} from "./t3code-catalog-storage.ts";

const t3CodeClientLabelStorageKey = "t3code-gateway:t3code-client-label";

export function EnvironmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openAddDialog = useAddEnvironmentDialogStore((state) => state.setOpen);
  const openEditDialog = useEditEnvironmentDialogStore((state) => state.openFor);
  const openPairingDialog = usePairingDialogStore((state) => state.openFor);
  const openSessionsDialog = useSessionsDialogStore((state) => state.openFor);
  const [deletingEnvironmentId, setDeletingEnvironmentId] = useState<string | null>(null);
  const [t3CodeCatalogEnvironmentId, setT3CodeCatalogEnvironmentId] = useState<string | null>(null);
  const [installedT3CodeEnvironmentIds, setInstalledT3CodeEnvironmentIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [t3CodeClientLabel, setT3CodeClientLabel] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const currentUserQuery = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getCurrentUser,
    enabled: IS_BROWSER,
  });

  const environmentsQuery = useQuery({
    queryKey: ENVIRONMENTS_QUERY_KEY,
    queryFn: listEnvironments,
    enabled: IS_BROWSER && currentUserQuery.data != null,
  });

  const refreshInstalledT3CodeEnvironmentIds = useCallback(async () => {
    if (!IS_BROWSER) {
      return;
    }

    setInstalledT3CodeEnvironmentIds(await listInstalledT3CodeEnvironmentIds());
  }, []);

  const rememberT3CodeClientLabel = useCallback((clientLabel: string) => {
    window.localStorage.setItem(t3CodeClientLabelStorageKey, clientLabel);
    setT3CodeClientLabel(clientLabel);
  }, []);

  const enabledMutation = useMutation({
    mutationFn: (input: { readonly environmentId: string; readonly enabled: boolean }) =>
      updateEnvironment(input.environmentId, { enabled: input.enabled }),
    onSuccess: async () => {
      setRowError(null);
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
    },
    onError: (cause) => {
      setRowError(cause instanceof Error ? cause.message : "Update failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEnvironment,
    onSuccess: async () => {
      setRowError(null);
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
    },
    onError: (cause) => {
      setRowError(cause instanceof Error ? cause.message : "Delete failed");
    },
    onSettled: () => {
      setDeletingEnvironmentId(null);
    },
  });

  const installT3CodeCatalogMutation = useMutation({
    mutationFn: async (input: { readonly environmentId: string; readonly clientLabel: string }) => {
      const entry = await createT3CodeCatalogEntry(input.environmentId, {
        clientLabel: input.clientLabel,
      });
      await installT3CodeCatalogEntry(entry);
    },
    onSuccess: async () => {
      setRowError(null);
      await refreshInstalledT3CodeEnvironmentIds();
    },
    onError: (cause) => {
      setRowError(cause instanceof Error ? cause.message : "Add to web failed");
    },
    onSettled: () => {
      setT3CodeCatalogEnvironmentId(null);
    },
  });

  const removeT3CodeCatalogMutation = useMutation({
    mutationFn: removeT3CodeCatalogEnvironment,
    onSuccess: async () => {
      setRowError(null);
      await refreshInstalledT3CodeEnvironmentIds();
    },
    onError: (cause) => {
      setRowError(cause instanceof Error ? cause.message : "Remove from web failed");
    },
    onSettled: () => {
      setT3CodeCatalogEnvironmentId(null);
    },
  });

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  useEffect(() => {
    if (IS_BROWSER) {
      setT3CodeClientLabel(window.localStorage.getItem(t3CodeClientLabelStorageKey));
    }
  }, []);

  useEffect(() => {
    if (currentUserQuery.data !== null && currentUserQuery.data !== undefined) {
      void refreshInstalledT3CodeEnvironmentIds().catch((cause: unknown) => {
        setRowError(cause instanceof Error ? cause.message : "Could not read web environments");
      });
    }
  }, [currentUserQuery.data, refreshInstalledT3CodeEnvironmentIds]);

  if (
    !IS_BROWSER ||
    currentUserQuery.isLoading ||
    currentUserQuery.data === null ||
    currentUserQuery.data === undefined
  ) {
    return (
      <AdminShell>
        <EnvironmentTableSkeleton />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      actions={
        <Button size="xs" type="button" onClick={() => openAddDialog(true)}>
          <PlusIcon data-icon="inline-start" />
          Add environment
        </Button>
      }
    >
      {environmentsQuery.error ? (
        <p className="text-xs text-destructive-foreground">
          {environmentsQuery.error instanceof Error
            ? environmentsQuery.error.message
            : "Failed to load environments"}
        </p>
      ) : null}
      {rowError !== null ? <p className="text-xs text-destructive-foreground">{rowError}</p> : null}

      {environmentsQuery.isLoading ? (
        <EnvironmentTableSkeleton />
      ) : (
        <EnvironmentTable
          deletingEnvironmentId={deletingEnvironmentId}
          environments={environmentsQuery.data ?? []}
          installedT3CodeEnvironmentIds={installedT3CodeEnvironmentIds}
          isDeleting={deleteMutation.isPending}
          isUpdatingEnabled={enabledMutation.isPending}
          isUpdatingT3CodeCatalog={
            installT3CodeCatalogMutation.isPending || removeT3CodeCatalogMutation.isPending
          }
          t3CodeCatalogEnvironmentId={t3CodeCatalogEnvironmentId}
          t3CodeClientLabel={t3CodeClientLabel}
          onDelete={(environment) => {
            if (window.confirm("Remove this environment?")) {
              setDeletingEnvironmentId(environment.environmentId);
              deleteMutation.mutate(environment.environmentId);
            }
          }}
          onEdit={openEditDialog}
          onInstallInT3Code={(environment, clientLabel) => {
            setT3CodeCatalogEnvironmentId(environment.environmentId);
            installT3CodeCatalogMutation.mutate({
              environmentId: environment.environmentId,
              clientLabel,
            });
          }}
          onSessions={openSessionsDialog}
          onPair={openPairingDialog}
          onRememberT3CodeClientLabel={rememberT3CodeClientLabel}
          onRemoveFromT3Code={(environment) => {
            setT3CodeCatalogEnvironmentId(environment.environmentId);
            removeT3CodeCatalogMutation.mutate(environment.environmentId);
          }}
          onToggleEnabled={(environment, enabled) =>
            enabledMutation.mutate({ environmentId: environment.environmentId, enabled })
          }
        />
      )}

      <AddEnvironmentDialog />
      <EditEnvironmentDialog />
      <PairingDialog />
      <SessionsDialog />
    </AdminShell>
  );
}
