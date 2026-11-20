import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Tabs } from "radix-ui";
import type { CatalogOption, CustomizationCatalog } from "@/api/customizationApi";
import { formatUnlockCta } from "@/lib/unlock";
import { cn } from "@/lib/utils";
import { SCREEN_MAX_IMAGES, type BuildingCustomization, type BuildingShape, type EdgeLightType, type RooftopType, type ScreenSide, type TextureSettings } from "@/scene/types";
import { clubImages, findClub } from "@/lib/clubs";
import { CustomizationImage } from "./CustomizationImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BlockLoader, ErrorMark, PixelCheck } from "@/components/ui/pixel-icon";

const Preview = lazy(() => import("@/components/three/BuildingPreview").then((module) => ({ default: module.BuildingPreview })));
// Abas (DS): texto bold 13px; ativa = régua verde de 4px embaixo + ▸.
const tabClass = "tab menu-cursor text-[13px] min-h-11 shrink-0 pr-3 pl-6 hover:bg-accent sm:min-h-10";
const CATEGORIES = [
  { key: "shape", label: "Formato", field: "shapes" },
  { key: "color", label: "Cor", field: "colors" },
  { key: "texture", label: "Fachada", field: "textures" },
  { key: "rooftop", label: "Topo", field: "rooftops" },
  { key: "edge_light", label: "LED", field: "edgeLights" },
] as const;
const SCREEN_SIDE_OPTIONS: ReadonlyArray<{ value: ScreenSide; label: string }> = [
  { value: "front", label: "Frente" },
  { value: "right", label: "Direita" },
  { value: "back", label: "Fundos" },
  { value: "left", label: "Esquerda" },
];

function OptionCard({ category, option, selected, onSelect }: {
  category: string;
  option: CatalogOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const requirementId = useId();
  const locked = option.isUnlocked === false;
  return (
    <button type="button" disabled={locked} onClick={onSelect} aria-pressed={selected}
      aria-describedby={locked ? requirementId : undefined}
      className={cn("relative flex min-w-0 flex-col overflow-hidden pixel pixel-thin text-left transition-colors disabled:cursor-not-allowed", selected ? "pixel-ink-verde bg-secondary" : "bg-card enabled:hover:bg-accent")}>
      <div className={cn("relative h-20 shrink-0 overflow-hidden bg-background p-2 sm:h-24", locked && "opacity-50")}>
        <CustomizationImage categoryKey={category} optionKey={option.key} value={option.value} />
        {selected && <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center bg-primary text-primary-foreground"><PixelCheck className="size-3" /></span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2 sm:p-2.5">
        <span className="text-xs leading-4 font-semibold break-words sm:text-sm">{option.label}</span>
        {locked && <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <LockKeyhole aria-hidden className="size-3 shrink-0" />Bloqueado
        </span>}
        {locked && <span id={requirementId} className="text-xs leading-5 text-muted-foreground">{formatUnlockCta(option.unlock)}</span>}
      </div>
    </button>
  );
}

/** Editor de aparência reutilizável: catálogo e persistência pertencem ao chamador. */
export function BuildingCustomizer({ catalog, customization, textureSettings, onChange, onBusyChange, club = null, onChangeClub }: {
  catalog: CustomizationCatalog | null;
  customization: BuildingCustomization;
  textureSettings: TextureSettings;
  onChange: (patch: Partial<BuildingCustomization>) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Time do evento do DONO (slug): aba Telão só existe com ele, e só com as 3 imagens dele. */
  club?: string | null;
  /** Presente enquanto a troca única de time está disponível (só o dono). */
  onChangeClub?: () => void;
}) {
  const [category, setCategory] = useState("shape");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);
  useEffect(() => { onBusyChange?.(imageBusy); }, [imageBusy, onBusyChange]);
  useEffect(() => () => { readerRef.current?.abort(); onBusyChange?.(false); }, [onBusyChange]);
  const categories = CATEGORIES.filter((item) => (catalog?.[item.field].length ?? 0) > 0);
  const team = findClub(club);
  const screenImages = team ? clubImages(team) : [];
  const screenIds = useId();
  const activeCategory = categories.some((item) => item.key === category) || catalog?.features[category as "sign" | "hologram"] || (category === "screen" && team) ? category : categories[0]?.key ?? (catalog?.features.sign ? "sign" : catalog?.features.hologram ? "hologram" : "screen");
  const tabs = [...categories, ...(catalog?.features.sign ? [{ key: "sign", label: "Letreiro" }] : []), ...(catalog?.features.hologram ? [{ key: "hologram", label: "Holograma" }] : []), ...(team ? [{ key: "screen", label: "Telão" }] : [])];
  const tabIndex = (key: string) => tabs.findIndex((item) => item.key === key);
  // Celular: painéis lado a lado com scroll-snap; deslizar troca a aba. Só a atual e vizinhas montam itens.
  const near = (key: string) => Math.abs(tabIndex(key) - tabIndex(activeCategory)) <= 1;
  const slideClass = "w-full shrink-0 snap-start snap-always overflow-y-auto overscroll-y-contain p-1 pt-3 outline-none md:data-[state=inactive]:hidden";
  useEffect(() => { listRef.current?.querySelector("[data-state=active]")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [activeCategory]);
  const openTab = (key: string) => {
    setCategory(key);
    slidesRef.current?.scrollTo({ left: tabIndex(key) * slidesRef.current.clientWidth });
  };
  const followSwipe = (slides: HTMLDivElement) => {
    const item = tabs[Math.round(slides.scrollLeft / slides.clientWidth)];
    if (item && item.key !== activeCategory) setCategory(item.key);
  };
  const select = (key: string, option: CatalogOption) => {
    if (option.isUnlocked === false) return;
    if (key === "shape") onChange({ buildingShape: option.key as BuildingShape });
    if (key === "color" && option.value) onChange({ color: option.value });
    if (key === "texture") onChange({ textureKey: option.value });
    if (key === "rooftop") onChange({ rooftopType: option.key as RooftopType });
    if (key === "edge_light") onChange({ edgeLightType: option.key as EdgeLightType });
  };
  const selected = (key: string, option: CatalogOption) => {
    if (key === "shape") return customization.buildingShape === option.key;
    if (key === "color") return customization.color.toLowerCase() === option.value?.toLowerCase();
    if (key === "texture") return customization.textureKey === option.value;
    if (key === "rooftop") return customization.rooftopType === option.key;
    return customization.edgeLightType === option.key;
  };
  async function uploadHologram(file: File | undefined) {
    if (!file || catalog?.features.hologram?.isUnlocked === false) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 700 * 1024) {
      setImageError("Use PNG, JPG, WebP ou GIF de até 700 KB.");
      return;
    }
    setImageBusy(true);
    setImageError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        readerRef.current = reader;
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error());
        reader.onerror = () => reject(reader.error);
        reader.onabort = () => reject(new DOMException("Leitura cancelada", "AbortError"));
        reader.readAsDataURL(file);
      });
      onChange({ hologramImage: dataUrl });
    } catch {
      setImageError("Não foi possível ler a imagem. Tente de novo.");
    } finally {
      setImageBusy(false);
    }
  }
  return (
    <section aria-label="Personalizar seu edifício" className="flex h-full min-h-0 min-w-0 flex-col gap-2 md:grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] md:gap-5">
      <div className="h-[clamp(6rem,28cqh,13rem)] min-w-0 shrink-0 md:h-full md:min-h-0">
        <Suspense fallback={<div role="status" className="grid h-full place-items-center bg-muted text-muted-foreground"><BlockLoader /><span className="sr-only">Carregando prévia 3D…</span></div>}>
          <Preview customization={customization} textureSettings={textureSettings} />
        </Suspense>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!catalog ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><BlockLoader />Carregando personalizações…</p> : (
          <Tabs.Root value={activeCategory} onValueChange={openTab} className="flex min-h-0 flex-1 flex-col">
            <Tabs.List ref={listRef} aria-label="Categorias de personalização" className="flex shrink-0 gap-1 overflow-x-auto shadow-[inset_0_-2px_0_0_var(--color-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((item) => (
                <Tabs.Trigger key={item.key} value={item.key} className={tabClass}>{item.label}</Tabs.Trigger>
              ))}
            </Tabs.List>
            <div ref={slidesRef} onScroll={(event) => followSwipe(event.currentTarget)} className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain motion-safe:scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((item) => {
                const options = catalog[item.field];
                const defaults = item.key === "texture" ? [{ id: -1, key: "default", label: "Padrão", value: null, sortOrder: -1, unlock: null, isUnlocked: true }] : [];
                return <Tabs.Content key={item.key} value={item.key} forceMount inert={item.key !== activeCategory} className={cn(slideClass, "space-y-2")}>
                  {near(item.key) && <>
                    <h3 className="sr-only">{item.label}</h3><p className="text-[11px] text-muted-foreground">{options.filter((option) => option.isUnlocked !== false).length + defaults.length} disponíveis</p>
                    <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {[...defaults, ...options].map((option) => <OptionCard key={option.id} category={item.key} option={option} selected={selected(item.key, option)} onSelect={() => select(item.key, option)} />)}
                    </div>
                  </>}
                </Tabs.Content>;
              })}
              {(["sign", "hologram"] as const).map((key) => {
                const feature = catalog.features[key];
                if (!feature) return null;
                const locked = feature.isUnlocked === false;
                return <Tabs.Content key={key} value={key} forceMount inert={key !== activeCategory} className={cn(slideClass, "space-y-3")}>
                  {locked && <div className="pixel pixel-thin bg-card p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><LockKeyhole aria-hidden className="size-3.5" />{key === "sign" ? "Letreiro bloqueado" : "Holograma bloqueado"}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{formatUnlockCta(feature.unlock)}</p>
                  </div>}
                  <fieldset disabled={locked || imageBusy} className="space-y-4 disabled:opacity-50">
                    {key === "sign" ? <>
                      <label className="block space-y-2"><span className="mono-label block">Texto do letreiro</span><Input maxLength={30} value={customization.signText} onChange={(event) => onChange({ signText: event.target.value })} placeholder="Marca ou empresa" /></label>
                      <label className="block space-y-2"><span className="mono-label block">Lados visíveis</span><select value={customization.signSides} onChange={(event) => onChange({ signSides: Number(event.target.value) })} className="field h-11 w-full pl-3.5 text-sm">{[1, 2, 3, 4].map((sides) => <option key={sides} value={sides}>{sides} {sides === 1 ? "lado" : "lados"}</option>)}</select></label>
                    </> : <>
                      <label className="block space-y-2"><span className="mono-label block">Imagem ou GIF</span><Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void uploadHologram(event.target.files?.[0]); event.target.value = ""; }} /><span className="block text-xs text-muted-foreground">PNG, JPG, WebP ou GIF. Até 700 KB.</span></label>
                      {imageBusy && <p role="status" className="text-sm text-muted-foreground">Lendo imagem…</p>}
                      {customization.hologramImage && <>
                        <img src={customization.hologramImage} alt="Imagem do holograma" className="pixel h-24 w-full bg-card p-2 object-contain" />
                        <Button type="button" variant="outline" onClick={() => onChange({ hologramImage: null })}>Remover imagem</Button>
                        <label className="flex items-center justify-between gap-3"><span className="mono-label">Cor do holograma</span><input type="color" value={customization.hologramColor} onChange={(event) => onChange({ hologramColor: event.target.value })} className="h-10 w-16" /></label>
                        <label className="block space-y-2"><span className="mono-label block">Opacidade · {Math.round(customization.hologramOpacity * 100)}%</span><input type="range" min={0} max={1} step={0.01} value={customization.hologramOpacity} onChange={(event) => onChange({ hologramOpacity: Number(event.target.value) })} className="block w-full" /></label>
                      </>}
                    </>}
                  </fieldset>
                  {key === "hologram" && imageError && <p role="alert" className="flex gap-1.5 text-sm text-destructive"><ErrorMark />{imageError}</p>}
                </Tabs.Content>;
              })}
              {team && (() => {
                // Imagens do time do evento, na ordem de exibição. Troca de time migra os telões (editor + servidor).
                const chosen = customization.screenImages.filter((key) => screenImages.some((image) => image.key === key));
                const max = Math.min(SCREEN_MAX_IMAGES, screenImages.length);
                const full = chosen.length >= max;
                const toggle = (key: string) => onChange({ screenImages: chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key] });
                return <Tabs.Content key="screen" value="screen" forceMount inert={activeCategory !== "screen"} className={cn(slideClass, "space-y-3")}>
                  <div className="space-y-2">
                    <p className="flex items-baseline justify-between gap-3">
                      <span id={`${screenIds}-images`} className="mono-label">{team.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{chosen.length}/{max}</span>
                    </p>
                    <div role="group" aria-labelledby={`${screenIds}-images`} className="grid grid-cols-3 gap-2">
                      {screenImages.map((image) => {
                        const order = chosen.indexOf(image.key);
                        return (
                          <button key={image.key} type="button" aria-pressed={order >= 0} disabled={order < 0 && full} onClick={() => toggle(image.key)}
                            aria-label={order >= 0 ? `${image.label}, ${order + 1}ª no telão` : image.label}
                            className={cn("focus-inset relative aspect-square overflow-hidden pixel pixel-thin bg-tinta p-1.5 transition-opacity disabled:cursor-not-allowed disabled:opacity-40", order >= 0 && "pixel-ink-verde")}>
                            <img src={image.url} alt="" loading="lazy" className="size-full object-contain" />
                            {order >= 0 && <span aria-hidden className="absolute right-1 top-1 grid size-5 place-items-center bg-primary font-mono text-[11px] font-semibold text-primary-foreground">{order + 1}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">Com mais de uma, o telão alterna nessa ordem.</p>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="mono-label">Lado</legend>
                    <div className="grid grid-cols-4 gap-2">
                      {SCREEN_SIDE_OPTIONS.map(({ value, label }) => (
                        <label key={value} className={cn("grid h-10 cursor-pointer place-items-center pixel pixel-thin text-sm font-semibold transition-colors has-focus-visible:outline-3 has-focus-visible:outline-ring has-focus-visible:outline-offset-[-3px]", customization.screenSide === value ? "pixel-ink-verde bg-secondary" : "bg-card hover:bg-accent")}>
                          <input type="radio" name={`${screenIds}-side`} value={value} checked={customization.screenSide === value} onChange={() => onChange({ screenSide: value })} className="sr-only" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {(customization.screenImages.length > 0 || onChangeClub) && <div className="flex flex-wrap gap-2">
                    {customization.screenImages.length > 0 && <Button type="button" variant="outline" onClick={() => onChange({ screenImages: [] })}>Remover telão</Button>}
                    {onChangeClub && <Button type="button" variant="ghost" onClick={onChangeClub}>Trocar time</Button>}
                  </div>}
                </Tabs.Content>;
              })()}
            </div>
            {!categories.length && !catalog.features.sign && !catalog.features.hologram && !team && <p className="py-8 text-sm text-muted-foreground">Nenhuma personalização disponível.</p>}
          </Tabs.Root>
        )}
      </div>
    </section>
  );
}
