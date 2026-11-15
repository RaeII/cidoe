import { OPEN_DIALOG } from "./exitIntent";

/** Coberto pela linha `cidoe:prelaunch:…` da Política de Privacidade. */
const SEEN_KEY = "cidoe:prelaunch:status-seen";
/** Google penaliza no celular janela que cobre a página logo ao entrar: espera 20 s com a cidade pronta. */
export const PROJECT_STATUS_DELAY_MS = 20_000;

function seen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markProjectStatusSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage bloqueado/cheio: aviso volta na próxima visita */
  }
}

/**
 * Aviso de pré-lançamento: `onDue` 20 s depois da chamada. Outro diálogo aberto (login, contribuição,
 * menu, saída…) → confere de novo a cada 1 s; nunca empilha. Navegador que já viu não agenda nada.
 * Devolve a limpeza.
 */
export function scheduleProjectStatus(onDue: () => void): () => void {
  if (seen()) return () => {};
  let timer = setTimeout(function due() {
    if (document.querySelector(OPEN_DIALOG)) timer = setTimeout(due, 1000);
    else onDue();
  }, PROJECT_STATUS_DELAY_MS);
  return () => clearTimeout(timer);
}
