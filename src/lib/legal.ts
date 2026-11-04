/**
 * Termos de Uso + Política de Privacidade: versão única para os dois.
 * O aceite acontece somente no cadastro; entrar não exige novo aceite.
 * O backend guarda a versão aceita em `user.terms_version` (migration 0021).
 */

/**
 * Edição do texto: `prelaunch` (branch beta) ou `launch` (branch main). O texto é o
 * definitivo nas duas; `prelaunch` só acrescenta os avisos de pré-lançamento. Única
 * linha que muda entre as branches — merge main → beta mantém a da beta.
 */
export const LEGAL_EDITION = "prelaunch" as "prelaunch" | "launch";
export const IS_PRELAUNCH = LEGAL_EDITION === "prelaunch";

export const LEGAL_DATE = "2026-10-25";
export const LEGAL_UPDATED_AT = "25 de outubro de 2026";
/** Versão aceita (vai ao back). Edição faz parte dela: trocar beta → main pede reaceite. */
export const LEGAL_VERSION = IS_PRELAUNCH ? `${LEGAL_DATE}-beta` : LEGAL_DATE;

/** Controlador dos dados (LGPD art. 5 VI e art. 9 III). Pessoa física: sem documento na página. */
export const LEGAL_CONTROLLER = "Israel Zeferino";
export const LEGAL_EMAIL = "contato@cidoe.com.br";

export const TERMS_PATH = "/termos";
export const PRIVACY_PATH = "/privacidade";
