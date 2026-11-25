"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeTask } from "@/lib/sales/actions";

export function TaskDoneButton({ taskId, companyId }: { taskId: string; companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await completeTask(taskId, companyId);
          router.refresh();
        })
      }
    >
      <Check />
      Erledigt
    </Button>
  );
}
