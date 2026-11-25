import { lazy, Suspense, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { Tabs } from "radix-ui";
import type { CatalogOption, CustomizationCatalog } from "@/api/customizationApi";
import { formatUnlockCta } from "@/lib/unlock";
import { cn } from "@/lib/utils";
import { SCREEN_MAX_IMAGES, type BuildingCustomization, type BuildingShape, type EdgeLightType, type RooftopType, type ScreenLabel, type ScreenSide, type TextureSettings } from "@/scene/types";
import { useClubCatalog } from "@/components/hooks/useClubCatalog";
import { clubImages, findClub } from "@/lib/clubs";
import { CustomizationImage } from "./CustomizationImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BlockLoader, ErrorMark, PixelArrow, PixelCheck, PixelImage, PixelLock, PixelUpload } from "@/components/ui/pixel-icon";

const Preview = lazy(() => import("@/components/three/BuildingPreview").then((module) => ({ default: module.BuildingPreview })));
const CATEGORIES = [
  { key: "shape", label: "Formato", field: "shapes" },
  { key: "color", label: "Cor", field: "colors" },
  { key: "texture", label: "Fachada", field: "textures" },
  { key: "rooftop", label: "Topo", field: "rooftops" },
  { key: "edge_light", label: "LED", field: "edgeLights" },
] as const;
// Lado do telão em cruz em volta da planta (Fundos em cima, Frente embaixo); `bar` = face acesa na planta.
const SCREEN_SIDE_OPTIONS: ReadonlyArray<{ value: ScreenSide; label: string; cell: string; bar: string }> = [
  { value: "back", label: "Fundos", cell: "col-start-2 row-start-1", bar: "left-3 top-[7px] h-[5px] w-8" },
  { value: "left", label: "Esquerda", cell: "col-start-1 row-start-2 justify-self-end", bar: "left-[7px] top-3 h-8 w-[5px]" },
  { value: "right", label: "Direita", cell: "col-start-3 row-start-2 justify-self-start", bar: "right-[7px] top-3 h-8 w-[5px]" },
  { value: "front", label: "Frente", cell: "col-start-2 row-start-3", bar: "bottom-[7px] left-3 h-[5px] w-8" },
];
// Faces do ícone de lados do letreiro, na ordem em que acendem: frente, direita, fundos, esquerda.
const SIGN_SIDE_BARS = ["inset-x-[3px] bottom-0 h-[3px]", "inset-y-[3px] right-0 w-[3px]", "inset-x-[3px] top-0 h-[3px]", "inset-y-[3px] left-0 w-[3px]"];
// Barra de categorias: espaço (px) entre um nome e outro. Painéis: respiro (px) entre um e outro no deslize.
const LABEL_GAP = 14;
const PAGE_GAP = 12;
/** Posição relativa num anel de `count` itens, em [-count/2, count/2): base do loop infinito. */
const wrap = (value: number, count: number) => ((value % count) + count * 1.5) % count - count / 2;
const mod = (value: number, count: number) => ((value % count) + count) % count;
/** Opção em botão (lados, nome do telão): rádio nativo escondido; marcada = verde com bisel. */
const chipClass = (on: boolean) => cn("cursor-pointer pixel pixel-thin text-[13px] font-bold transition-colors has-focus-visible:outline-3 has-focus-visible:outline-ring has-focus-visible:outline-offset-[-3px]",
  on ? "bevel-verde-700 bg-primary text-primary-foreground" : "bevel-edge bg-card hover:bg-accent");
// Nome na barra (botão e cópia em tinta dentro da janela âmbar): mesma caixa, então a lente casa com o nome.
const railLabelClass = "absolute left-1/2 top-1/2 px-2 pt-1 pb-1.5 text-[15px] font-extrabold leading-[1.2] tracking-[0.01em] whitespace-nowrap";

type Drag = { id: number; x: number; y: number; from: number; lastX: number; lastT: number; speed: number; axis?: "x" | "y" };
type WheelState = { time: number; dir: number; sizes: number[]; peak: number; fell: boolean; armed: boolean; stepAt: number };

/**
 * Roda/trackpad → passo de categoria (−1, 0 ou 1). Trackpad manda o gesto e, emendada, a inércia
 * (deltas decaindo a cada quadro por ~1 s): trava por tempo engolia o gesto seguinte feito durante
 * ela. Gesto novo = pausa > 150 ms, sentido invertido ou deltas voltando a crescer (3 últimos somam
 * ≥ 12 px e > 1,5× os 3 anteriores) depois de terem caído à metade do pico — a subida do próprio
 * gesto, por mais lenta, nunca cai antes. Passo sai no 1º delta ≥ 4 px do gesto novo; nos 250 ms
 * depois dele, só pausa conta.
 */
function wheelStep(state: WheelState, delta: number, time: number) {
  const size = Math.abs(delta);
  const dir = Math.sign(delta);
  const calm = time - state.stepAt >= 250;
  const paused = time - state.time > 150;
  if (paused) {
    state.sizes = [];
    state.armed = true;
  } else if (calm && dir && state.dir && dir !== state.dir && size >= 2) state.armed = true;
  state.time = time;
  if (dir) state.dir = dir;
  state.peak = Math.max(state.peak, size);
  if (size <= state.peak / 2) state.fell = true;
  const sizes = state.sizes;
  sizes.push(size);
  if (sizes.length > 6) sizes.shift();
  const recent = sizes.length === 6 ? sizes[3] + sizes[4] + sizes[5] : 0;
  if (calm && state.fell && recent >= 12 && recent > 1.5 * (sizes[0] + sizes[1] + sizes[2])) state.armed = true;
  if (!state.armed || size < 4 || !(calm || paused)) return 0;
  state.armed = false;
  state.stepAt = time;
  state.peak = size;
  state.fell = false;
  return dir;
}

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
      className={cn("relative flex min-w-0 flex-col bg-card text-left pixel transition-[translate,box-shadow] duration-[90ms] ease-out enabled:hover:-translate-0.5 enabled:hover:raised enabled:active:translate-0 enabled:active:[--pixel-drop:0_0_#0000] disabled:cursor-not-allowed motion-reduce:transition-none", !selected && "pixel-thin")}>
      <span className={cn("relative grid h-[118px] shrink-0 place-items-center overflow-hidden p-2", selected ? "bg-ambar-100" : "bg-secondary")}>
        <span className={cn("size-full", locked && "opacity-45")}>
          <CustomizationImage categoryKey={category} optionKey={option.key} value={option.value} />
        </span>
        {selected && <span aria-hidden className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 bg-ambar px-1.5 pt-0.5 pb-1 pixel pixel-thin font-mono text-[11px] font-semibold tracking-[0.04em] text-tinta">
          <PixelCheck className="h-[7px] w-[9px]" />EM USO
        </span>}
        {locked && <span aria-hidden className="absolute right-1.5 top-1.5 grid size-[22px] place-items-center bg-tinta text-papel"><PixelLock /></span>}
      </span>
      <span className={cn("flex min-h-[46px] flex-1 flex-col gap-1 px-[9px] pt-2 pb-2.5 text-[13px] leading-[1.2] font-bold break-words", selected && "bg-tinta text-papel")}>
        {option.label}
        {locked && <>
          <span className="font-mono text-[11px] font-medium text-muted-foreground">Bloqueado</span>
          <span id={requirementId} className="text-xs leading-[1.35] font-medium text-muted-foreground">{formatUnlockCta(option.unlock)}</span>
        </>}
      </span>
    </button>
  );
}

/** Editor de aparência reutilizável: catálogo e persistência pertencem ao chamador. */
export function BuildingCustomizer({ catalog, customization, textureSettings, onChange, onBusyChange, side = false, club = null, onChangeClub }: {
  catalog: CustomizationCatalog | null;
  customization: BuildingCustomization;
  textureSettings: TextureSettings;
  onChange: (patch: Partial<BuildingCustomization>) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Painel lateral sobre a cena: sem prévia (a própria cena mostra). */
  side?: boolean;
  /** Time do evento (slug): aba Telão só existe com ele, e só com as imagens dele (catálogo da API). */
  club?: string | null;
  /** Presente enquanto a troca única de time está disponível. */
  onChangeClub?: () => void;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  // Posição contínua no anel de categorias, sem limite: barra e painéis leem o mesmo valor,
  // então arrastar qualquer um move os dois juntos. Inteiro mais próximo = categoria ativa.
  const pos = useMotionValue(0);
  const [step, setStep] = useState(0);
  // Dica de gesto (balão + setas piscando) até o primeiro uso da barra ou dos painéis.
  const [hinted, setHinted] = useState(false);
  const target = useRef(0);
  const settling = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const wheel = useRef<WheelState>({ time: -Infinity, dir: 0, sizes: [], peak: 0, fell: false, armed: true, stepAt: -Infinity });
  const spacing = useRef(100);
  const dockRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const dockItems = useRef<(HTMLElement | null)[]>([]);
  const lensItems = useRef<(HTMLElement | null)[]>([]);
  const pages = useRef<(HTMLElement | null)[]>([]);
  const reduceMotion = useReducedMotion();
  useEffect(() => { onBusyChange?.(imageBusy); }, [imageBusy, onBusyChange]);
  useEffect(() => () => { readerRef.current?.abort(); onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => () => settling.current?.stop(), []);
  useMotionValueEvent(pos, "change", (value) => setStep(Math.round(value)));
  const categories = CATEGORIES.filter((item) => (catalog?.[item.field].length ?? 0) > 0);
  const clubCatalog = useClubCatalog(club !== null);
  const team = club ? findClub(clubCatalog.catalog?.clubs ?? [], club) : null;
  const screenImages = team ? clubImages(team) : [];
  // Evento desligado pelo admin: ninguém troca de time (o servidor recusaria).
  const changeClub = clubCatalog.catalog?.isActive ? onChangeClub : undefined;
  const tabs = [...categories, ...(catalog?.features.sign ? [{ key: "sign", label: "Letreiro" }] : []), ...(catalog?.features.hologram ? [{ key: "hologram", label: "Holograma" }] : []), ...(team ? [{ key: "screen", label: "Telão" }] : [])];
  const ids = useId();
  const count = tabs.length;
  const active = count ? mod(step, count) : 0;

  // Estilo direto no DOM a cada quadro, sem re-render. Nomes medidos: espaço fixo entre eles, não entre
  // centros. Ativa no centro, 14% maior; vizinhas menores, mais baixas e com seta para fora; telas
  // ≥ 380 px mostram duas de cada lado, o resto some antes do ponto em que o anel vira. Janela âmbar
  // acompanha a largura do nome e repete os nomes em tinta por dentro (lente).
  useLayoutEffect(() => {
    if (!count) return;
    let widths: number[] = [];
    let centers: number[] = [];
    let period = 0;
    let shown = 1;
    const measure = () => {
      widths = Array.from({ length: count }, (_, index) => dockItems.current[index]?.offsetWidth || 80);
      centers = [0];
      for (let index = 1; index < count; index++) centers.push(centers[index - 1] + (widths[index - 1] + widths[index]) / 2 + LABEL_GAP);
      period = centers[count - 1] + (widths[count - 1] + widths[0]) / 2 + LABEL_GAP;
      spacing.current = period / count;
      shown = (dockRef.current?.clientWidth ?? 0) >= 380 ? 2 : 1;
    };
    const center = (slot: number) => Math.floor(slot / count) * period + centers[mod(slot, count)];
    const fade = (distance: number) => (distance <= 1 ? 1 : 1 - 0.42 * Math.min(distance - 1, 1));
    const paint = (value: number) => {
      const base = Math.floor(value);
      const t = value - base;
      const origin = center(base) + (center(base + 1) - center(base)) * t;
      dockItems.current.forEach((item, index) => {
        if (!item || index >= count) return;
        const offset = wrap(index - value, count);
        const distance = Math.abs(offset);
        const x = center(Math.round(value + offset)) - origin;
        const y = distance < 1 ? -4 + 7 * distance : Math.min(5.5, 3 + 2.5 * (distance - 1));
        const scale = distance < 1 ? 1.14 - 0.26 * distance : Math.max(0.8, 0.88 - 0.06 * (distance - 1));
        const opacity = distance <= shown ? fade(distance) : fade(shown) * Math.max(0, 1 - (distance - shown) / 0.6);
        const arrow = distance > 0.5 && distance < 1.5 ? Math.min(1, (distance - 0.5) * 2, (1.5 - distance) * 2) : 0;
        item.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
        item.style.opacity = String(opacity);
        item.style.visibility = opacity < 0.02 ? "hidden" : "visible";
        item.style.setProperty("--arrow-l", String(offset < 0 ? arrow : 0));
        item.style.setProperty("--arrow-r", String(offset > 0 ? arrow : 0));
        const lens = lensItems.current[index];
        if (lens) {
          lens.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y + 4}px)) scale(${scale})`;
          lens.style.visibility = distance < 1.6 ? "visible" : "hidden";
        }
      });
      const label = (slot: number) => widths[mod(slot, count)] - 16;
      if (frameRef.current) frameRef.current.style.width = `${Math.round((label(base) + (label(base + 1) - label(base)) * t) * 1.14 + 28)}px`;
      pages.current.forEach((page, index) => {
        if (!page) return;
        const offset = wrap(index - value, count);
        page.style.transform = `translateX(calc(${offset * 100}% + ${offset * PAGE_GAP}px))`;
      });
    };
    const repaint = () => { measure(); paint(pos.get()); };
    repaint();
    // Fonte self-hosted chega depois (swap) e a largura do painel muda com a tela: mede de novo.
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) repaint(); });
    const observer = new ResizeObserver(repaint);
    if (dockRef.current) observer.observe(dockRef.current);
    const stop = pos.on("change", paint);
    return () => { alive = false; observer.disconnect(); stop(); };
  }, [pos, count]);

  const settle = (to: number, velocity = 0) => {
    setHinted(true);
    target.current = to;
    settling.current?.stop();
    settling.current = animate(pos, to, reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38, velocity });
  };
  // Caminho mais curto no anel: de Holograma para Formato anda uma casa, não volta tudo.
  const goTo = (index: number) => settle(target.current + wrap(index - target.current, count));

  // Arrasto (dedo ou mouse) na barra e nos painéis. Gesto mais vertical fica com a rolagem nativa das opções.
  // Barra: 1 categoria = espaço médio entre nomes e gira com inércia. Painéis: 1 categoria = largura do painel, no máximo uma por gesto.
  const unit = (element: HTMLElement) => element === dockRef.current ? spacing.current : element.clientWidth + PAGE_GAP;
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
        setHinted(true);
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

  // Roda do mouse na barra (qualquer eixo) e trackpad na horizontal nos painéis: um gesto = uma categoria (`wheelStep`).
  const onWheel = useEffectEvent((event: WheelEvent) => {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (count < 2 || (event.currentTarget === pagesRef.current && !horizontal)) return;
    event.preventDefault();
    // Firefox com roda de mouse manda linhas (ou páginas), não pixels.
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const step = wheelStep(wheel.current, (horizontal ? event.deltaX : event.deltaY) * scale, event.timeStamp);
    if (step) settle(target.current + step);
  });
  const ready = catalog !== null;
  useEffect(() => {
    const elements = [dockRef.current, pagesRef.current];
    const listener = (event: WheelEvent) => onWheel(event);
    elements.forEach((element) => element?.addEventListener("wheel", listener, { passive: false }));
    return () => elements.forEach((element) => element?.removeEventListener("wheel", listener));
  }, [ready]);
  // Sem gesto em 1,2 s: anel anda 16% para a próxima categoria e volta, mostrando que os painéis deslizam.
  useEffect(() => {
    if (hinted || !ready || count < 2 || reduceMotion) return;
    const timer = setTimeout(() => {
      if (drag.current) return;
      const from = target.current;
      settling.current?.stop();
      settling.current = animate(pos, [from, from + 0.16, from], { duration: 0.68, times: [0, 0.38, 1], ease: "easeOut" });
    }, 1200);
    return () => clearTimeout(timer);
  }, [hinted, ready, count, reduceMotion, pos]);

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
  const signFields = () => <>
    <div className="flex flex-col gap-2.5">
      <label htmlFor={`${ids}-sign`} className="mono-label">Texto do letreiro</label>
      <Input id={`${ids}-sign`} maxLength={30} value={customization.signText} onChange={(event) => onChange({ signText: event.target.value })} placeholder="Marca ou empresa" />
      <span className="self-end font-mono text-[11px] text-muted-foreground">{customization.signText.length}/30</span>
    </div>
    <fieldset className="space-y-2.5">
      <legend className="mono-label">Lados visíveis</legend>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((sides) => (
          <label key={sides} className={cn(chipClass(customization.signSides === sides), "flex min-w-0 flex-col items-center gap-[7px] px-1 pt-2.5 pb-[13px] text-xs")}>
            <input type="radio" name={`${ids}-sides`} value={sides} checked={customization.signSides === sides} onChange={() => onChange({ signSides: sides })} className="sr-only" />
            <span aria-hidden className="relative size-[18px]">
              {SIGN_SIDE_BARS.map((bar, index) => <span key={bar} className={cn("absolute", bar, index < sides ? "bg-ambar" : "bg-papel-300")} />)}
            </span>
            {sides} {sides === 1 ? "lado" : "lados"}
          </label>
        ))}
      </div>
    </fieldset>
  </>;
  const hologramFields = () => {
    const image = customization.hologramImage;
    return <>
      {/* Palco: imagem na cor e opacidade escolhidas sobre o feixe; sem imagem, espaço reservado. */}
      <div aria-hidden className="flex min-h-44 flex-col items-center justify-end gap-1.5 bg-tinta px-4 pt-3.5 pb-4" style={{ color: customization.hologramColor }}>
        {image
          ? <img src={image} alt="" className="h-[92px] w-[132px] object-contain" style={{ opacity: customization.hologramOpacity }} />
          : <span className="flex h-[92px] w-[132px] flex-col items-center justify-center gap-2 border-2 border-dashed border-current font-mono text-[11px] tracking-[0.04em]"><PixelImage />SUA IMAGEM AQUI</span>}
        <span className="mt-1.5 flex flex-col items-center gap-[3px] opacity-55">
          <span className="h-0.5 w-[30px] bg-current" /><span className="h-0.5 w-5 bg-current" /><span className="h-0.5 w-2.5 bg-current" />
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="mono-label">Imagem ou GIF</span>
        <div className="flex flex-wrap items-center gap-3.5">
          <input id={`${ids}-hologram`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="peer sr-only" onChange={(event) => { void uploadHologram(event.target.files?.[0]); event.target.value = ""; }} />
          <Button asChild variant="outline" className="peer-focus-visible:outline-3 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-4">
            <label htmlFor={`${ids}-hologram`}><PixelUpload />{image ? "Trocar imagem" : "Escolher imagem"}</label>
          </Button>
          {image && <Button type="button" variant="link" className="px-1" onClick={() => onChange({ hologramImage: null })}>Remover imagem</Button>}
        </div>
        <span role="status" className="text-[13px] text-muted-foreground">{imageBusy ? "Lendo imagem…" : "PNG, JPG, WebP ou GIF. Até 700 KB."}</span>
        {imageError && <p role="alert" className="flex gap-1.5 text-sm text-destructive"><ErrorMark />{imageError}</p>}
      </div>
      {image && <>
        <label className="flex items-center justify-between gap-3"><span className="mono-label">Cor do holograma</span><input type="color" value={customization.hologramColor} onChange={(event) => onChange({ hologramColor: event.target.value })} className="h-9 w-14" /></label>
        <label className="flex flex-col gap-2"><span className="mono-label">Opacidade · {Math.round(customization.hologramOpacity * 100)}%</span><input type="range" min={0} max={1} step={0.01} value={customization.hologramOpacity} onChange={(event) => onChange({ hologramOpacity: Number(event.target.value) })} className="block w-full" /></label>
      </>}
    </>;
  };
  const featurePanel = (key: "sign" | "hologram") => {
    const feature = catalog?.features[key];
    if (!feature) return null;
    const locked = feature.isUnlocked === false;
    return <>
      {locked && <div className="pixel pixel-thin bg-card p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><PixelLock />{key === "sign" ? "Letreiro bloqueado" : "Holograma bloqueado"}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{formatUnlockCta(feature.unlock)}</p>
      </div>}
      <fieldset disabled={locked || imageBusy} className="flex min-w-0 flex-col gap-4.5 disabled:opacity-50">
        {key === "sign" ? signFields() : hologramFields()}
      </fieldset>
    </>;
  };
  // Imagens do time do evento, na ordem de exibição. Key de outro time (troca de time) não conta
  // aqui e some na próxima gravação; até lá a cena segue com ela.
  const screenPanel = () => {
    const chosen = customization.screenImages.filter((key) => screenImages.some((image) => image.key === key));
    const max = Math.min(SCREEN_MAX_IMAGES, screenImages.length);
    const full = chosen.length >= max;
    const toggle = (key: string) => onChange({ screenImages: chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key] });
    // Faixa do nome: apelido só se o time tem; o que o time perdeu aparece como nome (a cena faz igual).
    const labelOptions: ReadonlyArray<{ value: ScreenLabel; label: string }> = [
      { value: "none", label: "Nenhum" },
      { value: "name", label: team?.name ?? "" },
      ...(team?.nickname ? [{ value: "nickname" as const, label: team.nickname }] : []),
    ];
    const screenLabel = customization.screenLabel === "nickname" && !team?.nickname ? "name" : customization.screenLabel;
    return <>
      <div className="flex flex-col gap-2.5">
        <p className="flex items-baseline justify-between gap-3">
          <span id={`${ids}-images`} className="mono-label">{team?.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{chosen.length}/{max}</span>
        </p>
        <div role="group" aria-labelledby={`${ids}-images`} className="grid grid-cols-3 gap-3">
          {screenImages.map((image) => {
            const order = chosen.indexOf(image.key);
            return (
              <button key={image.key} type="button" aria-pressed={order >= 0} disabled={order < 0 && full} onClick={() => toggle(image.key)}
                aria-label={order >= 0 ? `${image.label}, ${order + 1}ª no telão` : image.label}
                className={cn("focus-inset relative aspect-square overflow-hidden bg-tinta p-1.5 pixel transition-opacity disabled:cursor-not-allowed disabled:opacity-40", order >= 0 ? "pixel-ink-ambar" : "pixel-thin")}>
                <img src={image.url} alt="" loading="lazy" className="size-full object-contain" />
                {order >= 0 && <span aria-hidden className="absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center bg-ambar px-1 pixel pixel-thin font-mono text-[11px] font-semibold text-tinta">{order + 1}</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] leading-[1.45] text-muted-foreground">Com mais de uma, o telão alterna nessa ordem.</p>
      </div>
      {chosen.length > 0 && <fieldset className="space-y-2.5">
        <legend className="mono-label">Nome</legend>
        <div className={cn("grid gap-2", labelOptions.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {labelOptions.map(({ value, label }) => (
            <label key={value} className={cn(chipClass(screenLabel === value), "grid h-11 min-w-0 place-items-center pb-1")}>
              <input type="radio" name={`${ids}-label`} value={value} checked={screenLabel === value} onChange={() => onChange({ screenLabel: value })} className="sr-only" />
              <span className="max-w-full truncate px-2">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>}
      <fieldset className="space-y-2.5">
        <legend className="mono-label">Lado</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] grid-rows-[auto_64px_auto] items-center justify-items-center gap-1.5">
          {SCREEN_SIDE_OPTIONS.map(({ value, label, cell }) => (
            <label key={value} className={cn(chipClass(customization.screenSide === value), "min-w-[84px] px-3 pt-[9px] pb-3 text-center", cell)}>
              <input type="radio" name={`${ids}-side`} value={value} checked={customization.screenSide === value} onChange={() => onChange({ screenSide: value })} className="sr-only" />
              {label}
            </label>
          ))}
          {/* Planta vista de cima: face do telão acesa em âmbar. */}
          <span aria-hidden className="relative col-start-2 row-start-2 size-14 bg-secondary pixel pixel-thin">
            <span className="absolute inset-3.5 bg-primary/50" />
            {SCREEN_SIDE_OPTIONS.map(({ value, bar }) => <span key={value} className={cn("absolute", bar, customization.screenSide === value ? "bg-ambar" : "bg-primary/25")} />)}
          </span>
        </div>
      </fieldset>
      {(customization.screenImages.length > 0 || changeClub) && <div className="flex flex-wrap items-center gap-3.5">
        {customization.screenImages.length > 0 && <Button type="button" variant="outline" onClick={() => onChange({ screenImages: [] })}>Remover telão</Button>}
        {changeClub && <Button type="button" variant="link" className="px-1" onClick={changeClub}>Trocar time</Button>}
      </div>}
    </>;
  };
  return (
    <section aria-label="Personalizar edifício" className="flex h-full min-h-0 min-w-0 flex-col">
      {!side && <div className="h-[clamp(6rem,28cqh,13rem)] min-w-0 shrink-0 px-3 pt-3">
        <Suspense fallback={<div role="status" className="grid h-full place-items-center bg-muted text-muted-foreground"><BlockLoader /><span className="sr-only">Carregando prévia 3D…</span></div>}>
          <Preview customization={customization} textureSettings={textureSettings} />
        </Suspense>
      </div>}
      {!catalog ? <p role="status" className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground"><BlockLoader />Carregando personalizações…</p>
        : !count ? <p className="px-4 py-8 text-sm text-muted-foreground">Nenhuma personalização disponível.</p> : (
        <Tabs.Root value={tabs[active].key} onValueChange={(key) => goTo(tabs.findIndex((item) => item.key === key))} className="flex min-h-0 flex-1 flex-col">
          {/* Painéis em anel: só a atual e as vizinhas montam itens (miniaturas 3D não renderizam todas de uma vez). */}
          <div ref={pagesRef} {...swipe} onDragStart={(event) => event.preventDefault()}
            className="relative min-h-0 flex-1 touch-pan-y select-none overflow-hidden [&_input]:select-text motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
            {tabs.map((item, index) => (
              <Tabs.Content key={item.key} ref={(element) => { pages.current[index] = element; }} value={item.key} forceMount inert={index !== active}
                className={cn("absolute inset-0 touch-pan-y overflow-y-auto overscroll-y-contain px-3 pt-2.5 pb-4 outline-none", !("field" in item) && "flex flex-col gap-4.5")}>
                {Math.abs(wrap(index - active, count)) <= 1 && ("field" in item ? <>
                  <h3 className="sr-only">{item.label}</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[...(item.key === "texture" ? [{ id: -1, key: "default", label: "Padrão", value: null, sortOrder: -1, unlock: null, isUnlocked: true }] : []), ...catalog[item.field]].map((option) => <OptionCard key={option.id} category={item.key} option={option} selected={selected(item.key, option)} onSelect={() => select(item.key, option)} />)}
                  </div>
                </> : item.key === "screen" ? screenPanel() : featurePanel(item.key as "sign" | "hologram"))}
              </Tabs.Content>
            ))}
            {!hinted && count > 1 && <span aria-hidden className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 bg-tinta px-2.5 pt-1.5 pb-[7px] font-mono text-[11px] whitespace-nowrap text-papel">
              <svg viewBox="0 0 9 5" width={18} height={10} shapeRendering="crispEdges" className="shrink-0 text-ambar"><path fill="currentColor" d="M0 2h9v1h-9zM1 1h1v3h-1zM2 0h1v5h-1zM6 0h1v5h-1zM7 1h1v3h-1z" /></svg>
              Arraste ou toque num nome
            </span>}
          </div>
          {/* Barra de categorias infinita na base escura: janela âmbar fixa no centro marca a ativa;
              arrastar, rolar, clicar ou setas do teclado giram o anel. Foco de teclado vira a janela em papel. */}
          <div className="shrink-0 bg-tinta pt-1.5">
            <div ref={dockRef} {...swipe} className="group/dock relative h-[50px] cursor-grab touch-none select-none overflow-hidden">
              {/* Seleção no clique, não no mousedown do Radix: arrastar a partir de uma categoria não a escolhe. */}
              <Tabs.List aria-label="Categorias de aparência" className="absolute inset-0">
                {tabs.map((item, index) => (
                  <Tabs.Trigger key={item.key} ref={(element) => { dockItems.current[index] = element; }} value={item.key}
                    onMouseDown={(event) => event.preventDefault()} onClick={() => goTo(index)}
                    className={cn(railLabelClass, "invisible text-papel")}>
                    {item.label}
                    <PixelArrow className={cn("absolute right-full top-1/2 mr-px -mt-[5px] -scale-x-100 opacity-[var(--arrow-l,0)]", !hinted && "motion-safe:animate-arrow-l")} />
                    <PixelArrow className={cn("absolute left-full top-1/2 ml-px -mt-[5px] opacity-[var(--arrow-r,0)]", !hinted && "motion-safe:animate-arrow-r")} />
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <span ref={frameRef} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[34px] w-28 -translate-x-1/2 translate-y-[calc(-50%-4px)] overflow-hidden pixel pixel-ink-papel bevel-ambar-700 bg-ambar group-has-[[role=tab]:focus-visible]/dock:bg-papel group-has-[[role=tab]:focus-visible]/dock:pixel-ink-ambar group-has-[[role=tab]:focus-visible]/dock:bevel-edge">
                {tabs.map((item, index) => <span key={item.key} ref={(element) => { lensItems.current[index] = element; }} className={cn(railLabelClass, "invisible text-tinta")}>{item.label}</span>)}
              </span>
            </div>
            <div aria-hidden className="flex justify-center gap-1 pt-0.5">
              {tabs.map((item, index) => <span key={item.key} className={cn("h-1", index === active ? "w-[18px] bg-ambar" : "w-1.5 bg-primary")} />)}
            </div>
          </div>
        </Tabs.Root>
      )}
    </section>
  );
}
