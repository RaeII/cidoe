import { ChevronLeft, ChevronRight, Eye, Paintbrush } from "lucide-react";
import { formatBRL } from "@/lib/unlock";
import { Button } from "@/components/ui/button";
import { PixelClose } from "@/components/ui/pixel-icon";

export function MyBuildingsNavigation({
  value,
  place,
  index,
  count,
  onPrevious,
  onNext,
  onCustomize,
  onDetails,
  onClose,
}: {
  value?: number;
  place?: string;
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onCustomize: () => void;
  onDetails: () => void;
  onClose: () => void;
}) {
  return (
    <nav
      aria-label="Meus edifícios na cidade"
      className="pointer-events-none absolute inset-0 z-30 text-foreground [text-shadow:0_1px_3px_var(--background)]"
    >
      <div className="pointer-events-auto absolute top-4 left-4 max-h-[calc(50%-3rem)] max-w-[calc(100%-5.5rem)] overflow-y-auto rounded-[14px] border border-border bg-background px-3 py-2 text-left [text-shadow:none] sm:max-w-72 md:left-1/4" aria-live="polite" aria-atomic="true">
        {value !== undefined ? <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="text-[11px] leading-4 text-muted-foreground">Edifício {index + 1} de {count}</p>
            <p className="text-sm leading-5 font-semibold tabular-nums break-words sm:text-base">{formatBRL(value)}</p>
          </div>
          {place && <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground sm:text-xs">{place}</p>}
        </> : <p role="status" className="text-sm">Localizando edifício…</p>}
      </div>
      <Button type="button" variant="ghost" size="icon-lg" className="pointer-events-auto absolute top-3 right-3 hover:bg-transparent" autoFocus onClick={onClose} aria-label="Sair dos meus edifícios">
        <PixelClose className="size-4" />
      </Button>
      <Button type="button" variant="outline" size="icon-lg" className="pointer-events-auto absolute top-1/2 left-4 -mt-6 md:left-1/4" disabled={count < 2 || value === undefined} onClick={onPrevious} aria-label="Edifício anterior">
        <ChevronLeft className="size-6" />
      </Button>
      <Button type="button" variant="outline" size="icon-lg" className="pointer-events-auto absolute top-1/2 right-4 -mt-6 md:right-1/4" disabled={count < 2 || value === undefined} onClick={onNext} aria-label="Próximo edifício">
        <ChevronRight className="size-6" />
      </Button>
      <div className="absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center gap-4 sm:bottom-6 sm:gap-8">
        <Button type="button" size="lg" className="pointer-events-auto has-[>svg]:px-3 max-sm:text-sm" disabled={value === undefined} onClick={onCustomize}>
          <Paintbrush />Personalizar
        </Button>
        <Button type="button" variant="outline" size="lg" className="pointer-events-auto has-[>svg]:px-3 max-sm:text-sm" disabled={value === undefined} onClick={onDetails} aria-label="Ver como visitante">
          <Eye />
          <span className="flex flex-col items-start gap-0.5 leading-none">Ver como<span className="text-xs">visitante</span></span>
        </Button>
      </div>
    </nav>
  );
}
