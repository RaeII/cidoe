import { useState } from "react";
import { Trophy } from "lucide-react";
import { updateCustomizationCategory, updateCustomizationOption } from "@/api/admin/admin.routes";
import { ApiError } from "@/api/http";
import { formatUnlockCta, parseMoney, type UnlockRule } from "@/lib/unlock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import { Switch } from "@/components/ui/switch";

import type { UnlockTarget } from "@/lib/adminUnlock";

type Feedback = { ok: boolean; text: string } | null;

function parseCount(raw: string): number | null {
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Define o requisito de liberação de uma personalização.
 *
 * Cada eixo é um Switch + input. O Switch é o que torna impossível gravar
 * zero: "não exigir" é um estado do controle, não um número digitado — que é
 * exatamente o que impede a tela do usuário de dizer "R$ 30 e 0 indicações".
 */
export function UnlockDialog({
  target,
  onClose,
  onDone,
}: {
  target: UnlockTarget;
  onClose: () => void;
  onDone: (fb: Feedback) => void;
}) {
  const [requireDonation, setRequireDonation] = useState(target.unlock?.donationMin != null);
  const [donation, setDonation] = useState(
    target.unlock?.donationMin != null ? String(target.unlock.donationMin).replace(".", ",") : "",
  );
  const [requireReferral, setRequireReferral] = useState(target.unlock?.referralMin != null);
  const [referral, setReferral] = useState(
    target.unlock?.referralMin != null ? String(target.unlock.referralMin) : "",
  );
  const [mode, setMode] = useState<"all" | "any">(target.unlock?.mode ?? "all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const donationMin = requireDonation ? parseMoney(donation) : null;
  const referralMin = requireReferral ? parseCount(referral) : null;
  const incomplete =
    (requireDonation && donationMin === null) || (requireReferral && referralMin === null);
  const unlockMode = requireDonation && requireReferral ? mode : "all";
  const preview: UnlockRule =
    donationMin == null && referralMin == null ? null : { donationMin, referralMin, mode: unlockMode };

  async function handleSave() {
    setSaving(true);
    setError(null);
    // Manda os dois eixos sempre: este diálogo é dono da regra inteira, então
    // null aqui significa "limpa", não "não mexe".
    const payload = { unlockDonationMin: donationMin, unlockReferralMin: referralMin, unlockMode };
    try {
      if (target.kind === "option") await updateCustomizationOption(target.id, payload);
      else await updateCustomizationCategory(target.id, payload);
      onDone({ ok: true, text: `Liberação de "${target.label}" atualizada.` });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar liberação");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberação · {target.label}</DialogTitle>
          <DialogDescription>
            O que o usuário precisa fazer para conquistar esta personalização.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-3 pixel pixel-thin bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-sm font-semibold">Exigir doação</span>
                <p className="text-xs text-muted-foreground">
                  Soma de tudo que o usuário já doou.
                </p>
              </div>
              <Switch
                checked={requireDonation}
                onCheckedChange={setRequireDonation}
                aria-label="Exigir doação"
              />
            </div>
            {requireDonation && (
              // Campo com prefixo (DS): grupo `field`, R$ em bloco verde-100, input sem moldura.
              <div className="field flex h-11 items-stretch">
                <span aria-hidden="true" className="grid place-items-center bg-secondary px-3 font-mono text-sm text-secondary-foreground">R$</span>
                <input
                  className="min-w-0 flex-1 bg-transparent px-3.5 text-base outline-none placeholder:text-placeholder md:text-sm"
                  autoFocus
                  inputMode="decimal"
                  value={donation}
                  onChange={(e) => setDonation(e.target.value)}
                  placeholder="50,00"
                  aria-label="Valor mínimo de doação"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 pixel pixel-thin bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-sm font-semibold">Exigir indicações</span>
                <p className="text-xs text-muted-foreground">
                  Total histórico de pessoas que entraram pelo código dele.
                </p>
              </div>
              <Switch
                checked={requireReferral}
                onCheckedChange={setRequireReferral}
                aria-label="Exigir indicações"
              />
            </div>
            {requireReferral && (
              <Input
                inputMode="numeric"
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
                placeholder="3"
                aria-label="Número mínimo de indicações"
              />
            )}
          </div>

          {requireDonation && requireReferral && (
            <fieldset className="space-y-2 pixel pixel-thin bg-card px-3 pb-3">
              {/* Sem borda real, a legend encosta na moldura: o pt dá o respiro. */}
              <legend className="pt-3 mono-label">Como liberar</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="unlock-mode" value="all" checked={mode === "all"} onChange={() => setMode("all")} />
                Doação + indicação (cumprir as duas metas)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="unlock-mode" value="any" checked={mode === "any"} onChange={() => setMode("any")} />
                Doação ou indicação (cumprir uma das metas)
              </label>
            </fieldset>
          )}

          <div className="pixel pixel-thin bg-background p-3">
            <span className="mono-label text-muted-foreground">
              O usuário vai ler
            </span>
            <p className="mt-1 text-sm font-medium">{formatUnlockCta(preview)}</p>
          </div>

          {target.unlockedCount > 0 && (
            <p className="flex items-start gap-2 bg-secondary p-3 text-xs text-secondary-foreground">
              <Trophy className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong>{target.unlockedCount}</strong>{" "}
                {target.unlockedCount === 1 ? "usuário já conquistou" : "usuários já conquistaram"}{" "}
                esta personalização e {target.unlockedCount === 1 ? "mantém" : "mantêm"} o acesso.
                A regra nova só vale para quem ainda não conquistou.
              </span>
            </p>
          )}

          {incomplete && (
            <p className="flex gap-2 text-sm text-destructive">
              <ErrorMark />
              Preencha um valor maior que zero, ou desligue a exigência.
            </p>
          )}
          {error && (
            <p className="flex gap-2 text-sm text-destructive">
              <ErrorMark />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={saving || (!requireDonation && !requireReferral)}
            onClick={() => {
              setRequireDonation(false);
              setRequireReferral(false);
            }}
          >
            Tornar grátis
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={() => void handleSave()} disabled={saving || incomplete}>
              {saving && <BlockLoader />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

