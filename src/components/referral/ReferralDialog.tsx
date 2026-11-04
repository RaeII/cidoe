import type { ReferrerPreview, ReferralSummary } from "@/api/referral/referral.types";
import { getReferralStatus } from "@/api/referral/referral.logic";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReferralPerson } from "./ReferralPerson";

interface ReferralDialogProps {
  open: boolean;
  code: string;
  preview: ReferrerPreview | null;
  summary: ReferralSummary | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  appliedReferrer: ReferrerPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReferralDialog({
  open,
  code,
  preview,
  summary,
  loading,
  error,
  submitting,
  appliedReferrer,
  onConfirm,
  onCancel,
}: ReferralDialogProps) {
  const status = summary ? getReferralStatus(summary, code) : null;
  const isConfirmation = !loading && !error && !appliedReferrer && status === "confirm" && preview;

  let title = "Indicação";
  let description = "Verificando código de indicação…";
  let person: ReferrerPreview | null = null;

  if (error) {
    title = "Não foi possível usar a indicação";
    description = error;
  } else if (appliedReferrer) {
    title = "Indicação confirmada";
    description = "Sua conta foi vinculada à pessoa que indicou você.";
    person = appliedReferrer;
  } else if (status === "linked" && summary?.referrer) {
    title = "Indicação já registrada";
    description = "Sua conta já possui uma indicação permanente.";
    person = summary.referrer;
  } else if (status === "self") {
    title = "Código da própria conta";
    description = "Você não pode usar seu próprio código de indicação.";
  } else if (status === "expired" && summary) {
    title = "Prazo de indicação encerrado";
    description = `O prazo para informar uma indicação terminou em ${new Date(
      summary.apply_deadline,
    ).toLocaleDateString("pt-BR")}.`;
  } else if (isConfirmation) {
    title = "Confirmar indicação";
    description = `Confirme o código ${code} antes de vincular sua conta. Esta ação não pode ser desfeita.`;
    person = preview;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {person && (
          <ReferralPerson
            label={isConfirmation ? "Você foi indicado por" : "Indicado por"}
            person={person}
          />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            {isConfirmation ? "Agora não" : "Fechar"}
          </Button>
          {isConfirmation && (
            <Button type="button" onClick={onConfirm} disabled={submitting}>
              {submitting ? "Confirmando…" : "Confirmar indicação"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
