import { useState, type FormEvent } from "react";
import { ApiError } from "@/api/http";
import type { ProfileDetails } from "@/api/user/user.types";
import { useAuth } from "@/hooks/useAuth";
import { ProfileDetailsFields } from "@/components/ProfileDetailsFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorMark } from "@/components/ui/pixel-icon";

/**
 * Perfil progressivo do primeiro login: cidade + como conheceu, tudo opcional.
 * Aparece uma vez por conta (`onboarding_completed_at` no servidor); salvar ou
 * pular grava a data. Depois, os mesmos campos ficam na aba Perfil.
 */
export function OnboardingDialog({ blocked }: { blocked: boolean }) {
  const { user, completeOnboarding } = useAuth();
  const [skipped, setSkipped] = useState(false);
  const [details, setDetails] = useState<ProfileDetails>({
    city: user?.city ?? null,
    discovery_source: user?.discovery_source ?? null,
    discovery_source_other: user?.discovery_source_other ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = !blocked && !skipped && user?.onboarding_completed_at === null;
  const answered = details.city !== null || details.discovery_source !== null;

  function skip() {
    setSkipped(true);
    // Rede falhou? Fecha nesta sessão mesmo assim; o servidor pergunta de novo no próximo login.
    completeOnboarding({}).catch(() => {});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Sucesso preenche onboarding_completed_at, o que fecha o diálogo.
      await completeOnboarding({
        city_id: details.city?.id ?? null,
        discovery_source: details.discovery_source,
        discovery_source_other: details.discovery_source_other,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // Esc, X e clique fora = pular.
    <Dialog open={open} onOpenChange={(next) => !next && !submitting && skip()}>
      {/* text-foreground: o body da cena pinta texto branco, que sumiria no tema claro. */}
      <DialogContent className="text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete seu perfil</DialogTitle>
          <DialogDescription>Com sua cidade, sugerimos ONGs perto de você.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <ProfileDetailsFields value={details} onChange={setDetails} />
          {error && (
            <p role="alert" className="flex items-start gap-2.5 text-sm text-destructive">
              <ErrorMark />
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" disabled={submitting} onClick={skip}>
              Pular
            </Button>
            <Button type="submit" size="lg" disabled={!answered || submitting}>
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
