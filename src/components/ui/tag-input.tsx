"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Chip list input: Enter or comma adds, Backspace on empty removes the last chip. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  max = 100,
  suggestions = [],
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  function add(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim().slice(0, 200))
      .filter(Boolean);
    if (!parts.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) if (!lower.has(p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft("");
  }
  const unusedSuggestions = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div>
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 shadow-soft transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25",
        )}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[13px]">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            if (e.target.value.includes(",")) add(e.target.value);
            else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-muted-foreground/70 sm:text-sm"
        />
      </div>
      {unusedSuggestions.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {unusedSuggestions.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-md border border-dashed border-border px-2 py-0.5 text-[12px] text-muted-foreground hover:border-primary/40 hover:text-foreground">
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
