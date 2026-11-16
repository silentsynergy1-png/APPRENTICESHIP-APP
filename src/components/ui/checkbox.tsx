import { cn } from "@/lib/utils";

/**
 * Native checkbox styled as a toggle row. Submits "on" when checked and, via a hidden
 * input, "off" when unchecked, so server actions always receive an explicit value.
 */
export function Checkbox({
  name,
  label,
  description,
  defaultChecked,
  className,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-subtle has-[:checked]:border-primary/40 has-[:checked]:bg-primary-soft/40", className)}>
      <input type="hidden" name={name} value="off" />
      <input
        type="checkbox"
        name={name}
        value="on"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="grid gap-0.5">
        <span className="text-[14px] font-medium">{label}</span>
        {description ? <span className="text-[12.5px] leading-relaxed text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}
