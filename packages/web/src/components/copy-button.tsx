import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover.tsx";

const copiedFeedbackMs = 1200;

interface CopyButtonProps {
  readonly value: string;
  readonly label: string;
  readonly className?: string;
  readonly tooltip?: string;
  readonly copiedTooltip?: string;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly align?: "start" | "center" | "end";
}

export function CopyButton({
  value,
  label,
  className,
  tooltip = "Copy",
  copiedTooltip = "Copied",
  side = "top",
  align = "center",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);
  const Icon = copied ? CheckIcon : CopyIcon;

  useEffect(
    () => () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    },
    [],
  );

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);

    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
    }

    resetTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      resetTimeoutRef.current = null;
    }, copiedFeedbackMs);
  };

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={100}
        render={
          <Button
            aria-label={copied ? `${label} copied` : `Copy ${label}`}
            className={cn("size-6 rounded-md", className)}
            size="icon"
            variant="ghost"
            onClick={() => {
              void copy();
            }}
          />
        }
      >
        <Icon />
      </PopoverTrigger>
      <PopoverPopup className="whitespace-nowrap" side={side} align={align} tooltipStyle>
        {copied ? copiedTooltip : tooltip}
      </PopoverPopup>
    </Popover>
  );
}
