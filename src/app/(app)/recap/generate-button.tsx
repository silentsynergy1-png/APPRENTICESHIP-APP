"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionCall } from "@/components/action-form";
import { generateRecap } from "./actions";

export function GenerateRecapButton({ weekStart, regenerate }: { weekStart: string; regenerate?: boolean }) {
  const { pending, run } = useActionCall();
  return (
    <Button variant={regenerate ? "outline" : "default"} disabled={pending} onClick={() => run(() => generateRecap(weekStart))}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Writing your recap…" : regenerate ? "Regenerate" : "Write my AI recap"}
    </Button>
  );
}
