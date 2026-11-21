import { useEffect, useState } from "react";
import { ApiError } from "@/api/http";
import { getClubCatalog, type ClubCatalog } from "@/api/club/club.routes";

// Um pedido por carregamento, compartilhado: modal do evento e aba Telão leem o mesmo catálogo.
// Busca só quando um dos dois monta — nada no boot da cidade. Falhou: a próxima montagem tenta de novo.
let loaded: ClubCatalog | null = null;
let pending: Promise<ClubCatalog> | null = null;

function loadClubCatalog() {
  pending ??= getClubCatalog().then(
    (catalog) => (loaded = { ...catalog, clubs: [...catalog.clubs].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) }),
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

/** Catálogo do evento dos times (`isActive` = evento ligado). `catalog` null = carregando ou erro. `enabled` false: não busca. */
export function useClubCatalog(enabled = true) {
  const [state, setState] = useState<{ catalog: ClubCatalog | null; error: string | null }>(() => ({ catalog: loaded, error: null }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadClubCatalog().then(
      (catalog) => { if (alive) setState({ catalog, error: null }); },
      (error: unknown) => {
        if (alive) setState({ catalog: null, error: error instanceof ApiError ? error.message : "Não foi possível carregar os times." });
      },
    );
    return () => { alive = false; };
  }, [attempt, enabled]);
  return {
    ...state,
    retry: () => {
      setState({ catalog: null, error: null });
      setAttempt((value) => value + 1);
    },
  };
}
