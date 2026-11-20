import { useEffect, useSyncExternalStore } from "react";
import { ApiError } from "@/api/http";
import { chooseClub, getMyClub, type MyClub } from "@/api/club/club.routes";

type ClubState = { userId: number; data: MyClub | null; error: string | null };

// Um pedido por conta e carregamento, compartilhado: modal do evento e aba Telão leem o mesmo
// estado, e a escolha no modal já aparece no telão aberto. Busca só quando um dos dois monta —
// nada no boot da cidade.
let state: ClubState | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const update = (next: ClubState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

function fetchClub(userId: number) {
  getMyClub().then(
    (data) => { if (state?.userId === userId) update({ userId, data, error: null }); },
    (error: unknown) => {
      if (state?.userId === userId) update({ ...state, error: error instanceof ApiError ? error.message : "Não foi possível carregar seu time." });
    },
  );
}

function load(userId: number) {
  update({ userId, data: null, error: null });
  fetchClub(userId);
}

/** Time da conta logada; `userId` ausente (visitante) = sem time. */
export function useMyClub(userId: number | undefined) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => null);
  useEffect(() => {
    // Falhou antes: tenta de novo na próxima montagem.
    if (userId !== undefined && (state?.userId !== userId || state.error)) load(userId);
  }, [userId]);
  const own = userId !== undefined && snapshot?.userId === userId ? snapshot : null;

  return {
    club: own?.data?.club ?? null,
    canChange: own?.data?.canChange ?? false,
    ready: own?.data != null,
    error: own?.data ? null : own?.error ?? null,
    retry: () => { if (userId !== undefined) load(userId); },
    /** Lança o erro da API para o modal mostrar. 409 (troca usada em outra aba) relê o estado. */
    async choose(club: string) {
      if (userId === undefined) return;
      try {
        const data = await chooseClub(club);
        if (state?.userId === userId) update({ userId, data, error: null });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) fetchClub(userId);
        throw error;
      }
    },
  };
}
