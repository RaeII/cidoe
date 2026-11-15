/** Diálogo Radix aberto (login, contribuição, menu…). Card de edifício não conta: sem `data-state`. */
export const OPEN_DIALOG ='[role="dialog"][data-state="open"]';

/** Modal apareceu neste carregamento → cadastro grava `user.signup_after_exit_prompt` (relatório). */
export let exitPromptShown = false;

/** Dispositivo já teve sessão (cadastro ou login): sair da conta não traz o modal de volta. */
const ACCOUNT_KEY = "cidoe:has-account";

export function rememberAccount() {
  try {
    localStorage.setItem(ACCOUNT_KEY, "1");
  } catch {
    /* storage bloqueado/cheio: modal segue aparecendo depois do logout */
  }
}

function deviceHasAccount() {
  try {
    return localStorage.getItem(ACCOUNT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Saída de visitante sem conta. Navegador não deixa segurar a aba com modal próprio, então:
 * - fechar aba/janela, recarregar, outra URL, Ctrl/Cmd+W → `beforeunload`: diálogo NATIVO, texto do
 *   navegador. Só aparece se a pessoa já clicou/tocou na página; mobile quase nunca mostra, iOS ignora.
 * - desktop, ponteiro sai pelo topo (abas, fechar, endereço) → `onExit` antes de sair.
 * - trocar de aba/app, minimizar, home, bloquear tela (desktop e mobile) → `visibilitychange`.
 *   Sair não dá pra impedir: `onExit` roda na volta.
 * Fora de propósito: botão voltar (prender histórico = spam no Google desde 15/06/2026, Chrome pula a
 * entrada), `blur` (dispara no iframe do login Google), `unload` (obsoleto).
 * `onExit` a cada tentativa, nunca sobre diálogo aberto (nem o próprio modal). Dispositivo com conta
 * (`rememberAccount`) não observa nada, nem `beforeunload`. Devolve a limpeza.
 */
export function watchExitIntent(onExit: () => void): () => void {
  if (deviceHasAccount()) return () => {};
  let left = false;
  let linkClickAt = -Infinity;

  const ask = () => {
    if (document.querySelector(OPEN_DIALOG)) return;
    exitPromptShown = true;
    onExit();
  };
  const onMouseOut = (event: MouseEvent) => {
    if (!event.relatedTarget && event.clientY <= 0) ask();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") left = true;
    else if (left) ask();
  };
  // Sobre/Termos/Privacidade são <a href> que recarregam: navegar dentro do site não pergunta.
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (link?.origin === location.origin) linkClickAt = event.timeStamp;
  };
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    // ponytail: janela de 1 s após clique em link interno; links internos via router dispensam isso.
    if (event.timeStamp - linkClickAt < 1000) return;
    event.preventDefault();
    event.returnValue = true; // Chrome/Edge < 119
  };

  document.addEventListener("mouseout", onMouseOut);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("click", onClick);
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => {
    document.removeEventListener("mouseout", onMouseOut);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("click", onClick);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
