import type { EnvironmentRecord } from "@t3code-gateway/contracts/schemas";
import { CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button.tsx";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Switch } from "../../components/ui/switch.tsx";

export function EnvironmentTable({
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

export function EnvironmentTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <table className="w-full min-w-[860px] table-fixed text-left text-xs">
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
      <col className="w-64" />
    </colgroup>
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
