import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { cn } from "../../lib/utils.ts";

export function Field({
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
