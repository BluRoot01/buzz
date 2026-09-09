import * as React from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { invokeTauri } from "@/shared/api/tauri";
import type { CrmOperationalAccessConfirmation } from "@/shared/lib/ownerConfirmation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";

type ConfirmationResponse = { event_id: string };

export function CrmOperationalAccessConfirmationCard({
  channelId,
  requestEventId,
  payload,
}: {
  channelId: string;
  requestEventId: string;
  payload: CrmOperationalAccessConfirmation;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmedEventId, setConfirmedEventId] = React.useState<string | null>(
    null,
  );

  const confirm = async () => {
    setSubmitting(true);
    try {
      const response = await invokeTauri<ConfirmationResponse>(
        "confirm_crm_operational_access_request",
        { requestEventId, channelId },
      );
      setConfirmedEventId(response.event_id);
      toast.success("CRM channel access approved");
    } catch (error) {
      toast.error(
        `Approval failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2 max-w-lg rounded-xl border border-border bg-muted/35 p-4">
      <div className="flex items-start gap-3">
        {confirmedEventId ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        ) : (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {confirmedEventId
              ? "CRM access approved"
              : "Restore CRM channel access?"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Restores the listed channel agents to this existing CRM connection.
            High-impact actions still require a separate exact approval.
          </p>
          <div className="mt-3 text-xs text-muted-foreground">
            {payload.principals.length} principals · {payload.actions.length}{" "}
            bounded actions
          </div>
          {!confirmedEventId ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="mt-3" size="sm">
                  Review and approve
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Restore this channel’s CRM access?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This signs the exact principal and action list shown by the
                    requesting channel agent. Cancel creates no approval. A
                    changed tenant, channel, connection, principal, or action
                    list is rejected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p>
                    <strong>Allowed:</strong> ordinary operations listed in this
                    request
                  </p>
                  <p className="mt-1">
                    <strong>Still gated:</strong> deletes, schema, workflows,
                    and other high-impact actions
                  </p>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={submitting}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={submitting}
                    onClick={() => void confirm()}
                  >
                    {submitting ? "Approving…" : "Approve"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
    </div>
  );
}
