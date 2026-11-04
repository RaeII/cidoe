import { lazy, Suspense, useState } from "react";
import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { ArrowLeft, Gift, Rotate3d, Users } from "lucide-react";
import type { RewardNotification } from "@/api/customizationApi";
import type { RewardNotifications } from "@/components/hooks/useCustomizationCatalog";
import { formatRewardReason } from "@/lib/rewardNotifications";
import { formatReferrals, formatUnlockRequirement } from "@/lib/unlock";
import { PREVIEW_KIND } from "@/lib/pass";
import { CustomizationImage } from "@/components/customization/CustomizationImage";
import { Button } from "@/components/ui/button";
import { BlockLoader, PixelCoin } from "@/components/ui/pixel-icon";
import { SignupRewardDialog } from "./SignupRewardDialog";
import { RewardConfetti } from "./RewardConfetti";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const Preview = lazy(() => import("@/components/three/CustomizationPreview")
  .then((module) => ({ default: module.CustomizationPreview })));

function RewardReason({ reward }: { reward: RewardNotification }) {
  if (reward.signupReferralMin != null) return <><Users className="size-4 shrink-0" aria-hidden /><span>{formatReferrals(reward.signupReferralMin)}</span></>;
  if (!reward.unlock) return <><Gift className="size-4 shrink-0" aria-hidden /><span>Primeiros inscritos</span></>;
  return <>
    {reward.unlock.donationMin != null && <PixelCoin className="size-4 shrink-0" aria-hidden />}
    {reward.unlock.referralMin != null && <Users className="size-4 shrink-0" aria-hidden />}
    <span>{formatUnlockRequirement(reward.unlock)}{reward.unlock.referralMin == null ? " em contribuições" : ""}</span>
  </>;
}

/** Montado sob demanda, depois que os outros fluxos liberam a tela. */
export default function RewardDialog({ rewards }: { rewards: RewardNotifications }) {
  const reducedMotion = useReducedMotion();
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [first] = rewards.pending;
  const choice = rewards.choice;
  if (!first && choice) return <SignupRewardDialog key={choice.referralMin} rewards={rewards} choice={choice} />;
  if (!first) return null;
  const preview = rewards.pending.find((reward) => reward.key === previewKey);
  const previewKind = preview && PREVIEW_KIND[preview.categoryKey];
  const multiple = rewards.pending.length > 1;
  const remaining = rewards.nextChoice && rewards.nextChoice.referralMin - rewards.signupReferrals;
  const dismiss = () => rewards.dismiss(rewards.pending.map((reward) => reward.key));

  return (
    <LazyMotion features={domAnimation} strict>
      <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
        <DialogContent className="gap-0 p-0 pb-1 motion-reduce:animate-none sm:max-w-3xl">
          {!reducedMotion && <RewardConfetti key={first.key} />}
          <div aria-hidden className="h-1.5 bg-ambar" />
          <div className="space-y-6 px-5 pt-9 pb-5 sm:px-8 sm:pb-7">
            <div className="text-center">
              <DialogTitle className="px-5 text-[28px] sm:text-[34px]">{preview?.label ?? (multiple ? "Conquistas desbloqueadas" : "Conquista desbloqueada")}</DialogTitle>
              <DialogDescription className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {preview ? "Arraste para girar · Role para aproximar" : <span className="inline-flex flex-wrap items-center justify-center gap-2 font-semibold text-primary">
                  {multiple ? <><Gift className="size-4" aria-hidden />{rewards.pending.length} recompensas</> : <RewardReason reward={first} />}
                </span>}
              </DialogDescription>
            </div>

            {preview && previewKind && preview.optionKey ? <div className="space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setPreviewKey(null)}><ArrowLeft />Ver recompensas</Button>
              <Suspense fallback={<div role="status" className="grid h-72 place-items-center bg-secondary"><BlockLoader /><span className="sr-only">Carregando prévia 3D</span></div>}>
                <Preview key={preview.key} subject={{ kind: previewKind, key: preview.optionKey }} className="h-[min(48dvh,26rem)] min-h-56 w-full cursor-grab overflow-hidden pixel pixel-thin bg-secondary active:cursor-grabbing" />
              </Suspense>
            </div> : <div className={multiple ? "grid grid-cols-2 gap-4 sm:gap-5" : "mx-auto w-full max-w-sm"}>
              {rewards.pending.map((reward, index) => {
                const hasPreview = PREVIEW_KIND[reward.categoryKey] && reward.optionKey && reward.optionKey !== "none";
                return <m.div key={reward.key} className="min-w-0 pixel bevel-edge bg-card p-3 pb-4 sm:p-4 sm:pb-5"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={reducedMotion ? { duration: 0.15 } : { type: "spring", stiffness: 240, damping: 20, delay: Math.min(index, 5) * 0.08 }}>
                  <div className={multiple ? "mb-4 h-44 sm:h-56" : "mb-4 h-56 sm:h-72"}>
                    <CustomizationImage categoryKey={reward.categoryKey} optionKey={reward.optionKey ?? undefined} value={reward.value} />
                  </div>
                  <h3 className="text-center text-xl leading-tight font-semibold break-words sm:text-2xl">{reward.label}</h3>
                  {multiple && <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-primary" aria-label={formatRewardReason(reward.unlock, reward.signupReferralMin)}><RewardReason reward={reward} /></p>}
                  {hasPreview && <Button type="button" variant="ghost" size="sm" className="mx-auto mt-3 flex" aria-label={`Ver ${reward.label} em 3D`} onClick={() => setPreviewKey(reward.key)}><Rotate3d />Ver em 3D</Button>}
                </m.div>;
              })}
            </div>}

            <div className="space-y-3">
              <Button className="w-full" size="lg" variant="reward" onClick={dismiss}>Continuar</Button>
              {remaining != null && remaining > 0 && <p className="py-1 text-center text-sm text-muted-foreground">{remaining === 1 ? "Falta apenas" : "Faltam apenas"} <strong className="font-semibold text-primary">{formatReferrals(remaining)}</strong> para a próxima recompensa.</p>}
              {rewards.next && <section aria-label="Próxima conquista" className="space-y-1 text-center text-sm text-muted-foreground">
                <p>Próxima conquista: <strong className="font-semibold text-primary">{rewards.next.reward.label}</strong></p>
                <p>{rewards.next.remaining}</p>
              </section>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </LazyMotion>
  );
}
