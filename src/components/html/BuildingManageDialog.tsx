import { lazy, Suspense, useId, useState } from "react";
import { AlertDialog, Tabs } from "radix-ui";
import type { BuildingProfile } from "@/api/contributionApi";
import type { CustomizationCatalog } from "@/api/customizationApi";
import type { BuildingCustomization, TextureSettings } from "@/scene/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BlockLoader, ErrorMark, PixelClose } from "@/components/ui/pixel-icon";
import { BuildingProfileForm } from "./donate/BuildingProfileForm";
import { cn } from "@/lib/utils";
import { SimulationNotice } from "./donate/SimulationNotice";

const BuildingCustomizer = lazy(() => import("@/components/customization/BuildingCustomizer").then((module) => ({ default: module.BuildingCustomizer })));
const scrollClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 outline-none sm:px-5 sm:py-4";
const footerClass = "shrink-0 space-y-1 border-t bg-background px-3 py-1 sm:px-5 sm:py-2";
// Abas (DS): texto bold 13px; ativa = régua verde de 4px embaixo + ▸.
const tabClass = "tab menu-cursor text-[13px] min-h-11 pr-4 pl-6 hover:bg-accent disabled:opacity-50 sm:min-h-10";

export function BuildingManageDialog({
  donationId,
  initialTab = "information",
  catalog,
  customization,
  textureSettings,
  onCustomizationChange,
  onSaved,
  onClose,
}: {
  donationId: number;
  initialTab?: "information" | "appearance";
  catalog: CustomizationCatalog | null;
  customization: BuildingCustomization;
  textureSettings: TextureSettings;
  onCustomizationChange: (donationId: number, patch: Partial<BuildingCustomization>) => void;
  onSaved: (donationId: number, profile: BuildingProfile) => void;
  onClose: () => void;
}) {
  const profileFormId = useId();
  const [buildingTab, setBuildingTab] = useState<string>(initialTab);
  const [profileEdit, setProfileEdit] = useState({ dirty: false, busy: false, ready: false, error: null as string | null });
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const editBusy = profileEdit.busy || appearanceBusy;

  function leaveProfile() {
    if (editBusy) return;
    if (profileEdit.dirty) setConfirmExit(true);
    else onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && leaveProfile()}>
      <DialogContent
        className="flex h-[min(50rem,calc(var(--viewport-height,100dvh)-1rem))] max-h-[calc(var(--viewport-height,100dvh)-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 pb-1.5 text-foreground sm:h-[min(50rem,calc(var(--viewport-height,100dvh)-3rem))] sm:max-h-[calc(var(--viewport-height,100dvh)-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-3xl lg:max-w-6xl"
        aria-describedby={undefined}
        showCloseButton={false}
        onEscapeKeyDown={(event) => { if (editBusy) event.preventDefault(); }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <Tabs.Root value={buildingTab} onValueChange={setBuildingTab} className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-4 px-3 pr-14 sm:h-14 sm:px-5 sm:pr-16">
            <DialogHeader className="sr-only md:not-sr-only md:shrink-0">
              <DialogTitle className="text-base">Seu edifício</DialogTitle>
            </DialogHeader>
            <Tabs.List aria-label="Editar edifício" className="flex h-full min-w-0 flex-1 gap-2 shadow-[inset_0_-2px_0_0_var(--color-border)] md:ml-auto md:flex-none">
              <Tabs.Trigger value="appearance" disabled={editBusy} className={tabClass}>Aparência</Tabs.Trigger>
              <Tabs.Trigger value="information" disabled={editBusy} className={tabClass}>Informações</Tabs.Trigger>
            </Tabs.List>
          </div>
          <Tabs.Content value="information" forceMount className={cn(scrollClass, "data-[state=inactive]:hidden")}>
            <BuildingProfileForm
              id={profileFormId}
              donationId={donationId}
              showActions={false}
              disabled={appearanceBusy}
              submitLabel="Salvar"
              onDone={(profile) => {
                onSaved(donationId, profile);
                onClose();
              }}
              onSkip={leaveProfile}
              onEditStateChange={setProfileEdit}
            />
          </Tabs.Content>
          <Tabs.Content value="appearance" className="min-h-0 flex-1 overflow-hidden px-3 py-2 outline-none [container-type:size] sm:px-5 sm:py-3">
            <Suspense fallback={<p role="status" className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><BlockLoader />Carregando personalização…</p>}>
              <BuildingCustomizer
                catalog={catalog}
                customization={customization}
                textureSettings={textureSettings}
                onChange={(patch) => onCustomizationChange(donationId, patch)}
                onBusyChange={setAppearanceBusy}
              />
            </Suspense>
          </Tabs.Content>
          <div className={footerClass}>
            {profileEdit.error && (profileEdit.ready || buildingTab === "appearance") && <p role="alert" className="flex gap-1.5 text-sm text-destructive"><ErrorMark /><span>{profileEdit.error}{!profileEdit.ready && " Tente novamente na aba Informações."}</span></p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {buildingTab === "appearance" ? (
                <p className="min-w-0 text-[11px] text-muted-foreground">
                  {appearanceBusy ? "Lendo imagem…" : profileEdit.dirty ? "Informações não salvas" : "Salvamento automático"}
                </p>
              ) : <Button type="button" variant="ghost" className="h-11 sm:h-10" disabled={editBusy} onClick={leaveProfile}>Voltar</Button>}
              {buildingTab === "information" || profileEdit.dirty || profileEdit.busy ? <Button type="submit" form={profileFormId} className="h-11 sm:h-10 sm:min-w-32" disabled={!profileEdit.ready || editBusy}>
                {profileEdit.busy && <BlockLoader />}
                {profileEdit.busy ? "Aguarde…" : "Salvar"}
              </Button> : <Button type="button" className="h-11 sm:h-10 sm:min-w-32" disabled={editBusy} onClick={leaveProfile}>Concluir</Button>}
            </div>
          </div>
        </Tabs.Root>
        <Button type="button" variant="ghost" size="icon" className="absolute top-0.5 right-1 size-11 sm:top-1.5 sm:right-2" disabled={editBusy} onClick={leaveProfile} aria-label="Fechar personalização">
          <PixelClose className="size-3" />
        </Button>
        <SimulationNotice />
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
