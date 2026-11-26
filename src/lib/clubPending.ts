/**
 * Time que o visitante confirmou no evento antes de entrar: fica no navegador até um login resgatar.
 * Coberto pela linha `cidoe:club-pending` da Política de Privacidade. Fora dos chunks lazy (o
 * AuthMenu lê no boot), por isso não mora em `lib/clubs.ts`.
 */
const KEY = "cidoe:club-pending";
/** Falha de rede ou evento desligado mantêm a escolha; passado isso, some (logado deixa de abrir o modal a cada visita). */
export const PENDING_CLUB_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function readPendingClub(now = Date.now()): string | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object" && "club" in saved && "at" in saved
      && typeof saved.club === "string" && typeof saved.at === "number" && now - saved.at < PENDING_CLUB_TTL_MS) return saved.club;
    if (saved !== null) localStorage.removeItem(KEY);
  } catch {
    /* storage bloqueado ou valor corrompido: sem escolha guardada */
  }
  return null;
}

export function savePendingClub(club: string, now = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ club, at: now }));
  } catch {
    /* storage bloqueado/cheio: escolha vale só enquanto o modal estiver aberto */
  }
}

export function clearPendingClub() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage bloqueado: nada guardado */
  }
}
