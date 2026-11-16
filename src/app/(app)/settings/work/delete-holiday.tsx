"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionCall } from "@/components/action-form";
import { deleteHoliday } from "../actions";

export function DeleteHolidayButton({ id }: { id: string }) {
  const { pending, run } = useActionCall();
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Remove holiday" disabled={pending} onClick={() => run(() => deleteHoliday(id))}>
      <Trash2 />
    </Button>
  );
}
