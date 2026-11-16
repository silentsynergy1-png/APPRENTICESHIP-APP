"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useActionCall } from "@/components/action-form";
import { deleteConversation } from "./actions";

export function DeleteConversationButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const { pending, run } = useActionCall();
  return (
    <button
      type="button"
      aria-label="Delete conversation"
      disabled={pending}
      className="hidden px-2 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 lg:block"
      onClick={() => confirm("Delete this conversation?") && run(() => deleteConversation(id), { onSuccess: () => active && router.push("/assistant") })}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
