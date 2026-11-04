import { useEffect, useState } from "react";
import { GalleryHorizontal, Gift, LayoutGrid, Trophy } from "lucide-react";
import { getCustomizationTree } from "@/api/admin/admin.routes";
import type { CustomizationCategory } from "@/api/admin/admin.types";
import { ApiError } from "@/api/http";
import { categoryTarget, optionTarget, type UnlockTarget } from "@/lib/adminUnlock";
import type { PassReward } from "@/lib/pass";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { UnlockDialog } from "@/components/admin/UnlockDialog";
import { RewardExamples } from "@/components/admin/RewardExamples";
import { PassTrack } from "@/components/pass/PassTrack";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorMark } from "@/components/ui/pixel-icon";

type AdminReward = PassReward & { target: UnlockTarget };

function buildRewards(categories: CustomizationCategory[]): AdminReward[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  function isActive(category: CustomizationCategory): boolean {
    const parent = category.parentId === null ? undefined : byId.get(category.parentId);
    return category.isActive && (!parent || isActive(parent));
  }
  return categories.filter(isActive).flatMap((category) => {
    const common = { categoryKey: category.key, categoryLabel: category.label };
    if (category.kind === "feature") return [{
      ...common, key: `category-${category.id}`, label: category.label,
      unlock: category.unlock, target: categoryTarget(category),
    }];
    return category.options
      .filter((option) => option.isActive && option.key !== "default" && option.key !== "none")
      .map((option) => ({
        ...common, key: `option-${option.id}`, label: option.label, optionKey: option.key,
        value: option.value, unlock: option.unlock, target: optionTarget(option, category),
      }));
  });
}

export default function Pass() {
  const [categories, setCategories] = useState<CustomizationCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [target, setTarget] = useState<UnlockTarget | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [userPreview, setUserPreview] = useState(false);
  const [gridView, setGridView] = useState(false);

  useEffect(() => {
    let alive = true;
    getCustomizationTree().then((tree) => {
      if (!alive) return;
      setCategories(tree.categories);
      setLoadError(null);
    }).catch((err) => {
      if (alive) setLoadError(err instanceof ApiError ? err.message : "Falha ao carregar o passe");
    });
    return () => { alive = false; };
  }, [reloadKey]);

  const rewards = buildRewards(categories ?? []);
  const freeCount = rewards.filter((reward) => !reward.unlock).length;

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Trophy className="size-5" />
          <span className="text-lg font-semibold tracking-tight">Passe</span>
        </header>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-7xl space-y-8 px-4 pt-6 pb-24 sm:px-8 sm:pt-8 md:pb-10">
            <RewardExamples />
            {feedback && <p role="status" className="pixel pixel-thin bg-card px-4 py-3 text-sm">{feedback}</p>}

            {loadError ? (
              <div role="alert" className="pixel pixel-thin pixel-ink-ambar-700 bg-card p-6">
                <p className="flex gap-2 text-sm text-destructive"><ErrorMark />{loadError}</p>
                <Button variant="outline" className="mt-3" onClick={() => setReloadKey((key) => key + 1)}>Tentar de novo</Button>
              </div>
            ) : categories === null ? (
              <div role="status" aria-label="Carregando passe" className="flex gap-5 overflow-hidden">
                {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-96 w-60 shrink-0" />)}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2"><Gift className="size-4" /><strong className="text-foreground">{freeCount}</strong> grátis</span>
                    <span className="flex items-center gap-2"><Trophy className="size-4" /><strong className="text-foreground">{rewards.length - freeCount}</strong> para conquistar</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" onClick={() => setGridView((current) => !current)} aria-pressed={gridView}>
                      {gridView ? <GalleryHorizontal /> : <LayoutGrid />}
                      {gridView ? "Ver em trilha" : "Ver em grade"}
                    </Button>
                    <label className="flex cursor-pointer items-center gap-3 pixel pixel-thin bg-card px-3 py-2 text-sm">
                      Prévia do usuário
                      <Switch checked={userPreview} onCheckedChange={setUserPreview} aria-label="Prévia do usuário" />
                    </label>
                  </div>
                </div>
                <PassTrack layout={gridView ? "grid" : "track"} rewards={rewards} onConfigure={userPreview ? undefined : (reward) => setTarget(reward.target)} />
                <p className="text-xs leading-5 text-muted-foreground">
                  {userPreview
                    ? "Prévia do passe como o usuário vê. O progresso individual não é exibido nesta visualização."
                    : "Só personalizações ativas entram. Grátis primeiro, depois dificuldade estimada das metas; conquistas anteriores são preservadas."}
                </p>
              </>
            )}
          </main>
        </div>
        <MobileNav />
      </SidebarInset>
      {target && <UnlockDialog key={`${target.kind}-${target.id}`} target={target} onClose={() => setTarget(null)} onDone={(result) => {
        setFeedback(result?.text ?? null);
        setReloadKey((key) => key + 1);
      }} />}
    </SidebarProvider>
  );
}
