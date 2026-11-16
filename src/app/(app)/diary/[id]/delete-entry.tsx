"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionCall } from "@/components/action-form";
import { deleteDiaryEntry } from "../actions";

export function DeleteEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const { pending, run } = useActionCall();
  return (
    <Button
      variant="ghost"
      className="text-destructive hover:bg-destructive-soft"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this diary entry and its photos? This can't be undone.")) {
          run(() => deleteDiaryEntry(id), { onSuccess: () => router.push("/diary"), refresh: false });
        }
      }}
    >
      <Trash2 /> Delete entry
    </Button>
  );
}
