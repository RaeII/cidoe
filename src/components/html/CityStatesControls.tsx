import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorMark, PixelClose } from "@/components/ui/pixel-icon";
import { toast } from "@/components/ui/toast";
import { deleteCityState, loadCityState, readCityStates, saveCityState, type CityState } from "@/lib/prelaunchCity";
import { PanelSection } from "./controls/PanelSection";

// Sem toast de sucesso: lista e cena já mostram o resultado (e nada aparece na gravação).
function run(action: () => void) {
  try {
    action();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Não foi possível acessar o armazenamento.");
  }
}

/** Estados nomeados da cidade no localStorage: salvar, carregar, excluir. */
export function CityStatesControls() {
  const [name, setName] = useState("");
  // null = JSON inválido; salvar continua lançando e não sobrescreve.
  const [states, setStates] = useState<CityState[] | null>(() => {
    try { return readCityStates(); } catch { return null; }
  });

  const save = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) run(() => setStates(saveCityState(trimmed)));
  };

  return (
    <PanelSection
      title="Estados da cidade"
      description="Edifícios, personalizações e ajustes da cena. Carregar substitui a cidade atual."
    >
      <form onSubmit={save} className="flex items-end gap-2">
        <Input label="Nome" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" disabled={!name.trim()}>Salvar</Button>
      </form>
      {states === null ? (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <ErrorMark />
          Estados salvos inválidos neste navegador.
        </p>
      ) : states.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum estado salvo.</p>
      ) : (
        <ul className="space-y-2">
          {states.map((state) => (
            <li key={state.name} className="pixel bevel-edge flex items-center gap-2 bg-card p-2 pl-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{state.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(state.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  run(() => loadCityState(state));
                  setName(state.name);
                }}
              >
                Carregar
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Excluir"
                aria-label={`Excluir ${state.name}`}
                onClick={() => {
                  if (window.confirm(`Excluir o estado "${state.name}"?`)) {
                    run(() => setStates(deleteCityState(state.name)));
                  }
                }}
              >
                <PixelClose className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}
