import { lazy, Suspense, useEffect, useId, useState, useSyncExternalStore } from "react";
import { AlertDialog, Tabs } from "radix-ui";
import type { BuildingProfile } from "@/api/contributionApi";
import type { CustomizationCatalog } from "@/api/customizationApi";
import type { BuildingCustomization, TextureSettings } from "@/scene/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BlockLoader, ErrorMark, PixelBuilding, PixelCheck, PixelInfo } from "@/components/ui/pixel-icon";
import { BuildingProfileForm } from "./donate/BuildingProfileForm";
import { useAuth } from "@/hooks/useAuth";
import { useMyClub } from "@/components/hooks/useMyClub";
import { cn } from "@/lib/utils";
import { SimulationNotice } from "./donate/SimulationNotice";

const BuildingCustomizer = lazy(() => import("@/components/customization/BuildingCustomizer").then((module) => ({ default: module.BuildingCustomizer })));
const scrollClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200";
// Modo na barra escura (design PersonalizarPredio): ativo = papel com bisel; inativo = texto claro sobre o grupo.
const modeClass = "focus-inset flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 pb-0.5 text-xs font-bold whitespace-nowrap text-verde-100 pixel [--pixel-w:0px] bevel-w-3 transition-colors data-[state=inactive]:hover:bg-verde-700 data-[state=inactive]:hover:text-papel disabled:opacity-45 data-[state=active]:bg-papel data-[state=active]:text-tinta data-[state=active]:bevel-edge";
// Concluir/Salvar sobre tinta: contorno verde claro para o botão não sumir no fundo escuro.
const finishClass = "h-[34px] min-w-24 gap-1.5 px-3 pb-[3px] text-xs font-extrabold tracking-normal pixel-thin pixel-ink-verde-hover bevel-w-3 has-[>svg]:px-3";
// Coluna única de 416 px em qualquer tela; altura estável, limitada pela área visível (teclado).
const modalClass = "h-[min(50rem,calc(var(--viewport-height,100dvh)-1rem))] max-h-[calc(var(--viewport-height,100dvh)-1rem)] w-[calc(100%-1rem)] max-w-[26rem] sm:h-[min(50rem,calc(var(--viewport-height,100dvh)-3rem))] sm:max-h-[calc(var(--viewport-height,100dvh)-3rem)] sm:max-w-[26rem]";
// Painel logo à direita do centro, sem overlay: edifício desliza para o lado dele e a cena segue girável.
const sideClass = "left-[calc(50%+1rem)] h-[min(42rem,calc(var(--viewport-height,100dvh)-2rem))] w-[26rem] max-w-none translate-x-0";
// Centro do edifício fica a esta distância (px) da borda esquerda do painel.
const BUILDING_GAP = 192;

// Tela larga: painel lateral sobre a cena. Abaixo disso, modal com prévia 3D.
const WIDE = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const isWide = () => window.matchMedia(WIDE).matches;

export function BuildingManageDialog({
  donationId,
  initialTab = "information",
  catalog,
  customization,
  textureSettings,
  onCustomizationChange,
  onSaved,
  onClose,
  onViewShiftChange,
  onChangeClub,
}: {
  donationId: number;
  initialTab?: "information" | "appearance";
  catalog: CustomizationCatalog | null;
  customization: BuildingCustomization;
  textureSettings: TextureSettings;
  onCustomizationChange: (donationId: number, patch: Partial<BuildingCustomization>) => void;
  onSaved: (donationId: number, profile: BuildingProfile) => void;
  onClose: () => void;
  /** Quanto (px) a cena desliza para a esquerda para o edifício ficar ao lado do painel; 0 ao sair. */
  onViewShiftChange?: (px: number) => void;
  /** Abre a lista do evento dos times (aba Telão, enquanto a troca está disponível). */
  onChangeClub: () => void;
}) {
  const profileFormId = useId();
  const side = useSyncExternalStore(subscribeWide, isWide, () => false);
  // State, não ref: o Portal monta o conteúdo depois do 1º commit.
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [buildingTab, setBuildingTab] = useState<string>(initialTab);
  const [profileEdit, setProfileEdit] = useState({ dirty: false, busy: false, ready: false, error: null as string | null });
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const editBusy = profileEdit.busy || appearanceBusy;
  // Busca junto com o chunk do personalizador: aba Telão só existe com time do evento.
  const { user } = useAuth();
  const myClub = useMyClub(user?.id);

  // offsetLeft ignora o zoom da entrada; resize reposiciona o painel.
  useEffect(() => {
    if (!side || !content || !onViewShiftChange) return;
    const update = () => onViewShiftChange(window.innerWidth / 2 - content.offsetLeft + BUILDING_GAP);
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      onViewShiftChange(0);
    };
  }, [side, content, onViewShiftChange]);

  function leaveProfile() {
    if (editBusy) return;
    if (profileEdit.dirty) setConfirmExit(true);
    else onClose();
  }

  return (
    <Dialog open modal={!side} onOpenChange={(open) => !open && leaveProfile()}>
      {/* Sem bisel: a barra escura é a base do painel. */}
      <DialogContent
        ref={setContent}
        className={cn("flex flex-col gap-0 overflow-hidden p-0 bevel-w-0 text-foreground", side ? sideClass : modalClass)}
        aria-describedby={undefined}
        showCloseButton={false}
        onEscapeKeyDown={(event) => { if (editBusy) event.preventDefault(); }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {/* Título só para leitor de tela: modo e categoria na barra já dizem o que se edita. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Edifício</DialogTitle>
        </DialogHeader>
        <Tabs.Root value={buildingTab} onValueChange={setBuildingTab} className="flex min-h-0 flex-1 flex-col">
          <Tabs.Content value="information" forceMount className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <div className={scrollClass}>
              <BuildingProfileForm
                id={profileFormId}
                donationId={donationId}
                showActions={false}
                disabled={appearanceBusy}
                compact
                submitLabel="Salvar"
                onDone={(profile) => {
                  onSaved(donationId, profile);
                  onClose();
                }}
                onEditStateChange={setProfileEdit}
              />
            </div>
            {/* Informações tem uma página só: a janela da barra de categorias, parada. */}
            <div aria-hidden className="shrink-0 bg-tinta pt-1.5">
              <div className="relative h-[50px]">
                <span className="absolute left-1/2 top-1/2 grid h-[34px] -translate-x-1/2 translate-y-[calc(-50%-4px)] place-items-center px-3.5 pb-1 pixel pixel-ink-papel bevel-ambar-700 bg-ambar text-[17px] leading-[1.2] font-extrabold text-tinta">Perfil</span>
              </div>
              <div className="flex justify-center pt-0.5"><span className="h-1 w-[18px] bg-ambar" /></div>
            </div>
          </Tabs.Content>
          <Tabs.Content value="appearance" className="min-h-0 flex-1 overflow-hidden outline-none [container-type:size]">
            <Suspense fallback={<p role="status" className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground"><BlockLoader />Carregando personalização…</p>}>
              <BuildingCustomizer
                catalog={catalog}
                customization={customization}
                textureSettings={textureSettings}
                onChange={(patch) => onCustomizationChange(donationId, patch)}
                onBusyChange={setAppearanceBusy}
                side={side}
                club={myClub.club}
                onChangeClub={myClub.canChange ? onChangeClub : undefined}
              />
            </Suspense>
          </Tabs.Content>
          {/* Concluir = fechar (aparência já salvou). Perfil com alterações pendentes → Salvar, de qualquer modo. */}
          <div className="flex shrink-0 items-stretch gap-2 bg-tinta px-3 py-2.5">
            <Tabs.List aria-label="Menu do edifício" className="flex min-w-0 flex-1 gap-[3px] bg-tinta-claro p-[3px]">
              <Tabs.Trigger value="appearance" disabled={editBusy} className={modeClass}><PixelBuilding className="size-3" />Aparência</Tabs.Trigger>
              <Tabs.Trigger value="information" disabled={editBusy} className={modeClass}><PixelInfo className="h-3 w-2.5" />Informações</Tabs.Trigger>
            </Tabs.List>
            {profileEdit.dirty || profileEdit.busy ? <Button type="submit" form={profileFormId} className={finishClass} disabled={!profileEdit.ready || editBusy}>
              {profileEdit.busy ? <BlockLoader /> : <PixelCheck className="h-2 w-2.5" />}
              {profileEdit.busy ? "Aguarde…" : "Salvar"}
            </Button> : <Button type="button" className={finishClass} disabled={editBusy} onClick={leaveProfile}><PixelCheck className="h-2 w-2.5" />Concluir</Button>}
          </div>
          {profileEdit.error && (profileEdit.ready || buildingTab === "appearance") && <p role="alert" className="flex shrink-0 gap-1.5 px-4 py-2 text-sm text-destructive"><ErrorMark /><span>{profileEdit.error}{!profileEdit.ready && " Tente novamente em Informações."}</span></p>}
        </Tabs.Root>
        {/* Painel lateral: cena visível já mostra o aviso de pré-lançamento. */}
        {!side && <SimulationNotice />}
        <AlertDialog.Root open={confirmExit} onOpenChange={setConfirmExit}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-tinta/72" />
            <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 pixel bevel-edge bevel-w-6 bg-background p-6 pb-8 text-foreground">
              <AlertDialog.Title className="text-lg font-semibold">Sair sem salvar?</AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted-foreground">As alterações no nome, na descrição e na imagem serão descartadas.</AlertDialog.Description>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <AlertDialog.Cancel asChild><Button variant="outline" className="h-11">Continuar editando</Button></AlertDialog.Cancel>
                <AlertDialog.Action asChild><Button variant="destructive" className="h-11" onClick={onClose}>Sair sem salvar</Button></AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </DialogContent>
    </Dialog>
  );
}
