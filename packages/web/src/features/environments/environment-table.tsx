import type { EnvironmentRecord } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import {
  createT3CodeCatalogEntry,
  deleteEnvironment,
  updateEnvironment,
} from "../../lib/gateway-api.ts";
import { ENVIRONMENTS_QUERY_KEY } from "./query-keys.ts";
import { useT3CodeCatalogStore } from "./t3code-catalog-store.ts";

export function EnvironmentTable({
  environments,
  onEdit,
  onPair,
  onSessions,
}: Readonly<{
  environments: ReadonlyArray<EnvironmentRecord>;
  onEdit: (environment: EnvironmentRecord) => void;
  onPair: (environment: EnvironmentRecord) => void;
  onSessions: (environment: EnvironmentRecord) => void;
}>) {
  const [copiedUrlEnvironmentId, setCopiedUrlEnvironmentId] = useState<string | null>(null);

  if (environments.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        No environments.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
      <table className="w-full min-w-[980px] table-fixed text-left text-xs">
        <EnvironmentTableColumns />
        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Public URL</th>
            <th className="px-2 py-3 text-center font-medium">Enabled</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {environments.map((environment) => (
            <tr className="border-b border-border last:border-b-0" key={environment.environmentId}>
              <td className="truncate px-4 py-3">{environment.label}</td>
              <td className="truncate px-4 py-3 font-mono text-xs">{environment.slug}</td>
              <td className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-1">
                  <a
                    className="min-w-0 [overflow-wrap:anywhere] text-primary hover:underline"
                    href={environment.publicUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {environment.publicUrl}
                  </a>
                  <CopyUrlButton
                    copied={copiedUrlEnvironmentId === environment.environmentId}
                    label={environment.label}
                    onCopy={() => {
                      void navigator.clipboard.writeText(environment.publicUrl);
                      setCopiedUrlEnvironmentId(environment.environmentId);
                      window.setTimeout(() => setCopiedUrlEnvironmentId(null), 1200);
                    }}
                  />
                </div>
              </td>
              <td className="px-2 py-3 text-center">
                <EnvironmentEnabledSwitch environment={environment} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <T3CodeCatalogButton environment={environment} />
                  <Button size="xs" variant="outline" onClick={() => onPair(environment)}>
                    Pair
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onSessions(environment)}>
                    Sessions
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onEdit(environment)}>
                    Edit
                  </Button>
                  <DeleteEnvironmentButton environment={environment} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvironmentEnabledSwitch({
  environment,
}: Readonly<{
  environment: EnvironmentRecord;
}>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateEnvironment(environment.environmentId, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
    },
    onError: (cause) => {
      window.alert(cause instanceof Error ? cause.message : "Update failed");
    },
  });

  return (
    <Switch
      checked={environment.enabled}
      disabled={mutation.isPending}
      onCheckedChange={(checked) => mutation.mutate(checked)}
    />
  );
}

function DeleteEnvironmentButton({
  environment,
}: Readonly<{
  environment: EnvironmentRecord;
}>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteEnvironment(environment.environmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
    },
    onError: (cause) => {
      window.alert(cause instanceof Error ? cause.message : "Delete failed");
    },
  });

  return (
    <Button
      size="xs"
      variant="destructive-outline"
      disabled={mutation.isPending}
      onClick={() => {
        if (window.confirm("Remove this environment?")) {
          mutation.mutate();
        }
      }}
    >
      {mutation.isPending ? "Deleting..." : "Delete"}
    </Button>
  );
}

export function EnvironmentTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <table className="w-full min-w-[980px] table-fixed text-left text-xs">
        <EnvironmentTableColumns />
        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Public URL</th>
            <th className="px-2 py-3 text-center font-medium">Enabled</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((row) => (
            <tr className="border-b border-border last:border-b-0" key={row}>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-32 rounded-full" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-24 rounded-full" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-64 max-w-full rounded-full" />
              </td>
              <td className="px-2 py-3">
                <Skeleton className="mx-auto h-5 w-9 rounded-full" />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-10 rounded-md" />
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-10 rounded-md" />
                  <Skeleton className="h-6 w-12 rounded-md" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvironmentTableColumns() {
  return (
    <colgroup>
      <col className="w-[16%]" />
      <col className="w-[13%]" />
      <col />
      <col className="w-18" />
      <col className="w-80" />
    </colgroup>
  );
}

function T3CodeCatalogButton({
  environment,
}: Readonly<{
  environment: EnvironmentRecord;
}>) {
  const installedEnvironmentIds = useT3CodeCatalogStore((state) => state.installedEnvironmentIds);
  const clientLabel = useT3CodeCatalogStore((state) => state.clientLabel);
  const rememberClientLabel = useT3CodeCatalogStore((state) => state.rememberClientLabel);
  const installEntry = useT3CodeCatalogStore((state) => state.installEntry);
  const removeEnvironment = useT3CodeCatalogStore((state) => state.removeEnvironment);
  const [open, setOpen] = useState(false);
  const [editingClientLabel, setEditingClientLabel] = useState(false);
  const [clientLabelInput, setClientLabelInput] = useState(clientLabel ?? "");
  const installed = installedEnvironmentIds.has(environment.environmentId);
  const installMutation = useMutation({
    mutationFn: async (nextClientLabel: string) => {
      const entry = await createT3CodeCatalogEntry(environment.environmentId, {
        clientLabel: nextClientLabel,
      });
      await installEntry(entry);
    },
    onError: (cause) => {
      window.alert(cause instanceof Error ? cause.message : "Add to web failed");
    },
  });
  const removeMutation = useMutation({
    mutationFn: () => removeEnvironment(environment.environmentId),
    onError: (cause) => {
      window.alert(cause instanceof Error ? cause.message : "Remove from web failed");
    },
  });
  const isPending = installMutation.isPending || removeMutation.isPending;

  useEffect(() => {
    if (open) {
      setClientLabelInput(clientLabel ?? "");
      setEditingClientLabel(clientLabel === null);
    }
  }, [clientLabel, open]);

  if (installed) {
    return (
      <Button
        size="xs"
        variant="outline"
        disabled={isPending}
        onClick={() => removeMutation.mutate()}
      >
        {isPending ? "Removing..." : "Remove web"}
      </Button>
    );
  }

  const rememberAndInstall = (nextClientLabel: string) => {
    rememberClientLabel(nextClientLabel);
    installMutation.mutate(nextClientLabel);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="xs" variant="outline" disabled={isPending} />}>
        {isPending ? "Adding..." : "Add web"}
      </PopoverTrigger>
      <PopoverPopup className="w-72" side="bottom" align="end">
        {clientLabel !== null && !editingClientLabel ? (
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Client label</p>
              <p className="min-h-4 truncate text-xs text-muted-foreground">
                {clientLabel.length > 0 ? clientLabel : "No label"}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="xs" variant="outline" onClick={() => setEditingClientLabel(true)}>
                Change
              </Button>
              <Button size="xs" onClick={() => rememberAndInstall(clientLabel)}>
                Add
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              rememberAndInstall(clientLabelInput);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label>Client label</Label>
              <Input
                nativeInput
                value={clientLabelInput}
                placeholder={environment.label}
                onChange={(event) => setClientLabelInput(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              {clientLabel !== null ? (
                <Button size="xs" variant="outline" onClick={() => setEditingClientLabel(false)}>
                  Back
                </Button>
              ) : null}
              <Button size="xs" type="submit">
                Add
              </Button>
            </div>
          </form>
        )}
      </PopoverPopup>
    </Popover>
  );
}

function CopyUrlButton({
  copied,
  label,
  onCopy,
}: Readonly<{
  copied: boolean;
  label: string;
  onCopy: () => void;
}>) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={100}
        render={
          <Button
            aria-label={copied ? `${label} public URL copied` : `Copy ${label} public URL`}
            className="size-5 rounded-sm opacity-55 hover:opacity-100 [&_svg]:size-3"
            size="icon"
            variant="ghost"
            onClick={onCopy}
          />
        }
      >
        <CopyIcon />
      </PopoverTrigger>
      <PopoverPopup className="whitespace-nowrap" side="top" align="center" tooltipStyle>
        {copied ? "Copied" : "Copy URL"}
      </PopoverPopup>
    </Popover>
  );
}
