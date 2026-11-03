import { lazy, Suspense, useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { ApiError } from "@/api/http";
import {
  applyMyReferral,
  getMyReferralSummary,
  getReferralPreview,
} from "@/api/referral/referral.routes";
import {
  normalizeReferralCode,
  REFERRAL_CODE_PATTERN,
} from "@/api/referral/referral.logic";
import type { ReferrerPreview, ReferralSummary } from "@/api/referral/referral.types";
import type { CustomizationCatalog } from "@/api/customizationApi";
import type { RewardNotifications } from "@/components/hooks/useCustomizationCatalog";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadGoogleIdentity } from "@/lib/googleIdentity";
import { readProjectStorage } from "@/lib/projectStorage";
import { AuthDialog, AuthPanel } from "@/components/AuthDialog";
import { GameMenu, type MyDonation } from "@/components/GameMenu";
import { IntroVideoDialog } from "@/components/IntroVideoDialog";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { ReferralDialog } from "@/components/referral/ReferralDialog";
import { ShareDialog } from "@/components/referral/ShareDialog";
import { NightToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PixelBuilding } from "@/components/ui/pixel-icon";

const RewardDialog = lazy(() => import("@/components/pass/RewardDialog"));

function initialReferralCode() {
  return normalizeReferralCode(new URLSearchParams(window.location.search).get("ref") ?? "");
}

const INTRO_SEEN_KEY = "cidoe:intro-video-seen";

/** Storage bloqueado conta como visto: sem como lembrar, melhor não repetir a cada visita. */
function introSeen() {
  try {
    return readProjectStorage(localStorage, INTRO_SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* storage bloqueado */
  }
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

type AuthMenuProps = {
  /** Modo noite da cena (`EnvironmentSettings.night`), controlado por aqui. */
  night: boolean;
  onNightChange: (night: boolean) => void;
  /** Edifícios próprios da sessão. */
  myDonations: readonly MyDonation[];
  catalog: CustomizationCatalog | null;
  rewards: RewardNotifications;
  onRefreshRewards: () => void;
  onOpenDonation: (donationId: number) => void;
  onBrowseMyBuildings: () => void;
  /** Login controlado pelo editor: o modal de contribuição também pede login. */
  authOpen: boolean;
  onAuthOpenChange: (open: boolean) => void;
  /** Segura o onboarding do 1º login enquanto outro fluxo ocupa a tela. */
  onboardingBlocked: boolean;
};

/** Autenticação, onboarding do primeiro login, menu do usuário (GameMenu) e entrada única dos fluxos de indicação da cena. */
export function AuthMenu({
  night,
  onNightChange,
  myDonations,
  catalog,
  rewards,
  onRefreshRewards,
  onOpenDonation,
  onBrowseMyBuildings,
  authOpen,
  onAuthOpenChange,
  onboardingBlocked,
}: AuthMenuProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [initialCode] = useState(initialReferralCode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState("donations");
  const [referralCode, setReferralCode] = useState(initialCode);
  const [referralPreview, setReferralPreview] = useState<ReferrerPreview | null>(null);
  const [referralLoading, setReferralLoading] = useState(
    REFERRAL_CODE_PATTERN.test(initialCode),
  );
  const [referralError, setReferralError] = useState<string | null>(
    initialCode && !REFERRAL_CODE_PATTERN.test(initialCode)
      ? "Código inválido."
      : null,
  );
  const [summaryState, setSummaryState] = useState<{
    userId: number;
    data: ReferralSummary | null;
    error: string | null;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedReferrer, setAppliedReferrer] = useState<ReferrerPreview | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Link de indicação sempre mostra o vídeo, mesmo já visto.
  const [introOpen, setIntroOpen] = useState(() => initialCode !== "" || !introSeen());
  const isMobile = useIsMobile();
  // `?ref=` abre o login uma vez; fechar mantém o código para a próxima abertura.
  const [linkAuthOpen, setLinkAuthOpen] = useState(initialCode !== "");

  function changeMenuOpen(open: boolean) {
    setMenuOpen(open);
    if (open && !menuOpen) onRefreshRewards();
  }

  const summary = summaryState?.userId === user?.id ? summaryState?.data ?? null : null;
  const summaryError = summaryState?.userId === user?.id ? summaryState?.error ?? null : null;
  const effectiveAuthOpen = authOpen || (!isLoading && !isAuthenticated && linkAuthOpen);
  // Só visitante: sessão (cookie httpOnly) sobrevive a limpar o localStorage, então
  // conta logada nunca vê.
  const showIntro = introOpen && !isLoading && !isAuthenticated && !authOpen;
  // Desktop: login sempre ao lado do vídeo. Mobile: vídeo primeiro, login depois.
  const videoOpen = showIntro || (!isMobile && effectiveAuthOpen);

  // Viu uma vez ou entrou na conta → não mostra mais neste navegador.
  useEffect(() => {
    if (showIntro || user) markIntroSeen();
  }, [showIntro, user]);

  useEffect(() => {
    if (!REFERRAL_CODE_PATTERN.test(referralCode)) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      getReferralPreview(referralCode, controller.signal)
        .then((preview) => {
          setReferralPreview(preview);
          setReferralError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setReferralPreview(null);
          setReferralError(messageFrom(error, "Erro ao consultar indicação"));
        })
        .finally(() => {
          if (!controller.signal.aborted) setReferralLoading(false);
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [referralCode]);

  useEffect(() => {
    if (!user || user.is_admin) return;
    let cancelled = false;

    getMyReferralSummary()
      .then((data) => {
        if (!cancelled) setSummaryState({ userId: user.id, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSummaryState({
            userId: user.id,
            data: null,
            error: messageFrom(error, "Erro ao carregar indicações"),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  function changeAuthOpen(open: boolean) {
    if (!open) setLinkAuthOpen(false);
    onAuthOpenChange(open);
  }

  // Mobile não tem login no vídeo: fechar segue para o login do link de indicação.
  function closeVideo() {
    setIntroOpen(false);
    if (!isMobile) changeAuthOpen(false);
  }

  function changeReferralCode(rawCode: string) {
    const code = normalizeReferralCode(rawCode);
    setReferralCode(code);
    setReferralPreview(null);
    setAppliedReferrer(null);
    setApplyError(null);

    if (!code) {
      setReferralLoading(false);
      setReferralError(null);
    } else if (!REFERRAL_CODE_PATTERN.test(code)) {
      setReferralLoading(false);
      setReferralError("Código inválido.");
    } else {
      setReferralLoading(true);
      setReferralError(null);
    }
  }

  function clearPendingReferral() {
    changeReferralCode("");
    const url = new URL(window.location.href);
    if (url.searchParams.has("ref")) {
      url.searchParams.delete("ref");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }

  async function confirmReferral() {
    if (!user || !summary || !referralPreview) return;
    setApplying(true);
    setApplyError(null);
    try {
      const result = await applyMyReferral(referralCode);
      setAppliedReferrer(result.referrer);
      setSummaryState({
        userId: user.id,
        data: { ...summary, can_apply_referral: false, referrer: result.referrer },
        error: null,
      });
    } catch (error) {
      setApplyError(messageFrom(error, "Erro ao confirmar indicação"));
    } finally {
      setApplying(false);
    }
  }

  async function refreshSummary() {
    if (!user || user.is_admin) return;
    try {
      const data = await getMyReferralSummary();
      setSummaryState({ userId: user.id, data, error: null });
    } catch (error) {
      setSummaryState({
        userId: user.id,
        data: null,
        error: messageFrom(error, "Erro ao carregar indicações"),
      });
    }
  }

  const referralDialogError =
    referralError ??
    applyError ??
    (user?.is_admin ? "Contas administrativas não participam do sistema de indicações." : summaryError);
  const referralDialogLoading =
    referralLoading ||
    (!referralDialogError && !summary && !user?.is_admin);

  if (isAuthenticated && user) {
    // Tela principal mostra o primeiro nome da conta; username só no menu.
    const firstName = user.name?.trim().split(/\s+/)[0] || user.username;
    const visibleName = firstName.length > 18 ? `${firstName.slice(0, 18)}…` : firstName;

    return (
      <>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            title="Meus edifícios"
            aria-label="Meus edifícios"
            onClick={onBrowseMyBuildings}
          >
            <PixelBuilding />
            <span className="hidden sm:inline">Meus edifícios</span>
          </Button>
          {summary && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShareOpen(true)}
              title="Compartilhar indicação"
              aria-label="Compartilhar indicação"
            >
              <Share2 />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="max-w-[14rem] pl-1.25 pr-1.25 sm:pr-3"
            title={firstName}
            aria-haspopup="dialog"
            onClick={() => {
              changeMenuOpen(true);
              void refreshSummary();
            }}
          >
            {/* 26px + moldura 2px = 30 na área de 36 do botão (h-10 menos bisel pb-1): 3px de respiro. Sobrescreve o data-[size=sm]:size-8 do Avatar, que vence um size-* solto. */}
            <Avatar size="sm" className="data-[size=sm]:size-6.5">
              {user.profile_image && <AvatarImage src={user.profile_image} alt="" />}
              <AvatarFallback>
                {firstName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate max-sm:sr-only">{visibleName}</span>
          </Button>
        </div>
        <GameMenu
          open={menuOpen}
          onOpenChange={changeMenuOpen}
          tab={menuTab}
          onTabChange={setMenuTab}
          night={night}
          onNightChange={onNightChange}
          donations={myDonations}
          catalog={catalog}
          onOpenDonation={onOpenDonation}
          referralSummary={summary}
          referralError={summaryError}
          rewards={rewards}
        />
        {summary && (
          <ShareDialog open={shareOpen} onOpenChange={setShareOpen} url={summary.link} />
        )}
        <ReferralDialog
          open={referralCode !== "" && !effectiveAuthOpen}
          code={referralCode}
          preview={referralPreview}
          summary={summary}
          loading={referralDialogLoading}
          error={referralDialogError}
          submitting={applying}
          appliedReferrer={appliedReferrer}
          onConfirm={confirmReferral}
          onCancel={clearPendingReferral}
        />
        {(rewards.pending.length > 0 || rewards.choice) && user.onboarding_completed_at !== null && !effectiveAuthOpen && referralCode === "" && !menuOpen && !shareOpen && !onboardingBlocked && (
          <Suspense fallback={null}>
            <RewardDialog key={user.id} rewards={rewards} />
          </Suspense>
        )}
        {/* Não empilha modal: espera indicação pendente, menu e compartilhar fecharem. */}
        <OnboardingDialog blocked={referralCode !== "" || menuOpen || shareOpen || onboardingBlocked} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Deslogado não tem menu — o mesmo toggle fica ao lado do "Entrar". */}
        <NightToggle night={night} onNightChange={onNightChange} />
        {/* Ponteiro/foco no "Entrar" já adianta o script do Google (carrega sob demanda). */}
        <Button
          type="button"
          variant="outline"
          onPointerEnter={() => void loadGoogleIdentity().catch(() => {})}
          onFocus={() => void loadGoogleIdentity().catch(() => {})}
          onClick={() => onAuthOpenChange(true)}
        >
          Entrar
        </Button>
      </div>
      <AuthDialog
        open={isMobile && effectiveAuthOpen && !showIntro}
        onOpenChange={changeAuthOpen}
        referralCode={referralCode}
        referralPreview={referralPreview}
        referralLoading={referralLoading}
        referralError={referralError}
        onReferralCodeChange={changeReferralCode}
        onReferralRemove={clearPendingReferral}
        onReferralApplied={clearPendingReferral}
      />
      <IntroVideoDialog
        open={videoOpen}
        onOpenChange={(next) => {
          if (!next) closeVideo();
        }}
        panel={
          <AuthPanel
            referralCode={referralCode}
            referralPreview={referralPreview}
            referralLoading={referralLoading}
            referralError={referralError}
            onReferralCodeChange={changeReferralCode}
            onReferralRemove={clearPendingReferral}
            onReferralApplied={clearPendingReferral}
            onDone={closeVideo}
          />
        }
      />
    </>
  );
}
