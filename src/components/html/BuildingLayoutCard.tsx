import { useState } from "react";
import type { BlockLayoutSettings } from "../../scene/types";
import { Button } from "@/components/ui/button";
import { PixelClose } from "@/components/ui/pixel-icon";

type BuildingLayoutCardProps = {
  settings: BlockLayoutSettings;
  onChange: (settings: BlockLayoutSettings) => void;
  /** Quantos edifícios estão na cena hoje (null = sem limite, mostra todos). */
  visibleLimit: number | null;
  onVisibleLimitChange: (limit: number | null) => void;
  /** Total de doações disponíveis após o filtro. */
  total: number;
  onClose: () => void;
};

const MODES = [
  {
    mode: false,
    label: "Por quadra",
    hint: "Torres agrupadas nos slots centrais de cada quadra, edifícios menores embaralhados no meio delas.",
  },
  {
    mode: true,
    label: "Mais alto no centro",
    hint: "Maior doação no centro exato da cena, altura caindo conforme afasta da origem.",
  },
] as const;

/**
 * Card flutuante de organização dos edifícios: modo de layout + quantos
 * edifícios entram na cena. Fica fora do painel de controle porque são os
 * dois botões que mais se mexe ao compor a cidade.
 */
export function BuildingLayoutCard({
  settings,
  onChange,
  visibleLimit,
  onVisibleLimitChange,
  total,
  onClose,
}: BuildingLayoutCardProps) {
  const [limitInput, setLimitInput] = useState(visibleLimit?.toString() ?? "");

  // Rebuild da cena trava a UI por até ~0,5s com 100k — só commita no
  // aplicar/Enter, nunca a cada tecla digitada.
  const applyLimit = () => {
    const parsed = parseInt(limitInput, 10);
    onVisibleLimitChange(isNaN(parsed) || parsed <= 0 ? null : parsed);
  };

  const shown = visibleLimit === null ? total : Math.min(visibleLimit, total);

  return (
    <div className="pixel bevel-edge absolute left-4 bottom-24 z-30 w-64 bg-background p-3 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="mono-label text-foreground">
          Organização dos edifícios
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="-mr-1.5"
          title="Remover card da tela"
          aria-label="Remover card da tela"
        >
          <PixelClose className="size-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MODES.map(({ mode, label, hint }) => (
          <button
            key={label}
            onClick={() => onChange({ ...settings, centerTallest: mode })}
            title={hint}
            className={`pixel pixel-thin px-2 py-2 text-xs font-semibold transition-colors ${
              settings.centerTallest === mode
                ? "pixel-ink-verde bg-secondary text-secondary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <label className="mono-label text-foreground">
          edifícios na tela
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="number"
            min={1}
            step={1}
            value={limitInput}
            placeholder="todos"
            onChange={(e) => setLimitInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyLimit()}
            className="field h-8 min-w-0 flex-1 px-2 text-center text-sm outline-none"
          />
          <Button size="sm" onClick={applyLimit}>
            aplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLimitInput("");
              onVisibleLimitChange(null);
            }}
            title="Mostrar todas as doações do filtro"
          >
            tudo
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {shown.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} doações — as de maior
          valor primeiro.
        </p>
      </div>
    </div>
  );
}
