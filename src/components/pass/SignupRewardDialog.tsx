import { lazy, Suspense, useState } from "react";
import { ArrowLeft, Rotate3d, Users } from "lucide-react";
import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { ApiError } from "@/api/http";
import type { RewardNotifications } from "@/components/hooks/useCustomizationCatalog";
import { PREVIEW_KIND } from "@/lib/pass";
import { CustomizationImage } from "@/components/customization/CustomizationImage";
import { Button } from "@/components/ui/button";
import { BlockLoader, ErrorMark, PixelCheck } from "@/components/ui/pixel-icon";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RewardConfetti } from "./RewardConfetti";

const Preview = lazy(() => import("@/components/three/CustomizationPreview")
  .then((module) => ({ default: module.CustomizationPreview })));

export function SignupRewardDialog({ rewards, choice }: {
  rewards: RewardNotifications;
  choice: NonNullable<RewardNotifications["choice"]>;
}) {
  const reducedMotion = useReducedMotion();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = choice.rewards.find((reward) => reward.key === previewKey);
  const previewKind = preview && PREVIEW_KIND[preview.categoryKey];
  const activeKey = preview?.key ?? selectedKey;
  const remaining = rewards.nextChoice && rewards.nextChoice.referralMin - rewards.signupReferrals;

  async function confirm() {
    if (!activeKey || saving) return;
    setSaving(true);
    setError(null);
    try { await rewards.choose(choice.referralMin, activeKey); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível confirmar. Tente novamente."); }
    finally { setSaving(false); }
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <Dialog open onOpenChange={(open) => { if (!open && !saving) rewards.deferChoice(); }}>
        <DialogContent className="gap-0 p-0 pb-1 motion-reduce:animate-none sm:max-w-3xl" onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
          {!reducedMotion && <RewardConfetti />}
          <div aria-hidden className="h-1.5 bg-ambar" />
          <div className="space-y-6 px-5 pt-9 pb-5 sm:px-8 sm:pb-7">
            <div className="relative text-center">
              <DialogTitle className="px-5 text-[28px] sm:text-[34px]">{preview?.label ?? "Escolha sua recompensa"}</DialogTitle>
              <DialogDescription className="mt-3 flex items-center justify-center gap-2">{preview ? "Arraste para girar · Role para aproximar" : <><Users className="size-4 text-primary" aria-hidden /><span className="font-semibold text-primary">{choice.referralMin} {choice.referralMin === 1 ? "indicação" : "indicações"}</span></>}</DialogDescription>
            </div>

            {preview && previewKind && preview.optionKey ? <div className="space-y-3">
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => setPreviewKey(null)}><ArrowLeft />Ver recompensas</Button>
              <Suspense fallback={<div role="status" className="grid h-72 place-items-center bg-secondary"><BlockLoader /><span className="sr-only">Carregando prévia 3D</span></div>}>
                <Preview key={preview.key} subject={{ kind: previewKind, key: preview.optionKey }} className="h-[min(48dvh,26rem)] min-h-56 w-full cursor-grab overflow-hidden pixel pixel-thin bg-secondary active:cursor-grabbing" />
              </Suspense>
            </div> : <fieldset disabled={saving}>
              <legend className="sr-only">Escolha uma recompensa</legend>
              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                {choice.rewards.map((reward, index) => {
                  const selected = selectedKey === reward.key;
                  const hasPreview = PREVIEW_KIND[reward.categoryKey] && reward.optionKey && reward.optionKey !== "none";
                  return <m.div key={reward.key} className={`relative min-w-0 pixel bevel-edge pb-2 transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-4 has-focus-visible:outline-ring ${selected ? "bg-secondary pixel-ink-ambar-700" : "bg-card hover:pixel-ink-verde"}`}
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={reducedMotion ? { duration: 0.15 } : { type: "spring", stiffness: 240, damping: 20, delay: Math.min(index, 5) * 0.08 }}>
                    <label className="block cursor-pointer p-3 sm:p-4">
                      <input type="radio" name="signup-reward" value={reward.key} checked={selected} onChange={() => { setSelectedKey(reward.key); setError(null); }} className="sr-only" />
                      <span aria-hidden className={`absolute top-3 right-3 z-10 grid size-6 place-items-center pixel pixel-thin ${selected ? "bg-ambar text-tinta pixel-ink-ambar-700" : "bg-card"}`}>{selected && <PixelCheck className="size-3" />}</span>
                      <div className="relative mb-4 h-44 sm:h-56">
                        <CustomizationImage categoryKey={reward.categoryKey} optionKey={reward.optionKey ?? undefined} value={reward.value} />
                      </div>
                      <span className="block text-center text-base leading-tight font-semibold break-words sm:text-xl">{reward.label}</span>
                    </label>
                    {hasPreview && <Button type="button" variant="ghost" size="sm" className="mx-auto flex" aria-label={`Ver ${reward.label} em 3D`} onClick={() => { setPreviewKey(reward.key); setError(null); }}><Rotate3d />Ver em 3D</Button>}
                  </m.div>;
                })}
              </div>
            </fieldset>}

            <div className="space-y-3">
              {error && <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />{error}</p>}
              <Button className="w-full" size="lg" variant="reward" disabled={!activeKey || saving} onClick={() => void confirm()}>{saving ? <><BlockLoader />Desbloqueando…</> : "Desbloquear recompensa"}</Button>
              {remaining != null && remaining > 0 && <p className="py-1 text-center text-sm text-muted-foreground">{remaining === 1 ? "Falta apenas" : "Faltam apenas"} <strong className="font-semibold text-primary">{remaining} {remaining === 1 ? "indicação" : "indicações"}</strong> para a próxima recompensa.</p>}
              <Button className="w-full" variant="ghost" disabled={saving} onClick={rewards.deferChoice}>Escolher depois</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </LazyMotion>
  );
}
