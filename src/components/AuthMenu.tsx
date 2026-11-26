import { lazy, Suspense, useEffect, useState } from "react";
import { Play, Share2 } from "lucide-react";
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
import { readPendingClub } from "@/lib/clubPending";
import { loadGoogleIdentity } from "@/lib/googleIdentity";
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
const ClubEventDialog = lazy(() => import("@/components/club/ClubEventDialog"));

function initialReferralCode() {
  return normalizeReferralCode(new URLSearchParams(window.location.search).get("ref") ?? "");
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
  showMyBuildingsButton?: boolean;
  showMenuButton?: boolean;
  /** Login controlado pelo editor: o modal de contribuição também pede login. */
  authOpen: boolean;
  onAuthOpenChange: (open: boolean) => void;
  /** Segura o onboarding do 1º login enquanto outro fluxo ocupa a tela. */
  onboardingBlocked: boolean;
  /** Evento dos times aberto (link `?time=`, Trocar time no telão ou resgate); `club` = slug do link. */
  clubEvent: { club: string | null; pick?: boolean; claim?: boolean } | null;
  onClubChosen: (remap: (keys: readonly string[]) => string[]) => void;
  onClubEventClose: () => void;
  /** Abre o evento para resgatar o time que o visitante escolheu antes de entrar. */
  onClubClaim: (club: string) => void;
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
  showMyBuildingsButton = true,
  showMenuButton = true,
  authOpen,
  onAuthOpenChange,
  onboardingBlocked,
  clubEvent,
  onClubChosen,
  onClubEventClose,
  onClubClaim,
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
  const [introOpen, setIntroOpen] = useState(false);
  const isMobile = useIsMobile();

  function changeMenuOpen(open: boolean) {
    setMenuOpen(open);
    if (open && !menuOpen) onRefreshRewards();
  }

  const summary = summaryState?.userId === user?.id ? summaryState?.data ?? null : null;
  const summaryError = summaryState?.userId === user?.id ? summaryState?.error ?? null : null;
  // Só visitante: sessão (cookie httpOnly) sobrevive a limpar o localStorage, então
  // conta logada nunca vê.
  const showIntro = introOpen && !isLoading && !isAuthenticated && !authOpen;
  // Desktop mantém vídeo ao lado do login; mobile tem diálogos separados.
  const videoOpen = showIntro || (!isMobile && authOpen);

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

  // Evento dos times: time que o visitante escolheu espera o login (`lib/clubPending`). Lido uma vez por
  // login (ou sessão no boot); modal do evento já aberto nessa hora (login dentro dele, link) cuida
  // sozinho. Lido na renderização, não em efeito: até o resgate abrir (tela livre: login fechado,
  // nenhum fluxo do editor), segura os outros modais como se o evento já estivesse aberto, e o
  // onboarding da conta nova não pisca antes.
  const [pendingClaim, setPendingClaim] = useState<{ userId: number; club: string | null } | null>(null);
  if (!user) {
    if (pendingClaim) setPendingClaim(null);
  } else if (pendingClaim?.userId !== user.id) {
    setPendingClaim({ userId: user.id, club: clubEvent ? null : readPendingClub() });
  } else if (clubEvent && pendingClaim.club) {
    setPendingClaim({ userId: user.id, club: null });
  }
  const claimWaiting = (user && pendingClaim?.userId === user.id && pendingClaim.club) || null;
  useEffect(() => {
    if (claimWaiting && !clubEvent && !authOpen && !onboardingBlocked) onClubClaim(claimWaiting);
  }, [claimWaiting, clubEvent, authOpen, onboardingBlocked, onClubClaim]);

  function closeVideo() {
    setIntroOpen(false);
    if (!isMobile) onAuthOpenChange(false);
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

  // Evento dos times fica por cima de tudo: indicação, conquistas e onboarding esperam ele fechar.
  // Mesma `key` nos dois retornos: login dentro do modal troca de ramo sem remontá-lo.
  const clubEventOpen = clubEvent !== null || claimWaiting !== null;
  const clubEventDialog = clubEvent && (
    <Suspense key="club-event" fallback={null}>
      <ClubEventDialog
        initialClub={clubEvent.club}
        startPicking={clubEvent.pick}
        claim={clubEvent.claim}
        onChosen={onClubChosen}
        onViewMine={() => {
          onClubEventClose();
          setMenuTab("customizations");
          changeMenuOpen(true);
        }}
        onClose={onClubEventClose}
        loginPanel={
          <AuthPanel
            referralCode={referralCode}
            referralPreview={referralPreview}
            referralLoading={referralLoading}
            referralError={referralError}
            onReferralCodeChange={changeReferralCode}
            onReferralRemove={clearPendingReferral}
            onReferralApplied={clearPendingReferral}
            onDone={() => {}}
          />
        }
      />
    </Suspense>
  );

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
        {clubEventDialog}
        <div className="flex items-center gap-2 sm:gap-3">
          {showMyBuildingsButton && (
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
          )}
          {showMenuButton && summary && (
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
          {showMenuButton && (
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
          )}
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
          open={referralCode !== "" && !authOpen && !clubEventOpen}
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
        {(rewards.pending.length > 0 || rewards.choice) && user.onboarding_completed_at !== null && !authOpen && referralCode === "" && !menuOpen && !shareOpen && !onboardingBlocked && !clubEventOpen && (
          <Suspense fallback={null}>
            <RewardDialog key={user.id} rewards={rewards} />
          </Suspense>
        )}
        {/* Não empilha modal: espera indicação pendente, menu e compartilhar fecharem. */}
        <OnboardingDialog blocked={referralCode !== "" || menuOpen || shareOpen || onboardingBlocked || clubEventOpen} />
      </>
    );
  }

  return (
    <>
      {clubEventDialog}
      <div hidden={!showMenuButton} className="flex items-center gap-2 sm:gap-3">
        {/* Deslogado não tem menu — o mesmo toggle fica ao lado do "Entrar". Mobile esconde dia/noite e vídeo: o espaço em cima empurra o ReferralHud pra baixo. */}
        {!isMobile && <NightToggle night={night} onNightChange={onNightChange} />}
        {!isMobile && (
        <Button type="button" variant="outline" onClick={() => setIntroOpen(true)} aria-haspopup="dialog" title="Conheça o Cidoe">
          <Play /><span className="max-sm:sr-only">Conheça o Cidoe</span>
        </Button>
        )}
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
        open={isMobile && authOpen && !showIntro}
        onOpenChange={onAuthOpenChange}
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
