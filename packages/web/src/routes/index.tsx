import type {
  EnvironmentClientSession,
  EnvironmentPairingLink,
  EnvironmentRecord,
} from "@t3code-gateway/contracts/schemas";
import { DEFAULT_BROWSER_TOKEN_SCOPES } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CopyIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AdminShell } from "../components/admin-shell.tsx";
import { Button } from "../components/ui/button.tsx";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover.tsx";
import { QRCodeSvg } from "../components/ui/qr-code.tsx";
import { Skeleton } from "../components/ui/skeleton.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { cn } from "../lib/utils.ts";
import {
  createEnvironmentPairingLink,
  createEnvironment,
  deleteEnvironment,
  getCurrentUser,
  listEnvironmentClients,
  listEnvironments,
  revokeEnvironmentClient,
  updateEnvironment,
} from "../lib/gateway-api.ts";

export const Route = createFileRoute("/")({
  component: Home,
});

const CURRENT_USER_QUERY_KEY = ["gateway", "me"] as const;
const ENVIRONMENTS_QUERY_KEY = ["gateway", "environments"] as const;
const IS_BROWSER = typeof window !== "undefined";
const environmentClientsQueryKey = (environmentId: string | undefined) =>
  ["gateway", "environments", environmentId, "clients"] as const;

function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState<EnvironmentRecord | null>(null);
  const [pairingEnvironment, setPairingEnvironment] = useState<EnvironmentRecord | null>(null);
  const [sessionsEnvironment, setSessionsEnvironment] = useState<EnvironmentRecord | null>(null);
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
      <AdminShell title="Gateway">
        <EnvironmentTableSkeleton />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Gateway"
      actions={
        <Button size="xs" type="button" onClick={() => setAddOpen(true)}>
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
          onEdit={(environment) => {
            setEditingEnvironment(environment);
            setEditOpen(true);
          }}
          onSessions={(environment) => {
            setSessionsEnvironment(environment);
            setSessionsOpen(true);
          }}
          onPair={(environment) => {
            setPairingEnvironment(environment);
            setPairingOpen(true);
          }}
          onToggleEnabled={(environment, enabled) =>
            enabledMutation.mutate({ environmentId: environment.environmentId, enabled })
          }
        />
      )}

      <AddEnvironmentDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditEnvironmentDialog
        environment={editingEnvironment}
        open={editOpen}
        onClosed={() => {
          setEditingEnvironment(null);
        }}
        onOpenChange={setEditOpen}
      />
      <PairingDialog
        environment={pairingEnvironment}
        open={pairingOpen}
        onClosed={() => {
          setPairingEnvironment(null);
        }}
        onOpenChange={setPairingOpen}
      />
      <SessionsDialog
        environment={sessionsEnvironment}
        open={sessionsOpen}
        onClosed={() => {
          setSessionsEnvironment(null);
        }}
        onOpenChange={setSessionsOpen}
      />
    </AdminShell>
  );
}

function EnvironmentTable({
  deletingEnvironmentId,
  environments,
  isDeleting,
  isUpdatingEnabled,
  onDelete,
  onEdit,
  onPair,
  onSessions,
  onToggleEnabled,
}: Readonly<{
  deletingEnvironmentId: string | null;
  environments: ReadonlyArray<EnvironmentRecord>;
  isDeleting: boolean;
  isUpdatingEnabled: boolean;
  onDelete: (environment: EnvironmentRecord) => void;
  onEdit: (environment: EnvironmentRecord) => void;
  onPair: (environment: EnvironmentRecord) => void;
  onSessions: (environment: EnvironmentRecord) => void;
  onToggleEnabled: (environment: EnvironmentRecord, enabled: boolean) => void;
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
      <table className="w-full min-w-[860px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[13%]" />
          <col />
          <col className="w-18" />
          <col className="w-64" />
        </colgroup>
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
                    href={environment.publicHttpBaseUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {environment.publicHttpBaseUrl}
                  </a>
                  <CopyUrlButton
                    copied={copiedUrlEnvironmentId === environment.environmentId}
                    label={environment.label}
                    onCopy={() => {
                      void navigator.clipboard.writeText(environment.publicHttpBaseUrl);
                      setCopiedUrlEnvironmentId(environment.environmentId);
                      window.setTimeout(() => setCopiedUrlEnvironmentId(null), 1200);
                    }}
                  />
                </div>
              </td>
              <td className="px-2 py-3 text-center">
                <Switch
                  checked={environment.enabled}
                  disabled={isUpdatingEnabled}
                  onCheckedChange={(checked) => onToggleEnabled(environment, checked)}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button size="xs" variant="outline" onClick={() => onPair(environment)}>
                    Pair
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onSessions(environment)}>
                    Sessions
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onEdit(environment)}>
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive-outline"
                    disabled={isDeleting}
                    onClick={() => onDelete(environment)}
                  >
                    {isDeleting && deletingEnvironmentId === environment.environmentId
                      ? "Deleting..."
                      : "Delete"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function EnvironmentTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <table className="w-full min-w-[860px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[13%]" />
          <col />
          <col className="w-18" />
          <col className="w-64" />
        </colgroup>
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

const AUTH_ORCHESTRATION_READ_SCOPE = "orchestration:read";
const AUTH_STANDARD_CLIENT_SCOPES = [...DEFAULT_BROWSER_TOKEN_SCOPES];
const PAIRING_SCOPE_OPTIONS: ReadonlyArray<{
  readonly scope: string;
  readonly title: string;
  readonly description: string;
}> = [
  {
    scope: AUTH_ORCHESTRATION_READ_SCOPE,
    title: "View environment",
    description: "Read threads, status, diffs, and configuration.",
  },
  {
    scope: "orchestration:operate",
    title: "Operate tasks",
    description: "Start tasks and perform changes in the environment.",
  },
  {
    scope: "terminal:operate",
    title: "Use terminals",
    description: "Create terminals and send input to running shells.",
  },
  {
    scope: "review:write",
    title: "Write reviews",
    description: "Create comments while reviewing changes.",
  },
  {
    scope: "access:read",
    title: "View access",
    description: "Inspect pairing links and authorized clients.",
  },
  {
    scope: "access:write",
    title: "Manage access",
    description: "Issue and revoke credentials for other clients.",
  },
  {
    scope: "relay:read",
    title: "View relay",
    description: "Inspect managed relay connectivity.",
  },
  {
    scope: "relay:write",
    title: "Manage relay",
    description: "Change managed tunnel connectivity.",
  },
];

function PairingDialog({
  environment,
  open,
  onClosed,
  onOpenChange,
}: Readonly<{
  environment: EnvironmentRecord | null;
  open: boolean;
  onClosed: () => void;
  onOpenChange: (open: boolean) => void;
}>) {
  const [clientLabel, setClientLabel] = useState("");
  const [scopes, setScopes] = useState<ReadonlyArray<string>>(AUTH_STANDARD_CLIENT_SCOPES);
  const [pairingLink, setPairingLink] = useState<EnvironmentPairingLink | null>(null);
  const [pairingResultView, setPairingResultView] = useState<"qr" | "details">("details");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const canSubmit = environment !== null && clientLabel.length > 0 && scopes.length > 0;
  const isShowingQrResult = pairingLink !== null && pairingResultView === "qr";

  const createMutation = useMutation({
    mutationFn: () => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return createEnvironmentPairingLink(environment.environmentId, {
        label: clientLabel,
        scopes,
      });
    },
    onSuccess: (result) => {
      setError(null);
      setCopied(null);
      setPairingResultView("details");
      setPairingLink(result);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Create failed");
    },
  });

  const toggleScope = (scope: string, checked: boolean) => {
    setScopes((current) =>
      checked
        ? current.includes(scope)
          ? current
          : [...current, scope]
        : current.filter((currentScope) => currentScope !== scope),
    );
  };

  const copyValue = async (kind: "link" | "code", value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
  };

  const resetDialogState = () => {
    setClientLabel("");
    setScopes(AUTH_STANDARD_CLIENT_SCOPES);
    setPairingLink(null);
    setPairingResultView("details");
    setError(null);
    setCopied(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          resetDialogState();
          onClosed();
        }
      }}
    >
      <DialogPopup
        className={cn(
          "border-border/60",
          isShowingQrResult
            ? "w-[min(calc(100vw-2rem),calc(100dvh-10rem),42rem)] max-w-none"
            : "max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{pairingLink === null ? "Create pairing link" : "Pairing link"}</DialogTitle>
        </DialogHeader>
        {pairingLink === null ? (
          <>
            <DialogPanel className="space-y-5">
              <Field
                label="Client label"
                value={clientLabel}
                onChange={setClientLabel}
                placeholder="MacBook"
              />
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Permissions</Label>
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={createMutation.isPending}
                      onClick={() => setScopes([AUTH_ORCHESTRATION_READ_SCOPE])}
                    >
                      Read only
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={createMutation.isPending}
                      onClick={() => setScopes(AUTH_STANDARD_CLIENT_SCOPES)}
                    >
                      Standard
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-border/60 rounded-lg border border-input bg-muted/25">
                  {PAIRING_SCOPE_OPTIONS.map(({ scope, title, description }) => (
                    <label
                      className="flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                      key={scope}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-foreground">{title}</span>
                        <span className="block text-xs leading-snug text-muted-foreground">
                          {description}
                        </span>
                      </span>
                      <Switch
                        className="mt-0.5"
                        checked={scopes.includes(scope)}
                        disabled={createMutation.isPending}
                        onCheckedChange={(checked) => toggleScope(scope, checked)}
                      />
                    </label>
                  ))}
                </div>
                {scopes.length === 0 ? (
                  <p className="text-xs text-destructive-foreground">
                    Select at least one permission.
                  </p>
                ) : null}
              </section>
              {error !== null ? (
                <p className="text-sm text-destructive-foreground">{error}</p>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              <Button
                size="xs"
                variant="outline"
                disabled={createMutation.isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                disabled={createMutation.isPending || !canSubmit}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Creating..." : "Create link"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogPanel className={isShowingQrResult ? "p-4 sm:p-5" : "space-y-4"}>
              {isShowingQrResult ? (
                <div className="mx-auto aspect-square w-full">
                  <QRCodeSvg
                    value={pairingLink.pairingUrl}
                    size={640}
                    level="M"
                    marginSize={2}
                    title="Pairing link"
                    className="size-full"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <PairingValue
                    label="Public link"
                    value={pairingLink.pairingUrl}
                    copied={copied === "link"}
                    onCopy={() => void copyValue("link", pairingLink.pairingUrl)}
                  />
                  <PairingValue
                    label="Pairing code"
                    value={pairingLink.pairingCode}
                    copied={copied === "code"}
                    onCopy={() => void copyValue("code", pairingLink.pairingCode)}
                  />
                </div>
              )}
            </DialogPanel>
            <DialogFooter className="sm:justify-between">
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  setPairingResultView((current) => (current === "qr" ? "details" : "qr"))
                }
              >
                {pairingResultView === "qr" ? "Show link" : "Show QR"}
              </Button>
              <Button size="xs" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}

function PairingValue({
  label,
  value,
  copied,
  onCopy,
}: Readonly<{
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          nativeInput
          readOnly
          value={value}
          className="font-mono text-xs [&_[data-slot=input]]:pr-10"
          onClick={(event) => event.currentTarget.select()}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className="absolute end-1 top-1/2 size-6 -translate-y-1/2 rounded-md"
          size="icon"
          title={copied ? "Copied" : "Copy"}
          variant="ghost"
          onClick={onCopy}
        >
          <CopyIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AddEnvironmentDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const formId = "add-environment-form";
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [host, setHost] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canSubmit =
    label.length > 0 && slug.length > 0 && host.length > 0 && pairingCode.length > 0;

  const createMutation = useMutation({
    mutationFn: createEnvironment,
    onSuccess: async () => {
      setLabel("");
      setSlug("");
      setSlugTouched(false);
      setHost("");
      setPairingCode("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
      onOpenChange(false);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Create failed");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl border-border/60">
        <DialogHeader>
          <DialogTitle>Add environment</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) {
                return;
              }
              createMutation.mutate({
                slug,
                label,
                internalHttpBaseUrl: host,
                pairingCode,
              });
            }}
          >
            <div className="flex flex-col gap-4">
              <Field
                label="Label"
                value={label}
                onChange={(value) => {
                  setLabel(value);
                  if (!slugTouched) {
                    setSlug(slugify(value));
                  }
                }}
                placeholder="Desktop"
              />
              <Field
                label="Slug"
                value={slug}
                onChange={(value) => {
                  setSlugTouched(true);
                  setSlug(value);
                }}
                placeholder="desktop"
              />
              <Field
                label="Host"
                value={host}
                onChange={(value) => {
                  const parsed = parsePairingFields(value);
                  if (parsed !== null) {
                    setHost(parsed.host);
                    setPairingCode(parsed.pairingCode);
                    return;
                  }
                  setHost(value);
                }}
                onPaste={applyPairingFields}
                placeholder="https://backend.example.com"
              />
              <Field
                label="Pairing code"
                value={pairingCode}
                onChange={setPairingCode}
                onPaste={applyPairingFields}
                placeholder="PAIRCODE"
              />
              {error !== null ? (
                <p className="text-sm text-destructive-foreground">{error}</p>
              ) : null}
            </div>
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button
            size="xs"
            variant="outline"
            type="button"
            disabled={createMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            form={formId}
            size="xs"
            type="submit"
            disabled={createMutation.isPending || !canSubmit}
          >
            <PlusIcon data-icon="inline-start" />
            {createMutation.isPending ? "Adding..." : "Add environment"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );

  function applyPairingFields(value: string): boolean {
    const parsed = parsePairingFields(value);
    if (parsed === null) {
      return false;
    }

    setHost(parsed.host);
    setPairingCode(parsed.pairingCode);
    return true;
  }
}

function EditEnvironmentDialog({
  environment,
  open,
  onClosed,
  onOpenChange,
}: Readonly<{
  environment: EnvironmentRecord | null;
  open: boolean;
  onClosed: () => void;
  onOpenChange: (open: boolean) => void;
}>) {
  const formId = "edit-environment-form";
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = environment !== null && label.length > 0 && slug.length > 0;

  useEffect(() => {
    if (environment === null) {
      return;
    }

    setLabel(environment.label);
    setSlug(environment.slug);
    setEnabled(environment.enabled);
    setError(null);
  }, [environment]);

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateEnvironment>[1]) => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return updateEnvironment(environment.environmentId, payload);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
      onOpenChange(false);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Update failed");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          onClosed();
        }
      }}
    >
      <DialogPopup className="max-w-xl border-border/60">
        <DialogHeader>
          <DialogTitle>Edit environment</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) {
                return;
              }
              updateMutation.mutate({ slug, label, enabled });
            }}
          >
            <div className="flex flex-col gap-4">
              <Field label="Label" value={label} onChange={setLabel} />
              <Field label="Slug" value={slug} onChange={setSlug} />
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Enabled</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </label>
              {error !== null ? (
                <p className="text-sm text-destructive-foreground">{error}</p>
              ) : null}
            </div>
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button
            form={formId}
            size="xs"
            type="submit"
            disabled={updateMutation.isPending || !canSubmit}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function SessionsDialog({
  environment,
  open,
  onClosed,
  onOpenChange,
}: Readonly<{
  environment: EnvironmentRecord | null;
  open: boolean;
  onClosed: () => void;
  onOpenChange: (open: boolean) => void;
}>) {
  const queryClient = useQueryClient();
  const [clientError, setClientError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const clientsQuery = useQuery({
    queryKey: environmentClientsQueryKey(environment?.environmentId),
    queryFn: () => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return listEnvironmentClients(environment.environmentId);
    },
    enabled: IS_BROWSER && open && environment !== null,
  });

  const revokeClientMutation = useMutation({
    mutationFn: (sessionId: string) => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return revokeEnvironmentClient(environment.environmentId, sessionId);
    },
    onSuccess: async () => {
      setClientError(null);
      await queryClient.invalidateQueries({
        queryKey: environmentClientsQueryKey(environment?.environmentId),
      });
    },
    onError: (cause) => {
      setClientError(cause instanceof Error ? cause.message : "Revoke failed");
    },
    onSettled: () => {
      setRevokingSessionId(null);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          onClosed();
        }
      }}
    >
      <DialogPopup className="h-[min(34rem,calc(100dvh-2rem))] max-w-2xl border-border/60">
        <DialogHeader>
          <DialogTitle>Authorized clients</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <DialogPanel>
            <ClientSessionsSection
              clients={clientsQuery.data ?? []}
              error={
                clientsQuery.error instanceof Error
                  ? clientsQuery.error.message
                  : clientsQuery.error
                    ? "Failed to load client sessions"
                    : clientError
              }
              isLoading={clientsQuery.isLoading}
              isRevoking={revokeClientMutation.isPending}
              revokingSessionId={revokingSessionId}
              onRevoke={(sessionId) => {
                if (window.confirm("Revoke this client session?")) {
                  setRevokingSessionId(sessionId);
                  revokeClientMutation.mutate(sessionId);
                }
              }}
            />
          </DialogPanel>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function ClientSessionsSection({
  clients,
  error,
  isLoading,
  isRevoking,
  revokingSessionId,
  onRevoke,
}: Readonly<{
  clients: ReadonlyArray<EnvironmentClientSession>;
  error: string | null;
  isLoading: boolean;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (sessionId: string) => void;
}>) {
  if (isLoading) {
    return <ClientSessionsSkeleton />;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm/4">
      {error !== null ? (
        <ClientSessionsMessage className="text-destructive-foreground">
          {error}
        </ClientSessionsMessage>
      ) : null}
      {clients.length === 0 ? (
        <ClientSessionsMessage>No client sessions.</ClientSessionsMessage>
      ) : null}
      {clients.map((clientSession) => (
        <ClientSessionRow
          clientSession={clientSession}
          isRevoking={isRevoking}
          key={clientSession.sessionId}
          revokingSessionId={revokingSessionId}
          onRevoke={onRevoke}
        />
      ))}
    </div>
  );
}

function ClientSessionsSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm/4">
      {[0, 1, 2].map((row) => (
        <div className="border-t border-border/60 px-4 py-3.5 first:border-t-0 sm:px-5" key={row}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-2 rounded-full" />
                <Skeleton className="h-4 w-36 rounded-full" />
              </div>
              <Skeleton className="h-3 w-56 max-w-full rounded-full" />
            </div>
            <Skeleton className="h-6 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientSessionRow({
  clientSession,
  isRevoking,
  revokingSessionId,
  onRevoke,
}: Readonly<{
  clientSession: EnvironmentClientSession;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (sessionId: string) => void;
}>) {
  const details = formatClientDetails(clientSession);
  const label =
    clientSession.client.label ??
    ([clientSession.client.os, clientSession.client.browser].filter(Boolean).join(" · ") ||
      clientSession.subject);

  return (
    <div className="border-t border-border/60 px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                clientSession.connected || clientSession.current
                  ? "bg-success"
                  : "bg-muted-foreground/30",
              )}
            />
            <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              {label}
            </h3>
            {clientSession.current ? <ClientBadge>This device</ClientBadge> : null}
            {clientSession.gatewayRole === "admin" ? <ClientBadge>Admin</ClientBadge> : null}
          </div>
          <p className="truncate text-xs text-muted-foreground/80">
            {details.length > 0 ? (
              <>
                {details}
                <span aria-hidden> · </span>
              </>
            ) : null}
            <AccessScopeSummary scopes={clientSession.scopes} label="Client scopes" />
          </p>
        </div>
        {!clientSession.current ? (
          <Button
            size="xs"
            variant="destructive-outline"
            type="button"
            disabled={isRevoking}
            onClick={() => onRevoke(clientSession.sessionId)}
          >
            {isRevoking && revokingSessionId === clientSession.sessionId ? "Revoking..." : "Revoke"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ClientBadge({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="rounded-md border border-border/50 bg-muted/50 px-1 py-0.5 text-[10px] text-muted-foreground/80">
      {children}
    </span>
  );
}

function AccessScopeSummary({
  scopes,
  label,
}: Readonly<{ scopes: ReadonlyArray<string>; label: string }>) {
  const scopeCountLabel = `${scopes.length} ${scopes.length === 1 ? "scope" : "scopes"}`;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={`${label}: show ${scopeCountLabel}`}
            className="cursor-help underline decoration-border underline-offset-2 outline-hidden hover:text-foreground focus-visible:text-foreground"
          />
        }
      >
        {scopeCountLabel}
      </PopoverTrigger>
      <PopoverPopup
        side="top"
        align="start"
        tooltipStyle
        className="w-max max-w-80 whitespace-normal"
      >
        <p className="mb-1 font-medium">Granted scopes</p>
        <div className="flex flex-col gap-0.5">
          {scopes.map((scope) => (
            <code key={scope} className="font-mono text-foreground/85">
              {scope}
            </code>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function ClientSessionsMessage({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn("px-4 py-3.5 text-xs text-muted-foreground sm:px-5", className)}>
      {children}
    </div>
  );
}

function formatClientDetails(clientSession: EnvironmentClientSession): string {
  const parts = [
    clientSession.client.deviceType,
    clientSession.client.os,
    clientSession.client.browser,
    clientSession.client.ipAddress,
  ].filter((part): part is string => part !== undefined && part.length > 0);

  return parts.join(" · ");
}

function parsePairingFields(
  value: string,
): { readonly host: string; readonly pairingCode: string } | null {
  try {
    const url = new URL(value);
    const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    const pairingCode = hashParams.get("token") ?? url.searchParams.get("token");
    if (pairingCode === null || pairingCode.length === 0) {
      return null;
    }

    const explicitHost = url.searchParams.get("host");
    if (explicitHost !== null && explicitHost.length > 0) {
      return { host: new URL(explicitHost).origin, pairingCode };
    }

    return { host: url.origin, pairingCode };
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function Field({
  className,
  label,
  value,
  onChange,
  onPaste,
  placeholder,
}: Readonly<{
  className?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPaste?: (value: string) => boolean;
  placeholder?: string;
}>) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      <Input
        nativeInput
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onPaste={(event) => {
          if (onPaste?.(event.clipboardData.getData("text")) === true) {
            event.preventDefault();
          }
        }}
      />
    </div>
  );
}
