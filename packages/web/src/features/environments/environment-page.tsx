import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
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

export function EnvironmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openAddDialog = useAddEnvironmentDialogStore((state) => state.setOpen);
  const openEditDialog = useEditEnvironmentDialogStore((state) => state.openFor);
  const openPairingDialog = usePairingDialogStore((state) => state.openFor);
  const openSessionsDialog = useSessionsDialogStore((state) => state.openFor);
  const [deletingEnvironmentId, setDeletingEnvironmentId] = useState<string | null>(null);
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

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

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
          isDeleting={deleteMutation.isPending}
          isUpdatingEnabled={enabledMutation.isPending}
          onDelete={(environment) => {
            if (window.confirm("Remove this environment?")) {
              setDeletingEnvironmentId(environment.environmentId);
              deleteMutation.mutate(environment.environmentId);
            }
          }}
          onEdit={openEditDialog}
          onSessions={openSessionsDialog}
          onPair={openPairingDialog}
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
