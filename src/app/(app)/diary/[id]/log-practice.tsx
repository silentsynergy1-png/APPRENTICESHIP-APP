"use client";

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionCall } from "@/components/action-form";
import { logDiaryPractice } from "@/app/(app)/progress/actions";

export interface PracticeSuggestion {
  id: string;
  title: string;
  status: string;
  alreadyLogged: boolean;
  matched: boolean;
}

/**
 * Suggests competencies that match the skills in this entry. Nothing is recorded until the
 * apprentice ticks and confirms; status moves to "practised" at most, never "completed".
 */
export function LogPractice({ entryId, entryDate, suggestions }: { entryId: string; entryDate: string; suggestions: PracticeSuggestion[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const { pending, run } = useActionCall();
  const available = suggestions.filter((s) => !s.alreadyLogged);
  const shown = showAll ? available : available.filter((s) => s.matched);
  const logged = suggestions.filter((s) => s.alreadyLogged);

  if (!suggestions.length) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Add competencies in <a href="/progress" className="text-primary hover:underline">Apprenticeship</a> to log this work as practice.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      {logged.length ? (
        <div className="flex flex-wrap gap-1.5 text-[12.5px]">
          <span className="text-muted-foreground">Logged as practice:</span>
          {logged.map((s) => (
            <span key={s.id} className="rounded-md bg-success-soft px-2 py-0.5 text-success">
              {s.title}
            </span>
          ))}
        </div>
      ) : null}
      {shown.length ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            {showAll ? "Tick the competencies this work counts towards." : "These look related to what you did today. Tick any that apply."}
          </p>
          <ul className="grid gap-1.5">
            {shown.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-[14px] hover:bg-subtle has-[:checked]:border-primary/40 has-[:checked]:bg-primary-soft/40">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={picked.has(s.id)}
                    onChange={(e) => {
                      const n = new Set(picked);
                      if (e.target.checked) n.add(s.id);
                      else n.delete(s.id);
                      setPicked(n);
                    }}
                  />
                  <span className="flex-1">{s.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">No obvious matches from this entry&apos;s skills.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || picked.size === 0}
          onClick={() => run(() => logDiaryPractice({ diaryEntryId: entryId, competencyIds: [...picked], occurredOn: entryDate }), { onSuccess: () => setPicked(new Set()) })}
        >
          {pending ? <Loader2 className="animate-spin" /> : <GraduationCap />} Log as practice
        </Button>
        {!showAll && available.length > shown.length ? (
          <Button variant="ghost" onClick={() => setShowAll(true)}>
            Choose from all competencies
          </Button>
        ) : null}
      </div>
      <p className="text-[12px] text-muted-foreground">This records practice only. You decide when something is completed.</p>
    </div>
  );
}
