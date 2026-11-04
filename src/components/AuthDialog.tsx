import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Gift } from "lucide-react";
import { ApiError } from "@/api/http";
import { requestLoginCode } from "@/api/auth/auth.routes";
import type { AuthChallenge, RegistrationRequiredResult } from "@/api/auth/auth.types";
import type { ReferrerPreview } from "@/api/referral/referral.types";
import { useAuth } from "@/hooks/useAuth";
import { ReferralPerson } from "@/components/referral/ReferralPerson";
import { TermsConsent } from "@/components/TermsConsent";
import { loadGoogleIdentity } from "@/lib/googleIdentity";
import { LEGAL_VERSION } from "@/lib/legal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = "email" | "code" | "profile";

/** Logo "G" do Google (4 cores, sem fundo). */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Erro do DS: "!" âmbar sobre tinta + frase clara. Sem vermelho. */
function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2.5 text-sm text-destructive">
      <ErrorMark />
      {children}
    </p>
  );
}

// Client ID público do Google (mesmo projeto do backend). Env sobrescreve.
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "234751630839-1cclfe773dck1v00tmknubila9e8tbq4.apps.googleusercontent.com";

// GIS avisa se `initialize` roda de novo: inicializa uma vez por página. O callback
// chama o painel montado no momento (cada abertura monta um novo).
let googleInitialized = false;
let onGoogleCredential: (credential: string) => void = () => {};

type AuthPanelProps = {
  referralCode: string;
  referralPreview: ReferrerPreview | null;
  referralLoading: boolean;
  referralError: string | null;
  onReferralCodeChange: (code: string) => void;
  /** Desiste da indicação: limpa o código e o `?ref=` da URL. */
  onReferralRemove: () => void;
  onReferralApplied: () => void;
  /** Login ou cadastro concluído. */
  onDone: () => void;
};

/** Segundos até `iso` (cooldown de reenvio), nunca negativo. */
function secondsUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

/**
 * Modal passwordless único: e-mail → código → perfil apenas para conta nova.
 * A prova do e-mail confirmado fica somente no estado React; fechar ou recarregar
 * elimina o progresso e exige outro código.
 */
export function AuthDialog({
  open,
  onOpenChange,
  ...panel
}: Omit<AuthPanelProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    // Fechar mantém a indicação; só "Remover indicação" descarta.
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* text-foreground: o body da cena pinta texto branco, que sumiria no tema claro. */}
      <DialogContent className="text-foreground sm:max-w-sm">
        <AuthPanel {...panel} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Conteúdo do login (título + passos + indicação), dentro de um `Dialog`: o
 * `AuthDialog` e a metade direita do vídeo de apresentação no desktop. Estado vive
 * só enquanto montado: fechar o modal desmonta e a próxima abertura começa limpa.
 */
export function AuthPanel({
  referralCode,
  referralPreview,
  referralLoading,
  referralError,
  onReferralCodeChange,
  onReferralRemove,
  onReferralApplied,
  onDone,
}: AuthPanelProps) {
  const { loginWithCode, completeRegistration, loginWithGoogle } = useAuth();

  const googleBtnRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("email");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [registration, setRegistration] = useState<RegistrationRequiredResult | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [showReferral, setShowReferral] = useState(false);
  // Erro do código só aparece depois de tentar entrar — digitar não deve acusar erro.
  const [showReferralError, setShowReferralError] = useState(false);
  // Campo de indicação só aparece via link (`?ref=` já preencheu o código) ou clique.
  const referralOpen = showReferral || referralCode !== "";
  const referralBlocked = referralCode !== "" && (referralLoading || !referralPreview);

  /** Trava o envio e revela o erro do código de indicação, se houver. */
  function blockedByReferral() {
    if (!referralBlocked) return false;
    setShowReferralError(true);
    return true;
  }

  // Contagem regressiva do cooldown de reenvio.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Mantém o handler do Google sempre atualizado (fecha no sucesso, mostra erro):
  // o GIS chama fora do ciclo do React, sem reinicializar o botão.
  useEffect(() => {
    onGoogleCredential = async (credential: string) => {
      if (blockedByReferral()) return;
      setError(null);
      setSubmitting(true);
      try {
        const result = await loginWithGoogle(credential);
        if (result.status === "authenticated") {
          onDone();
          return;
        }

        // 1º acesso: nada foi criado ainda — usuário confere nome e username.
        setRegistration(result);
        setEmail(result.email);
        setName(result.name ?? "");
        setUsername(result.username);
        setStep("profile");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Erro ao entrar com o Google");
      } finally {
        setSubmitting(false);
      }
    };
  });

  // Inicializa e renderiza o botão do Google no passo de e-mail. O script GIS só
  // baixa aqui (sob demanda); renderiza quando terminar de carregar.
  useEffect(() => {
    if (step !== "email" || !GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    const render = () => {
      const id = window.google?.accounts?.id;
      const el = googleBtnRef.current;
      if (cancelled || !id || !el) return;
      if (!googleInitialized) {
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r) => onGoogleCredential(r.credential),
          // Diálogo nativo do navegador (FedCM) em vez do popup — o popup gera aviso
          // de COOP no console. Navegador sem FedCM cai no popup sozinho.
          use_fedcm_for_button: true,
        });
        googleInitialized = true;
      }
      // Botão real do GIS: fica invisível (opacity 0) sobre o botão custom, então
      // o visual não importa — só precisa cobrir a área do clique. `width` casa
      // com a largura do wrapper pra o iframe receber o clique inteiro.
      id.renderButton(el, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: Math.min(400, Math.round(el.offsetWidth) || 320),
        locale: "pt-BR",
      });
    };

    // Sem o script (rede/bloqueador), o login por e-mail segue funcionando.
    loadGoogleIdentity().then(render, () => {});
    return () => {
      cancelled = true;
    };
  }, [step]);

  async function sendCode() {
    setError(null);
    setSubmitting(true);
    try {
      const ch = await requestLoginCode({ email });
      setChallenge(ch);
      setStep("code");
      // Dev: backend devolve debugCode (nunca em produção) → já preenche o campo.
      setCode(ch.debugCode ?? "");
      setResendIn(secondsUntil(ch.resendAvailableAt));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao enviar o código");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (blockedByReferral()) return;
    await sendCode();
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (!challenge || blockedByReferral()) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await loginWithCode({ challengeId: challenge.challengeId, code });
      if (result.status === "authenticated") {
        onDone();
        return;
      }

      setRegistration(result);
      setChallenge(null);
      setCode("");
      setStep("profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao validar o código");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!registration || !acceptedTerms || blockedByReferral()) return;

    if (Date.now() >= new Date(registration.expiresAt).getTime()) {
      setStep("email");
      setRegistration(null);
      setError("A verificação expirou. Entre novamente.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await completeRegistration({
        registrationToken: registration.registrationToken,
        name,
        username,
        referralCode: referralCode || undefined,
        termsVersion: LEGAL_VERSION,
      });
      if (referralCode) onReferralApplied();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao criar a conta");
    } finally {
      setSubmitting(false);
    }
  }

  const title = step === "profile" ? "Criar conta" : "Entrar";
  const description =
    step === "code"
      ? `Digite o código enviado para ${email}.`
      : step === "profile"
        ? "Confira seus dados antes de criar a conta."
        : "Entre com Google ou e-mail.";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {/* Passo de e-mail: descrição só pro leitor de tela (Radix exige uma). */}
        <DialogDescription className={step === "email" ? "sr-only" : undefined}>{description}</DialogDescription>
      </DialogHeader>

      {step === "email" ? (
        <div className="space-y-5">
          {/* Botão custom visível + botão real do GIS invisível por cima (recebe o clique). */}
          <div
            className={`group relative h-10 ${referralBlocked ? "opacity-50" : ""}`}
            onClick={referralBlocked ? () => setShowReferralError(true) : undefined}
          >
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              className={cn(buttonVariants({ variant: "outline" }), "pointer-events-none absolute inset-0 w-full gap-3 group-hover:bg-accent")}
            >
              <GoogleG className="size-5" />
              Continuar com Google
            </button>
            <div
              ref={googleBtnRef}
              className={`absolute inset-0 opacity-0 ${referralBlocked ? "pointer-events-none" : ""}`}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="mono-label text-muted-foreground">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={handleEmailSubmit} className="space-y-4">
          <Input
            id="auth-email"
            label="E-mail"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <FormError>{error}</FormError>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Enviando…" : "Continuar com E-mail"}
          </Button>
          </form>
        </div>
      ) : step === "code" ? (
        <form onSubmit={handleCodeSubmit} className="space-y-4">
          {challenge?.debugCode && (
            <p className="bg-secondary px-3 py-2 text-center text-sm text-secondary-foreground">
              Código (dev):{" "}
              <span className="font-mono font-semibold text-foreground">{challenge.debugCode}</span>
            </p>
          )}
          <Input
            id="auth-code"
            label="Código de 6 dígitos"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {error && <FormError>{error}</FormError>}
          <Button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full"
          >
            {submitting ? "Validando…" : "Continuar"}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              Trocar e-mail
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={resendIn > 0 || submitting}
              onClick={sendCode}
            >
              {resendIn > 0 ? `Reenviar (${resendIn}s)` : "Reenviar código"}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          {/* E-mail já verificado (código ou Google): só confirmação, não editável. */}
          <Input
            id="auth-confirm-email"
            label="E-mail"
            type="email"
            value={email}
            readOnly
            disabled
          />
          <Input
            id="auth-name"
            label="Nome"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            id="auth-username"
            label="Nome de usuário"
            required
            minLength={3}
            maxLength={45}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TermsConsent id="auth-terms" checked={acceptedTerms} onChange={setAcceptedTerms} />
          {error && <FormError>{error}</FormError>}
          <Button type="submit" disabled={submitting || !acceptedTerms} className="w-full">
            {submitting ? "Criando conta…" : "Criar conta"}
          </Button>
        </form>
      )}

      {/* Bloco de indicação destacado (fundo verde claro) pra não se confundir com os
          campos de login logo acima. */}
      {referralOpen ? (
        <div className="mt-3 space-y-4 bg-secondary p-4">
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center bg-primary text-primary-foreground">
              <Gift className="size-4" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Alguém te indicou o Cidoe?</p>
              <p className="text-xs text-muted-foreground">
                Opcional. Cole o código de quem te convidou.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Input
              id="auth-referral-code"
              label="Código de indicação"
              className="font-mono tracking-[0.15em]"
              placeholder="A1B2C3D4E5F60718"
              maxLength={16}
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus={showReferral}
              aria-invalid={showReferralError && referralError ? true : undefined}
              value={referralCode}
              onChange={(event) => {
                setShowReferralError(false);
                onReferralCodeChange(event.target.value);
              }}
            />
            {referralLoading && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <BlockLoader />
                Verificando indicação…
              </p>
            )}
            {showReferralError && referralError && <FormError>{referralError}</FormError>}
            {referralPreview && (
              <ReferralPerson label="Você foi indicado por" person={referralPreview} />
            )}
            {referralCode !== "" && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setShowReferral(false);
                  setShowReferralError(false);
                  onReferralRemove();
                }}
              >
                Remover indicação
              </button>
            )}
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" className="mt-3 h-auto min-h-10 w-full whitespace-normal py-2" onClick={() => setShowReferral(true)}>
          <Gift className="text-primary" aria-hidden />
          Tenho um código de indicação
        </Button>
      )}
    </>
  );
}
