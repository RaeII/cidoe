import { useState, type FormEvent } from "react";
import { ApiError } from "@/api/http";
import { useAuth } from "@/hooks/useAuth";
import { LEGAL_VERSION, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
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

const docLink = "font-semibold underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary";

/**
 * Aceite ativo: caixa nunca pré-marcada. Os links abrem em outra aba para não
 * perder o cadastro em andamento (a prova do e-mail vive só no estado React).
 */
export function TermsConsent({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 text-sm leading-relaxed">
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-px shrink-0"
      />
      <span>
        Tenho 18 anos ou mais, aceito os{" "}
        <a href={TERMS_PATH} target="_blank" rel="noopener" className={docLink}>
          Termos de Uso
        </a>{" "}
        e li a{" "}
        <a href={PRIVACY_PATH} target="_blank" rel="noopener" className={docLink}>
          Política de Privacidade
        </a>
        .
      </span>
    </label>
  );
}

/**
 * Reaceite: conta anterior aos termos (`terms_version` null) ou com versão
 * antiga. Segura a sessão até aceitar ou sair — sem X, Esc ou clique fora.
 * `blocked`: o evento dos times mostra o mesmo painel dentro dele (nada empilha).
 */
export function TermsDialog({ blocked = false }: { blocked?: boolean }) {
  const { user } = useAuth();
  const open = !blocked && user !== null && user.terms_version !== LEGAL_VERSION;

  return (
    <Dialog open={open}>
      {/* text-foreground: o body da cena pinta texto branco, que sumiria no tema claro. */}
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="text-foreground sm:max-w-md"
      >
        <TermsPanel />
      </DialogContent>
    </Dialog>
  );
}

/** Corpo do reaceite (título + caixa + Sair/Aceitar), dentro de um `Dialog`. */
export function TermsPanel() {
  const { user, acceptTerms, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updated = user?.terms_version != null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Sucesso grava terms_version = LEGAL_VERSION, o que fecha o diálogo.
      await acceptTerms(LEGAL_VERSION);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao registrar o aceite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{updated ? "Termos atualizados" : "Termos de Uso"}</DialogTitle>
        <DialogDescription>Para continuar com sua conta, leia e aceite.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-6">
        <TermsConsent id="terms-accept" checked={checked} onChange={setChecked} />
        {error && (
          <p role="alert" className="flex items-start gap-2.5 text-sm text-destructive">
            <ErrorMark />
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" size="lg" disabled={submitting} onClick={() => void logout()}>
            Sair
          </Button>
          <Button type="submit" size="lg" disabled={!checked || submitting}>
            {submitting ? "Salvando…" : "Aceitar"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
