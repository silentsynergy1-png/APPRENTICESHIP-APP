"use client";

import { Trash2 } from "lucide-react";
import { useActionCall } from "@/components/action-form";
import { deleteMaintenance } from "../actions";

export function DeleteMaintenanceButton({ id, toolId }: { id: string; toolId: string }) {
  const { pending, run } = useActionCall();
  return (
    <button type="button" aria-label="Remove maintenance record" disabled={pending} className="text-muted-foreground hover:text-destructive" onClick={() => run(() => deleteMaintenance(id, toolId))}>
      <Trash2 className="size-3.5" />
    </button>
  );
}
