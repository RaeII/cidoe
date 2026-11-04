import { useEffect, useState, type FormEvent } from "react";
import { Gift } from "lucide-react";
import { Link } from "react-router-dom";
import { getCustomizationTree, getEarlySignupSettings, saveEarlySignupSettings } from "@/api/admin/admin.routes";
import type { CustomizationCategory, EarlySignupInput, EarlySignupSettings } from "@/api/admin/admin.types";
import { ApiError } from "@/api/http";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { RewardExamples } from "@/components/admin/RewardExamples";
import { CustomizationImage } from "@/components/customization/CustomizationImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark, PixelCheck } from "@/components/ui/pixel-icon";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";

type RewardItem = {
  id: number;
  label: string;
  optionKey?: string;
  value: string | null;
  active: boolean;
  field: "optionIds" | "categoryIds";
  free: boolean;
};

export default function EarlySignups() {
  const [categories, setCategories] = useState<CustomizationCategory[]>([]);
  const [saved, setSaved] = useState<EarlySignupSettings | null>(null);
  const [form, setForm] = useState<EarlySignupInput | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tierIndex, setTierIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([getCustomizationTree(), getEarlySignupSettings()]).then(([tree, settings]) => {
      if (!alive) return;
      setCategories(tree.categories);
      setSaved(settings);
      setForm({ isActive: settings.isActive, userLimit: settings.userLimit, tiers: settings.tiers });
      setError(null);
    }).catch((err: unknown) => {
      if (alive) setError(err instanceof ApiError ? err.message : "Não foi possível carregar os benefícios.");
    });
    return () => { alive = false; };
  }, [reload]);

  const byId = new Map(categories.map((category) => [category.id, category]));
  function isActive(category: CustomizationCategory): boolean {
    const parent = category.parentId === null ? undefined : byId.get(category.parentId);
    return category.isActive && (!parent || isActive(parent));
  }
  const groups: (CustomizationCategory & { items: RewardItem[] })[] = categories.filter((category) => category.kind !== "group").map((category) => ({
    ...category,
    items: category.kind === "feature"
      ? [{ id: category.id, label: category.label, optionKey: undefined, value: null, active: isActive(category), field: "categoryIds" as const, free: !category.unlock }]
      : category.options.filter((option) => option.key !== "default" && option.key !== "none").map((option) => ({
        id: option.id, label: option.label, optionKey: option.key, value: option.value,
        active: isActive(category) && option.isActive, field: "optionIds" as const, free: !option.unlock,
      })),
  }));
  const tier = form?.tiers[tierIndex];
  const goals = [...new Set(form?.tiers.map((entry) => entry.referralMin).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
  const items = groups.flatMap((group) => group.items);
  const selected = items.filter((item) => tier?.[item.field].includes(item.id));
  const invalidLimit = !form || (form.userLimit !== null && (!Number.isInteger(form.userLimit) || form.userLimit < 1 || form.userLimit > 1_000_000));
  const invalidTiers = !form || form.tiers.some((entry) => !Number.isInteger(entry.referralMin) || entry.referralMin < 1 || entry.referralMin > 1_000_000
    || entry.optionIds.length + entry.categoryIds.length === 0)
    || new Set(form.tiers.map((entry) => entry.referralMin)).size !== form.tiers.length;
  const invalidActive = form?.isActive && (!form.tiers.length || form.tiers.some((entry) =>
    items.some((item) => entry[item.field].includes(item.id) && (!item.active || item.free))));
  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify({ isActive: saved.isActive, userLimit: saved.userLimit, tiers: saved.tiers });

  function toggle(field: "optionIds" | "categoryIds", id: number) {
    setFeedback(null);
    setForm((current) => current && ({ ...current, tiers: current.tiers.map((entry, index) => index !== tierIndex ? entry : {
      ...entry, [field]: entry[field].includes(id) ? entry[field].filter((value) => value !== id) : [...entry[field], id],
    }) }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || invalidLimit || invalidTiers || invalidActive || saving) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await saveEarlySignupSettings(form);
      setSaved(result);
      setForm({ isActive: result.isActive, userLimit: result.userLimit, tiers: result.tiers });
      setFeedback(result.isActive ? "Etapas salvas. Usuários elegíveis podem escolher suas recompensas." : "Configuração salva. Distribuição pausada; benefícios anteriores preservados.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
    } finally { setSaving(false); }
  }

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Gift className="size-5" /><span className="text-lg font-semibold">Primeiros inscritos</span>
        </header>
        <main className="flex-1 overflow-y-auto px-4 pt-6 pb-24 sm:px-8 md:pb-10">
          <div className="mx-auto max-w-6xl space-y-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Recompensas por indicação</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">A cada meta de cadastros indicados, o usuário escolhe um item. Os indicados não precisam contribuir.</p>
            </div>
            <RewardExamples goals={goals.length ? goals : undefined} />
            {error && <div role="alert" className="flex flex-wrap items-center gap-2 pixel pixel-thin pixel-ink-ambar-700 bg-card p-4 text-sm text-destructive">
              <ErrorMark />{error}{!form && <Button variant="outline" className="ml-3" onClick={() => setReload((value) => value + 1)}>Tentar novamente</Button>}
            </div>}
            {feedback && <p role="status" className="pixel pixel-thin bg-card p-4 text-sm">{feedback}</p>}
            {!form || !saved ? (!error && <p role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><BlockLoader />Carregando benefícios…</p>) : (
              <form onSubmit={(event) => void save(event)} className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Distribuição", saved.isActive ? "Ativa" : "Pausada"],
                    ["Usuários já beneficiados", saved.rewardedCount.toLocaleString("pt-BR")],
                    ["Posições para novos cadastros", saved.userLimit === null ? "Sem limite" : Math.max(0, saved.userLimit - saved.registeredCount).toLocaleString("pt-BR")],
                  ].map(([label, value]) => <div key={label} className="pixel bevel-edge bg-card p-5 pb-6">
                    <p className="mono-label text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.02em]">{value}</p>
                  </div>)}
                </div>
                <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
                  <div className="flex flex-wrap items-start justify-between gap-6 pixel bevel-edge bg-card p-5 pb-6">
                    <div className="max-w-lg space-y-2">
                      <label className="flex items-center gap-3 text-sm font-medium">Limitar aos primeiros inscritos<Switch checked={form.userLimit !== null} onCheckedChange={(limited) => setForm({ ...form, userLimit: limited ? 100 : null })} /></label>
                      {form.userLimit !== null && <label htmlFor="signup-limit" className="block mono-label">Limite de inscritos</label>}
                      {form.userLimit !== null && <Input id="signup-limit" type="number" min={1} max={1_000_000} step={1} required className="w-40" value={Number.isNaN(form.userLimit) ? "" : form.userLimit}
                        onChange={(event) => setForm({ ...form, userLimit: event.target.valueAsNumber })} />}
                      {form.userLimit !== null && <p className="text-xs leading-5 text-muted-foreground">Conta desde o início da plataforma, incluindo cadastros anteriores. Administradores não entram; contas desativadas não cedem sua posição.</p>}
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                      Distribuir benefícios
                      <Switch checked={form.isActive} disabled={saving} onCheckedChange={(isActive) => setForm({ ...form, isActive })} aria-label="Distribuir benefícios" />
                    </label>
                  </div>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold">Etapas de escolha</h2>
                      <Button type="button" variant="outline" disabled={form.tiers.length >= 10} onClick={() => {
                        setTierIndex(form.tiers.length);
                        setForm({ ...form, tiers: [...form.tiers, { referralMin: Math.max(0, ...form.tiers.map((entry) => entry.referralMin)) + 2, optionIds: [], categoryIds: [] }] });
                      }}>Adicionar etapa</Button>
                    </div>
                    <div className="flex flex-wrap gap-2" aria-label="Etapas">
                      {form.tiers.map((entry, index) => <Button type="button" key={index} variant={index === tierIndex ? "default" : "outline"} aria-pressed={index === tierIndex} onClick={() => setTierIndex(index)}>Etapa {index + 1} · {entry.referralMin || "—"} no total</Button>)}
                    </div>
                    {tier && <div className="flex flex-wrap items-end gap-3 pixel pixel-thin bg-card p-4">
                      <label className="space-y-2 text-sm font-medium">Total de indicações<Input type="number" min={1} max={1_000_000} step={1} required className="w-40" value={Number.isNaN(tier.referralMin) ? "" : tier.referralMin} onChange={(event) => setForm({ ...form, tiers: form.tiers.map((entry, index) => index === tierIndex ? { ...entry, referralMin: event.target.valueAsNumber } : entry) })} /></label>
                      <Button type="button" variant="outline" onClick={() => { setForm({ ...form, tiers: form.tiers.filter((_, index) => index !== tierIndex) }); setTierIndex(0); }}>Remover etapa</Button>
                    </div>}
                    <p className="text-sm text-muted-foreground">Meta conta o total de indicações do usuário, não só as novas.{goals.length > 1 && ` Ex.: quem escolheu na meta ${goals[0]} alcança a de ${goals[1]} com mais ${goals[1] - goals[0]}.`}</p>
                    <Button asChild variant="outline" size="sm"><Link to="/dale/personalizacoes">Gerenciar catálogo</Link></Button>
                  </div>
                  {tier && groups.map((group) => group.items.length > 0 && (
                    <section key={group.id} aria-label={group.label} className="space-y-3">
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {group.items.map((item) => {
                          const checked = tier[item.field].includes(item.id);
                          // DS: opção em card — selecionada = bg-secondary + moldura verde. Foco pelo contorno âmbar no card.
                          return <label key={item.id} className={`relative cursor-pointer overflow-hidden pixel pixel-thin transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-4 has-focus-visible:outline-ring ${checked ? "bg-secondary pixel-ink-verde" : "bg-card hover:bg-accent"}`}>
                            <input type="checkbox" className="peer sr-only" checked={checked} disabled={!checked && (!item.active || item.free)} onChange={() => toggle(item.field, item.id)} />
                            <span className={`absolute top-2 right-2 z-10 flex size-[18px] items-center justify-center pixel pixel-thin ${checked ? "bg-primary text-primary-foreground" : "bg-card"}`} aria-hidden>{checked && <PixelCheck className="w-3" />}</span>
                            <div className="h-28 bg-background p-3"><CustomizationImage categoryKey={group.key} optionKey={item.optionKey} value={item.value} /></div>
                            <div className="space-y-1 p-3"><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{!item.active ? "Inativo no catálogo" : item.free ? "Já é grátis para todos" : "Liberação antecipada"}</p></div>
                          </label>;
                        })}
                      </div>
                    </section>
                  ))}
                  {!groups.some((group) => group.items.length) && <p className="text-sm text-muted-foreground">Nenhum item disponível. Configure o catálogo de personalizações primeiro.</p>}
                </fieldset>
                <div className="sticky bottom-1 z-20 space-y-3 pixel bevel-edge bg-card p-4 pb-5">
                  <p className="text-sm"><strong>Opções da etapa:</strong> {selected.map((item) => item.label).join(" · ") || "Nenhum item selecionado"}</p>
                  <p className="text-xs leading-5 text-muted-foreground">Metas identificam as etapas: remover e recriar a mesma meta não renova escolhas. Conquistas anteriores permanecem. Itens não escolhidos seguem as regras do passe.</p>
                  {invalidActive && <p className="flex gap-2 text-sm text-destructive"><ErrorMark />Para ativar, configure etapas com itens ativos e bloqueados no passe.</p>}
                  {invalidTiers && <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />Use metas inteiras diferentes e selecione ao menos um item por etapa.</p>}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{dirty ? "Alterações ainda não salvas" : "Configuração salva"}</span>
                    <Button type="submit" disabled={saving || invalidLimit || invalidTiers || !!invalidActive || !dirty}>
                      {saving ? <BlockLoader /> : <Gift className="size-4" />}{saving ? "Salvando…" : "Salvar benefícios"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </main>
        <MobileNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
