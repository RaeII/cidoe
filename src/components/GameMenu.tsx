import type { RewardNotifications } from "@/components/hooks/useCustomizationCatalog";
import { Building2, Lock, LogOut, MapPin, Palette, UserRound, Users } from "lucide-react";
import { Dialog as DialogPrimitive, Tabs } from "radix-ui";
import type { CatalogFeature, CatalogOption, CustomizationCatalog } from "@/api/customizationApi";
import type { ReferralSummary } from "@/api/referral/referral.types";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatUnlockRequirement } from "@/lib/unlock";
import { CustomizationImage } from "@/components/customization/CustomizationImage";
import { ProfilePanel } from "@/components/ProfilePanel";
import { ReferralBar } from "@/components/referral/ReferralHud";
import { ReferralPerson } from "@/components/referral/ReferralPerson";
import { SharePanel } from "@/components/referral/ShareDialog";
import { NightToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BlockBar } from "@/components/ui/block-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { BlockLoader, ErrorMark, PixelBuilding, PixelCheck, PixelCoin } from "@/components/ui/pixel-icon";

/** Edifício próprio já resolvido para exibição. */
export type MyDonation = {
  id: number;
  value: number;
  ongName?: string;
  place?: string;
};

type GameMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: string;
  onTabChange: (tab: string) => void;
  night: boolean;
  onNightChange: (night: boolean) => void;
  donations: readonly MyDonation[];
  catalog: CustomizationCatalog | null;
  /** Foca o edifício na cena e abre o card de info (mesmo caminho do clique). */
  onOpenDonation: (donationId: number) => void;
  referralSummary: ReferralSummary | null;
  referralError: string | null;
  rewards: RewardNotifications;
};

// Estrutura do menu de pausa do GTA V em placas de papel do DS (borda em pixel + bisel sólido).
// Aba (DS): texto bold 13px; ativa = régua verde de 4px embaixo + cursor ▸.
const tabClass =
  "group tab menu-cursor text-[13px] flex h-11 flex-1 items-center justify-center gap-2 pr-1 pl-5 whitespace-nowrap sm:flex-none sm:justify-start sm:pr-2 sm:pl-6 [&_svg]:size-4 [&_svg]:shrink-0";
// Inativa no celular mostra só o ícone; o nome volta no sm+.
const tabLabel = "hidden group-data-[state=active]:inline sm:inline";
const panelClass = "min-h-0 flex-1 overflow-y-auto px-4 py-5 outline-none sm:px-8 sm:py-7";

type UnlockItem = {
  key: string;
  label: string;
  categoryKey: string;
  optionKey?: string;
  value?: string | null;
  unlock: CatalogOption["unlock"];
  isUnlocked?: boolean;
};

/** Catálogo → grupos da aba. "default"/"none" não são recompensa (mesmo corte do passe no admin). */
function catalogGroups(catalog: CustomizationCatalog): { title: string; items: UnlockItem[] }[] {
  const options = (categoryKey: string, list: CatalogOption[]) =>
    list
      .filter((option) => option.key !== "default" && option.key !== "none")
      .map((option) => ({ ...option, key: `${categoryKey}:${option.id}`, categoryKey, optionKey: option.key }));
  const feature = (categoryKey: string, label: string, item: CatalogFeature | null) =>
    item ? [{ ...item, key: categoryKey, label, categoryKey }] : [];
  return [
    { title: "Formatos", items: options("shape", catalog.shapes) },
    { title: "Topos", items: options("rooftop", catalog.rooftops) },
    { title: "LED de arestas", items: options("edge_light", catalog.edgeLights) },
    { title: "Cores", items: options("color", catalog.colors) },
    { title: "Texturas", items: options("texture", catalog.textures) },
    {
      title: "Recursos",
      items: [
        ...feature("sign", "Letreiro", catalog.features.sign),
        ...feature("hologram", "Holograma", catalog.features.hologram),
      ],
    },
  ].filter((group) => group.items.length > 0);
}

/** Menu do usuário logado, inspirado no menu de pausa do GTA V. */
export function GameMenu({
  open,
  onOpenChange,
  tab,
  onTabChange,
  night,
  onNightChange,
  donations,
  catalog,
  onOpenDonation,
  referralSummary,
  referralError,
  rewards,
}: GameMenuProps) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const displayName = user.name?.trim() || user.username;
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const totalDonated = donations.reduce((sum, donation) => sum + donation.value, 0);
  const groups = catalog ? catalogGroups(catalog) : [];
  const unlockedCount = groups.reduce((n, g) => n + g.items.filter((item) => item.isUnlocked).length, 0);
  const itemCount = groups.reduce((n, g) => n + g.items.length, 0);
  const referralGoal = rewards.choice?.referralMin ?? rewards.nextChoice?.referralMin;
  const referralsLeft = referralGoal == null ? null : Math.max(0, referralGoal - rewards.signupReferrals);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Tinta que entra em fade: a cena "muda de cor" ao abrir, como a pausa do GTA. */}
        <DialogOverlay className="duration-500" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[calc(var(--viewport-top,0px)+var(--viewport-height,100svh)/2)] left-1/2 z-50 flex h-[min(42rem,calc(var(--viewport-height,100svh)-2rem))] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 text-foreground outline-none transition-none duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <header className="flex items-center justify-end gap-4">
            <DialogTitle className="sr-only">Menu</DialogTitle>
            <NightToggle night={night} onNightChange={onNightChange} />
            <div className="pixel bevel-edge flex min-w-0 items-center gap-3 bg-background p-1.5 pb-2.5 sm:pl-4">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">@{user.username}</p>
              </div>
              <Avatar>
                {user.profile_image && <AvatarImage src={user.profile_image} alt="" />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </div>
          </header>

          <Tabs.Root value={tab} onValueChange={onTabChange} className="pixel bevel-edge flex min-h-0 flex-1 flex-col bg-background pb-1">
            <Tabs.List aria-label="Seções do menu" className="flex border-b-2 border-border px-1 sm:gap-2 sm:px-6">
              <Tabs.Trigger value="donations" className={tabClass} title="Meus edifícios">
                <Building2 /><span className={tabLabel}>Meus edifícios</span>
              </Tabs.Trigger>
              <Tabs.Trigger value="customizations" className={tabClass} title="Personalizações">
                <Palette /><span className={tabLabel}>Personalizações</span>
              </Tabs.Trigger>
              {!user.is_admin && (
                <Tabs.Trigger value="referral" className={tabClass} title="Indicações">
                  <Users /><span className={tabLabel}>Indicações</span>
                </Tabs.Trigger>
              )}
              <Tabs.Trigger value="profile" className={tabClass} title="Perfil">
                <UserRound /><span className={tabLabel}>Perfil</span>
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="donations" className={panelClass}>
              <div className="mx-auto max-w-2xl">
                <p className="mb-5 text-muted-foreground">
                  <span className="block text-3xl font-semibold tracking-[-0.02em] text-foreground">{formatBRL(totalDonated)}</span>
                  simulados em {donations.length} {donations.length === 1 ? "edifício" : "edifícios"}
                </p>
                {donations.length === 0 ? (
                  <p className="bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum edifício ainda.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {donations.map((donation, index) => (
                      <li key={donation.id} className="pixel pixel-thin flex items-center gap-3 bg-card p-3 pr-4">
                        <span className="grid size-11 shrink-0 place-items-center bg-primary text-primary-foreground">
                          <PixelBuilding className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="mono-label text-primary">Edifício {index + 1}</p>
                          <p className="font-semibold">{formatBRL(donation.value)}</p>
                          <p className="line-clamp-2 text-sm text-muted-foreground sm:truncate">
                            {[donation.ongName, donation.place].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onOpenChange(false);
                            onOpenDonation(donation.id);
                          }}
                        >
                          <MapPin />
                          <span className="hidden sm:inline">Ver na cidade</span>
                          <span className="sr-only sm:hidden">Ver na cidade</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content value="customizations" className={panelClass}>
              {!catalog ? (
                <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <BlockLoader />Carregando…
                </p>
              ) : (
                <div className="space-y-7">
                  <div className="flex items-center gap-4">
                    <p className="mono-label shrink-0 text-muted-foreground">
                      <strong className="text-sm text-foreground">{unlockedCount}</strong> de {itemCount} liberadas
                    </p>
                    <BlockBar value={unlockedCount} max={itemCount} label="Personalizações liberadas" className="flex-1" />
                  </div>
                  {groups.map((group) => (
                    <section key={group.title}>
                      <h3 className="mb-3 text-sm font-semibold">{group.title}</h3>
                      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {group.items.map((item) => (
                          <li key={item.key} className="pixel pixel-thin overflow-hidden bg-card">
                            <div className={`h-24 p-3 ${item.isUnlocked ? "" : "opacity-40 grayscale"}`}>
                              <CustomizationImage categoryKey={item.categoryKey} optionKey={item.optionKey} value={item.value} />
                            </div>
                            <div className="px-3 pt-1 pb-3">
                              <p className="truncate text-sm font-medium" title={item.label}>{item.label}</p>
                              {item.isUnlocked ? (
                                <Badge className="mt-1.5">
                                  <PixelCheck />Liberado
                                </Badge>
                              ) : (
                                <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                                  <Lock className="mt-px size-3 shrink-0" />{formatUnlockRequirement(item.unlock)}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </Tabs.Content>

            {!user.is_admin && (
              <Tabs.Content value="referral" className={`${panelClass} flex flex-col`}>
                <div className="m-auto w-full max-w-md space-y-4 text-center">
                  {referralSummary && (
                    <>
                      {referralSummary.referral_count > 0 && (
                        <p className="text-muted-foreground">
                          <span className="block text-3xl font-semibold tracking-[-0.02em] text-foreground">
                            {referralSummary.referral_count.toLocaleString("pt-BR")}
                          </span>
                          {referralSummary.referral_count === 1 ? "pessoa indicada" : "pessoas indicadas"}
                        </p>
                      )}
                      {referralGoal != null && referralsLeft != null && referralsLeft > 0 && (
                        <div className="pixel pixel-thin bg-card px-5 py-4 text-left">
                          <p className="text-sm text-muted-foreground">
                            <strong className="flex items-center gap-2 text-2xl font-semibold text-foreground">
                              <PixelCoin className="size-5" />
                              {referralsLeft === 1 ? "Falta" : "Faltam"} apenas {referralsLeft}
                            </strong>{" "}
                            {referralsLeft === 1 ? "indicação" : "indicações"} para escolher sua recompensa. Basta a pessoa se cadastrar
                          </p>
                          <div className="mt-3" aria-hidden="true">
                            <ReferralBar goal={referralGoal} left={referralsLeft} />
                          </div>
                        </div>
                      )}
                      <div className="py-2">
                        <p className="mono-label text-muted-foreground">Seu código de indicação</p>
                        <p className="mt-2 mb-4 font-mono text-lg font-semibold tracking-widest break-all sm:text-2xl">
                          {referralSummary.code}
                        </p>
                        <SharePanel url={referralSummary.link} />
                      </div>
                      {rewards.choice && <Button variant="reward" onClick={() => onOpenChange(false)}>Escolher minha recompensa</Button>}
                    </>
                  )}
                  {referralSummary?.referrer && (
                    <ReferralPerson
                      label="Você foi indicado por"
                      person={referralSummary.referrer}
                      className="text-left"
                    />
                  )}
                  {referralError && (
                    <p role="alert" className="flex items-start justify-center gap-2.5 text-sm text-destructive">
                      <ErrorMark />
                      {referralError}
                    </p>
                  )}
                  {!referralSummary && !referralError && (
                    <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <BlockLoader />Carregando…
                    </p>
                  )}
                </div>
              </Tabs.Content>
            )}

            <Tabs.Content value="profile" className={`${panelClass} flex flex-col`}>
              <ProfilePanel />
            </Tabs.Content>
          </Tabs.Root>

          <footer className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                void logout();
              }}
            >
              <LogOut />
              Sair
            </Button>
            <DialogClose asChild>
              <Button variant="outline">
                <kbd className="pixel pixel-thin bg-card px-1.5 font-mono text-xs">Esc</kbd>
                Voltar
              </Button>
            </DialogClose>
          </footer>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
