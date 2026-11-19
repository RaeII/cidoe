import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { ErrorMark, LOGO_PATHS } from "@/components/ui/pixel-icon";
import { cn } from "@/lib/utils";

const css = (style: Record<string, string | number>) => style as CSSProperties;
const OUT = "cubic-bezier(.22,1,.36,1)";
const BLOCKS = Array.from({ length: 10 }, (_, i) => i);
const MESSAGES = [
  [10, "Tudo pronto!"],
  [8, "Chamando os bichos…"],
  [6, "Acendendo as janelas…"],
  [3, "Erguendo os edifícios…"],
  [0, "Preparando o terreno…"],
] as const;

/** Skyline do design, na ordem em que sobe: [x, largura, topo do corpo, 0 liso | 1 caixa | 2 caixa + antena,
 *  janelas acesas (coluna·10 + linha)]. Os 3 primeiros sobem na entrada; depois, 2 por bloco da barra. */
const SKYLINE: [number, number, number, number, number[]][] = [
  [738, 60, 87, 0, [34, 6, 42]], [815, 36, 102, 0, [3]], [874, 36, 56, 2, [3, 10]], [539, 36, 98, 0, [4, 15]],
  [1002, 54, 58, 0, [25]], [265, 54, 73, 1, [33, 21]], [209, 42, 122, 2, [13, 1, 2]], [1278, 60, 88, 1, [42, 25, 5]],
  [10, 48, 107, 1, [4, 21, 11]], [400, 36, 111, 0, [1, 2]], [1366, 54, 83, 1, [21, 35]], [1509, 60, 73, 0, [11, 42]],
  [1446, 48, 117, 0, [3]], [455, 60, 119, 1, [33]], [588, 60, 109, 1, [34, 33]], [1155, 48, 88, 0, [26, 11]],
  [924, 60, 119, 0, [0]], [333, 42, 115, 0, [22, 12]], [669, 54, 108, 2, [24]], [133, 48, 119, 1, [0, 3, 10]],
  [82, 36, 117, 0, [0, 3]], [1081, 48, 67, 0, [6]], [1222, 42, 95, 0, [23, 3]],
];
const INTRO = 3;
const PER_BLOCK = (SKYLINE.length - INTRO) / BLOCKS.length;

/** Corpo + cornija (+ caixa, + antena) e, por cima, sombra da cornija, faixa e grade de janelas. Chão em y = 172.
 *  Tempos determinísticos (o HTML pré-renderizado precisa bater com a hidratação). */
const BUILDINGS = SKYLINE.map(([x, w, y, cap, lit], o) => {
  let body = `M${x} ${y}h${w}v${172 - y}h-${w}zM${x - 3} ${y - 6}h${w + 6}v6h-${w + 6}z`;
  if (cap) body += `M${x + w / 3} ${y - 11}h${w / 3}v5h-${w / 3}z`;
  if (cap > 1) body += `M${x + w / 2 - 1} ${y - 17}h2v6h-2z`;
  let detail = `M${x - 3} ${y - 2}h${w + 6}v2h-${w + 6}zM${x + 8} ${y}h2v${172 - y}h-2z`;
  for (let c = 15; c + 9 <= w; c += 9) for (let r = y + 6; r <= 161; r += 11) detail += `M${x + c} ${r}h4v6h-4z`;
  const delay = o < INTRO ? (30 + o * 14) / 100 : ((o - INTRO) % PER_BLOCK) * 0.12;
  const windows = lit.map((cell, j) => {
    const on = Math.round((delay + 0.62 + j * 0.14 + ((o * 7 + j * 3) % 10) / 100) * 100) / 100;
    return { x: x + 15 + 9 * Math.floor(cell / 10), y: y + 6 + 11 * (cell % 10), on, period: 3.3 + ((o * 5 + j * 3) % 5), blink: on + 2 + ((o + j) % 4) };
  });
  return { x, from: 174 - (y - [6, 11, 17][cap]), delay, body, detail, windows };
});

/** Faíscas do "tudo pronto": leque para cima a partir do telhado. */
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const angle = ((-165 + (150 / 7) * i) * Math.PI) / 180, r = 26 + ((i * 7) % 20);
  return { fill: i % 3 === 1 ? "var(--color-ambar-700)" : "var(--color-ambar)", to: `${(Math.cos(angle) * r).toFixed(1)}px ${(Math.sin(angle) * r).toFixed(1)}px` };
});

/** Início da entrada (relógio do documento). A tela monta 3 vezes (HTML pré-renderizado → casca → editor):
 *  a 1ª marca, as outras alinham as animações CSS a ela — a entrada continua de onde estava. */
let introStart: number | undefined;

type Exit = { size: number; tiles: { x: number; y: number; delay: number; last: boolean }[] } | null;

/** Papel se desfaz em blocos a partir da logo. null = movimento reduzido ou sem tamanho → fade. */
function shatter(root: HTMLElement, stack: HTMLElement): Exit {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const rr = root.getBoundingClientRect(), sr = stack.getBoundingClientRect();
  if (!rr.width || !rr.height) return null;
  const size = Math.max(56, Math.min(96, Math.round(Math.min(rr.width, rr.height) / 9)));
  const cx = sr.left - rr.left + sr.width / 2, cy = sr.top - rr.top + sr.height / 3;
  const cells: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < rr.height; y += size) for (let x = 0; x < rr.width; x += size) cells.push({ x, y, d: Math.hypot(x + size / 2 - cx, y + size / 2 - cy) / size });
  const k = Math.min(0.04, 0.6 / Math.max(1, ...cells.map((c) => c.d)));
  const tiles = cells.map(({ x, y, d }) => ({ x, y, delay: 0.22 + d * k + Math.random() * 0.03, last: false }));
  tiles.reduce((a, b) => (b.delay > a.delay ? b : a)).last = true;
  return { size, tiles };
}

/**
 * Página de loading da cena (design LoadingInicial): logo se monta, nome letra a letra, cidade sobe do chão
 * conforme a barra em blocos enche; no fim, onda âmbar, faíscas, gato comemora e o papel se desfaz em blocos.
 * Entrada em CSS (`ld-*` em index.css): roda no HTML pré-renderizado, antes do JS. `progress` 0–100 vem do editor;
 * a barra aparece com a entrada (.9 s) e segue o progresso real (até 250 %/s). 100 → fim (.45 s) → sai → desmonta.
 */
export function InitialLoading({ progress, error, onRetry }: { progress: number; error?: string; onRetry?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const clip = useId();
  const [filled, setFilled] = useState(0);
  const [phase, setPhase] = useState<"load" | "finish" | "exit">("load");
  const [exit, setExit] = useState<Exit>(null);
  const [gone, setGone] = useState(false);
  const target = useEffectEvent(() => progress);

  useLayoutEffect(() => {
    const animations = rootRef.current!.getAnimations?.({ subtree: true }) ?? [];
    if (introStart === undefined) introStart = Number(animations[0]?.startTime ?? document.timeline.currentTime);
    else for (const animation of animations) animation.startTime = introStart;
  }, []);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = 0, last = 0, frame = 0;
    const tick = (now: number) => {
      const goal = target();
      if (reduce) shown = Math.max(shown, goal);
      // Barra começa quando aparece (entrada em .92 s) e acompanha o progresso real:
      // 250 %/s só suaviza os saltos, não segura a cidade pronta atrás do papel.
      else if (now - introStart! > 900) shown = Math.max(shown, Math.min(goal, shown + (last ? now - last : 0) * 0.25));
      last = now;
      const pct = `${String(Math.round(shown)).padStart(3, "0")}%`;
      if (pctRef.current && pctRef.current.textContent !== pct) pctRef.current.textContent = pct;
      setFilled(Math.floor(shown / 10));
      if (shown >= 100) setPhase("finish");
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (phase !== "finish") return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Pausa só pro pulo do gato (.44 s); faíscas e onda terminam durante a saída.
    const timer = setTimeout(() => {
      setExit(shatter(rootRef.current!, stackRef.current!));
      setPhase("exit");
    }, reduce ? 200 : 450);
    return () => clearTimeout(timer);
  }, [phase]);

  if (gone) return null;
  const done = phase !== "load";
  const message = MESSAGES.find(([n]) => filled >= n)![1];
  const skyHeight = "clamp(120px,24vh,210px)";

  return (
    <div
      ref={rootRef}
      onAnimationEnd={(event) => event.target instanceof HTMLElement && event.target.dataset.last && setGone(true)}
      onTransitionEnd={(event) => event.target === event.currentTarget && setGone(true)}
      className={cn(
        "ld absolute inset-0 z-40 overflow-hidden text-foreground",
        !exit && "bg-background pattern-paws",
        phase === "exit" && "pointer-events-none",
        phase === "exit" && !exit && "opacity-0 transition-opacity duration-300",
      )}
    >
      {exit && (
        <div aria-hidden="true" className="absolute inset-0">
          {exit.tiles.map(({ x, y, delay, last }) => (
            <div
              key={`${x}-${y}`}
              data-last={last || undefined}
              className="absolute bg-background pattern-paws"
              style={{ left: x, top: y, width: exit.size + 1, height: exit.size + 1, backgroundPosition: `${-x}px ${-y}px`, animation: `ld-tile .24s steps(3) ${delay}s both` }}
            />
          ))}
        </div>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={css({ height: skyHeight, ...(phase === "exit" && { "--to": "24px", animation: "ld-out .3s cubic-bezier(.4,0,1,1) both" }) })}
      >
        <svg viewBox="0 0 1600 180" preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges" className="absolute inset-0 block size-full">
          {BUILDINGS.map(({ x, from, delay, body, detail, windows }, o) => (
            <g key={x} className="ld-bld" data-up={o < INTRO + Math.round(filled * PER_BLOCK) || undefined} style={css({ "--from": `${from}px`, "--d": `${delay}s` })}>
              <path fill="#C9D5C0" d={body} />
              <path fill="#BBC8B2" d={detail} />
              {windows.map((w) => (
                <rect key={`${w.x}-${w.y}`} className="ld-win" x={w.x} y={w.y} width={4} height={6} fill="var(--color-ambar)" style={css({ "--on": `${w.on}s`, "--p": `${w.period}s`, "--b": `${w.blink}s` })} />
              ))}
            </g>
          ))}
          <rect x="-10" y="172" width="1620" height="12" fill="var(--color-verde-700)" />
        </svg>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-6 pt-8" style={{ paddingBottom: `calc(${skyHeight} + 12px)` }}>
        <div
          ref={stackRef}
          className="flex flex-col items-center text-center"
          style={css(phase === "exit" ? { "--to": "-8px", "--scale": 0.96, animation: "ld-out .3s cubic-bezier(.4,0,1,1) both" } : {})}
        >
          {/* Metades sobem do chão (clip), cachorro se encaixa com mola, gato chega por baixo e pula pro telhado. */}
          <svg viewBox="266 162 742 958" aria-hidden="true" className="block h-[clamp(96px,15vh,140px)] w-auto overflow-visible">
            <defs>
              <clipPath id={clip}>
                <rect x="150" y="-300" width="1000" height="1418" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clip})`} fill="var(--color-primary)">
              <path d={LOGO_PATHS.left} style={css({ "--from": "1000px", animation: "ld-rise .75s cubic-bezier(.16,1,.3,1) .12s both" })} />
              <path d={LOGO_PATHS.right} style={css({ "--from": "1000px", animation: "ld-rise .75s cubic-bezier(.16,1,.3,1) .19s both" })} />
              <path d={LOGO_PATHS.dog} style={{ animation: "ld-dog 1.1s ease-in-out .62s both" }} />
            </g>
            <g fill="var(--color-primary)" style={{ animation: "ld-cat-x .72s linear .86s both, ld-fade .12s linear .86s both" }}>
              <g className="origin-center [transform-box:fill-box]" style={{ animation: "ld-cat-y .72s ease-out .86s both, ld-cat-tilt .72s ease-in-out .86s both" }}>
                <g style={{ animation: done ? "ld-cheer .44s ease-out both" : "ld-hop 3.02s ease-out 2.98s infinite" }}>
                  <path d={LOGO_PATHS.cat} className="origin-bottom [transform-box:fill-box]" style={{ animation: "ld-squash 1.04s ease-out .86s both" }} />
                </g>
              </g>
            </g>
            <g transform="translate(690 300) scale(6)">
              {SPARKS.map(({ fill, to }) => (
                <path key={to} fill={fill} d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={css({ opacity: 0, "--to": to, ...(done && { animation: "ld-spark .8s ease-out .08s both" }) })} />
              ))}
            </g>
          </svg>

          <p className="mt-5 text-[length:clamp(32px,5.2vw,42px)] leading-none font-extrabold tracking-[-0.02em]">
            <span className="sr-only">Cidoe</span>
            <span aria-hidden="true">
              {[..."Cidoe"].map((letter, i) => (
                <span key={i} className="inline-block" style={css({ "--from": "18px", animation: `ld-in .55s ${OUT} ${0.42 + i * 0.045}s both` })}>
                  {letter}
                </span>
              ))}
            </span>
          </p>
          <p className="mt-2.5 font-mono text-xs tracking-[.04em] text-verde-700" style={css({ "--from": "8px", animation: `ld-in .5s ${OUT} .78s both` })}>
            Cada doação ergue um edifício.
          </p>

          <div className="mt-9 flex w-[min(300px,78vw)] flex-col gap-3" style={css({ "--from": "10px", animation: `ld-in .5s ${OUT} .92s both` })}>
            <div role="progressbar" aria-label="Carregando o Cidoe" aria-valuemin={0} aria-valuemax={100} aria-valuenow={filled * 10} className="m-[3px] flex gap-[3px] bg-card p-1 pixel">
              {BLOCKS.map((i) => {
                const next = i === filled && !error;
                return (
                  <span
                    key={i}
                    className={cn("h-3.5 flex-1", i < filled ? "bg-primary" : next ? "bg-ambar" : "bg-muted")}
                    style={done ? { animation: `ld-wave .5s linear ${i * 0.035}s both` } : next ? { animation: "ld-next .9s step-end infinite" } : undefined}
                  />
                );
              })}
            </div>
            {error ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <ErrorMark className="size-6 text-xs" />
                  Falha ao carregar as doações
                </div>
                <div className="text-xs text-muted-foreground">{error}</div>
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="flex items-baseline justify-between gap-3 px-[3px]">
                <span aria-live="polite" className="block overflow-hidden text-left">
                  <span key={message} className="inline-block text-sm leading-[1.4] font-semibold text-muted-foreground" style={css({ "--from": "8px", animation: `ld-in .26s ${OUT} both` })}>
                    {message}
                  </span>
                </span>
                <span ref={pctRef} aria-hidden="true" className="flex-none font-mono text-xs font-medium tracking-[.04em] text-primary">
                  000%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
