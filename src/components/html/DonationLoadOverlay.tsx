import type { DonationsLoadState } from "../hooks/useDonations";
import { BlockBar } from "@/components/ui/block-bar";
import { Button } from "@/components/ui/button";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";

const formatMB = (bytes: number) => (bytes / 1_048_576).toFixed(1);

/**
 * Card de carregamento dos rebuilds (filtro), depois do boot: fundo pointer-events-none, cena
 * orbitável atrás; só o card captura clique (retry). Loading inicial: `InitialLoading`.
 */
export function DonationLoadOverlay({ state, onRetry }: { state: DonationsLoadState; onRetry: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div className="pixel bevel-edge pointer-events-auto w-[min(22rem,calc(100vw-2rem))] bg-background px-6 pt-5 pb-6 text-foreground">
        {state.status === "error" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <ErrorMark className="size-6 text-xs" />
              Falha ao carregar as doações
            </div>
            <div className="text-xs text-muted-foreground">{state.message}</div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            {!(state.status === "loading" && state.totalBytes) && (
              <BlockLoader className="gap-1 text-primary [&>span]:size-2.5" />
            )}
            {state.status === "loading" ? (
              <>
                <div className="text-sm">Carregando doações…</div>
                {state.totalBytes ? (
                  <div className="w-full">
                    <BlockBar
                      value={state.loadedBytes}
                      max={state.totalBytes}
                      label="Carregando doações"
                    />
                    <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                      {formatMB(state.loadedBytes)} / {formatMB(state.totalBytes)} MB
                    </div>
                  </div>
                ) : (
                  <div className="font-mono text-[11px] text-muted-foreground">{formatMB(state.loadedBytes)} MB</div>
                )}
              </>
            ) : (
              <div className="text-sm">Montando cidade…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
