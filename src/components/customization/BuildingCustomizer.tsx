import { lazy, Suspense, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { Tabs } from "radix-ui";
import type { CatalogOption, CustomizationCatalog } from "@/api/customizationApi";
import { formatUnlockCta } from "@/lib/unlock";
import { cn } from "@/lib/utils";
import type { BuildingCustomization, BuildingShape, EdgeLightType, RooftopType, TextureSettings } from "@/scene/types";
import { CustomizationImage } from "./CustomizationImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BlockLoader, ErrorMark, PixelCheck } from "@/components/ui/pixel-icon";

const Preview = lazy(() => import("@/components/three/BuildingPreview").then((module) => ({ default: module.BuildingPreview })));
const CATEGORIES = [
  { key: "shape", label: "Formato", field: "shapes" },
  { key: "color", label: "Cor", field: "colors" },
  { key: "texture", label: "Fachada", field: "textures" },
  { key: "rooftop", label: "Topo", field: "rooftops" },
  { key: "edge_light", label: "LED", field: "edgeLights" },
] as const;
// Barra de categorias: distância (px) entre centros. Painéis: respiro (px) entre um e outro no deslize.
const SLOT = 104;
const GAP = 12;
/** Posição relativa num anel de `count` itens, em [-count/2, count/2): base do loop infinito. */
const wrap = (value: number, count: number) => ((value % count) + count * 1.5) % count - count / 2;

type Drag = { id: number; x: number; y: number; from: number; lastX: number; lastT: number; speed: number; axis?: "x" | "y" };

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
export function BuildingCustomizer({ catalog, customization, textureSettings, onChange, onBusyChange, side = false }: {
  catalog: CustomizationCatalog | null;
  customization: BuildingCustomization;
  textureSettings: TextureSettings;
  onChange: (patch: Partial<BuildingCustomization>) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Painel lateral sobre a cena: sem prévia (a própria cena mostra), opções em 3 colunas. */
  side?: boolean;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  // Posição contínua no anel de categorias, sem limite: barra e painéis leem o mesmo valor,
  // então arrastar qualquer um move os dois juntos. Inteiro mais próximo = categoria ativa.
  const pos = useMotionValue(0);
  const [step, setStep] = useState(0);
  const target = useRef(0);
  const settling = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const wheelQuietAt = useRef(0);
  const dockRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const dockItems = useRef<(HTMLElement | null)[]>([]);
  const pages = useRef<(HTMLElement | null)[]>([]);
  const reduceMotion = useReducedMotion();
  useEffect(() => { onBusyChange?.(imageBusy); }, [imageBusy, onBusyChange]);
  useEffect(() => () => { readerRef.current?.abort(); onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => () => settling.current?.stop(), []);
  useMotionValueEvent(pos, "change", (value) => setStep(Math.round(value)));
  const categories = CATEGORIES.filter((item) => (catalog?.[item.field].length ?? 0) > 0);
  const tabs = [...categories, ...(catalog?.features.sign ? [{ key: "sign", label: "Letreiro" }] : []), ...(catalog?.features.hologram ? [{ key: "hologram", label: "Holograma" }] : [])];
  const count = tabs.length;
  const active = count ? ((step % count) + count) % count : 0;

  // Estilo direto no DOM a cada quadro, sem re-render. Ativa: centro e maior; vizinhas: 20% menores e
  // 4 px mais baixas (cor fraca vem da classe); além delas somem antes do ponto em que o anel vira.
  useLayoutEffect(() => {
    const paint = (value: number) => {
      dockItems.current.forEach((item, index) => {
        if (!item) return;
        const offset = wrap(index - value, count);
        const near = Math.min(Math.abs(offset), 1);
        item.style.transform = `translate(calc(-50% + ${offset * SLOT}px), ${near * 4}px) scale(${1 - near * 0.2})`;
        item.style.opacity = String(Math.max(0, 1 - (Math.abs(offset) - 1) * 0.9));
      });
      pages.current.forEach((page, index) => {
        if (!page) return;
        const offset = wrap(index - value, count);
        page.style.transform = `translateX(calc(${offset * 100}% + ${offset * GAP}px))`;
      });
    };
    paint(pos.get());
    return pos.on("change", paint);
  }, [pos, count]);

  const settle = (to: number, velocity = 0) => {
    target.current = to;
    settling.current?.stop();
    settling.current = animate(pos, to, reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38, velocity });
  };
  // Caminho mais curto no anel: de Holograma para Formato anda uma casa, não volta tudo.
  const goTo = (index: number) => settle(target.current + wrap(index - target.current, count));

  // Arrasto (dedo ou mouse) na barra e nos painéis. Gesto mais vertical fica com a rolagem nativa das opções.
  // Barra: 1 categoria = SLOT px e gira com inércia. Painéis: 1 categoria = largura do painel, no máximo uma por gesto.
  const unit = (element: HTMLElement) => element === dockRef.current ? SLOT : element.clientWidth + GAP;
  const swipe = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      dragged.current = false;
      if (count < 2 || event.button !== 0 || (event.target as Element).closest("input, select, textarea")) return;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: 0, lastX: event.clientX, lastT: event.timeStamp, speed: 0 };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const gesture = drag.current;
      if (!gesture || gesture.id !== event.pointerId || gesture.axis === "y") return;
      if (!gesture.axis) {
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (Math.hypot(dx, dy) < 8) return;
        gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (gesture.axis === "y") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        settling.current?.stop();
        dragged.current = true;
        gesture.x = event.clientX;
        gesture.from = pos.get();
      }
      gesture.speed = (event.clientX - gesture.lastX) / Math.max(1, event.timeStamp - gesture.lastT);
      gesture.lastX = event.clientX;
      gesture.lastT = event.timeStamp;
      pos.set(gesture.from - (event.clientX - gesture.x) / unit(event.currentTarget));
    },
    onPointerUp: release,
    onPointerCancel: release,
    // Arrasto que termina sobre um botão não vale como clique.
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!dragged.current) return;
      event.preventDefault();
      event.stopPropagation();
      dragged.current = false;
    },
  };
  function release(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null;
    if (gesture.axis !== "x") return;
    // Velocidade em categorias/s; dedo parado há mais de 80 ms solta sem arremesso.
    const velocity = event.timeStamp - gesture.lastT > 80 ? 0 : (-gesture.speed * 1000) / unit(event.currentTarget);
    const value = pos.get();
    if (event.currentTarget === dockRef.current) return settle(Math.round(value + velocity * 0.25), velocity);
    // Painel: arremesso ou 1/4 da largura já troca; menos que isso volta.
    const base = Math.round(gesture.from);
    const moved = value - base;
    settle(base + (Math.abs(velocity) > 0.8 ? Math.sign(velocity) : Math.abs(moved) > 0.25 ? Math.sign(moved) : 0), velocity);
  }

  // Roda do mouse na barra (qualquer eixo) e trackpad na horizontal nos painéis: um gesto = uma categoria.
  // Trava até 200 ms sem evento para a inércia do trackpad não pular várias.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (count < 2 || (event.currentTarget === pagesRef.current && !horizontal)) return;
    event.preventDefault();
    const delta = horizontal ? event.deltaX : event.deltaY;
    const locked = event.timeStamp < wheelQuietAt.current;
    if (locked || Math.abs(delta) >= 4) wheelQuietAt.current = event.timeStamp + 200;
    if (!locked && Math.abs(delta) >= 4) settle(target.current + Math.sign(delta));
  });
  const ready = catalog !== null;
  useEffect(() => {
    const elements = [dockRef.current, pagesRef.current];
    const listener = (event: WheelEvent) => onWheel(event);
    elements.forEach((element) => element?.addEventListener("wheel", listener, { passive: false }));
    return () => elements.forEach((element) => element?.removeEventListener("wheel", listener));
  }, [ready]);

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
  const featurePanel = (key: "sign" | "hologram") => {
    const feature = catalog?.features[key];
    if (!feature) return null;
    const locked = feature.isUnlocked === false;
    return <>
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
    </>;
  };
  return (
    <section aria-label="Personalizar edifício" className={cn("flex h-full min-h-0 min-w-0 flex-col gap-2", !side && "md:grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] md:gap-5")}>
      {!side && <div className="h-[clamp(6rem,28cqh,13rem)] min-w-0 shrink-0 md:h-full md:min-h-0">
        <Suspense fallback={<div role="status" className="grid h-full place-items-center bg-muted text-muted-foreground"><BlockLoader /><span className="sr-only">Carregando prévia 3D…</span></div>}>
          <Preview customization={customization} textureSettings={textureSettings} />
        </Suspense>
      </div>}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!catalog ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><BlockLoader />Carregando personalizações…</p>
          : !count ? <p className="py-8 text-sm text-muted-foreground">Nenhuma personalização disponível.</p> : (
          <Tabs.Root value={tabs[active].key} onValueChange={(key) => goTo(tabs.findIndex((item) => item.key === key))} className="flex min-h-0 flex-1 flex-col">
            {/* Painéis em anel: só a atual e as vizinhas montam itens (miniaturas 3D não renderizam todas de uma vez). */}
            <div ref={pagesRef} {...swipe} onDragStart={(event) => event.preventDefault()}
              className="relative min-h-0 flex-1 touch-pan-y select-none overflow-hidden [&_input]:select-text">
              {tabs.map((item, index) => (
                <Tabs.Content key={item.key} ref={(element) => { pages.current[index] = element; }} value={item.key} forceMount inert={index !== active}
                  className={cn("absolute inset-0 touch-pan-y overflow-y-auto overscroll-y-contain p-1 pt-3 outline-none", "field" in item ? "space-y-2" : "space-y-3")}>
                  {Math.abs(wrap(index - active, count)) <= 1 && ("field" in item ? <>
                    <h3 className="sr-only">{item.label}</h3><p className="text-[11px] text-muted-foreground">{catalog[item.field].filter((option) => option.isUnlocked !== false).length + (item.key === "texture" ? 1 : 0)} disponíveis</p>
                    <div className={cn("grid items-stretch gap-2", side ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4")}>
                      {[...(item.key === "texture" ? [{ id: -1, key: "default", label: "Padrão", value: null, sortOrder: -1, unlock: null, isUnlocked: true }] : []), ...catalog[item.field]].map((option) => <OptionCard key={option.id} category={item.key} option={option} selected={selected(item.key, option)} onSelect={() => select(item.key, option)} />)}
                    </div>
                  </> : featurePanel(item.key as "sign" | "hologram"))}
                </Tabs.Content>
              ))}
            </div>
            {/* Barra de categorias infinita: janela fixa no centro marca a ativa; arrastar, rolar, clicar ou setas do teclado giram o anel. */}
            <div ref={dockRef} {...swipe} className="relative mt-1 h-14 shrink-0 touch-none select-none overflow-hidden shadow-[inset_0_2px_0_0_var(--color-border)]">
              <span aria-hidden className="absolute top-2.5 bottom-1 left-1/2 w-26 -translate-x-1/2 bg-secondary shadow-[inset_0_-4px_0_0_var(--color-primary)]" />
              {/* Seleção no clique, não no mousedown do Radix: arrastar a partir de uma categoria não a escolhe. */}
              <Tabs.List aria-label="Categorias de personalização" className="absolute inset-0">
                {tabs.map((item, index) => (
                  <Tabs.Trigger key={item.key} ref={(element) => { dockItems.current[index] = element; }} value={item.key}
                    onMouseDown={(event) => event.preventDefault()} onClick={() => goTo(index)}
                    className="focus-inset absolute top-2.5 left-1/2 flex h-10 items-center px-3 pb-1 text-[15px] font-bold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-foreground">
                    {item.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </div>
          </Tabs.Root>
        )}
      </div>
    </section>
  );
}
