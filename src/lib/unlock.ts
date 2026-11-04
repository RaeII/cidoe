/**
 * Requisito de liberação do passe de conquistas — formatação em UM lugar só.
 *
 * A regra de produto mais fácil de quebrar é "nunca mostre o eixo que não é
 * exigido": ninguém pode ler "R$ 30 de doação e 0 indicações". Se cada tela
 * montasse a frase sozinha, uma delas ia esquecer. Admin e cena importam daqui.
 */

/** `null` = grátis. Eixo `null` = não exige. Zero não existe (o backend recusa). */
export type UnlockRule = {
  donationMin: number | null;
  referralMin: number | null;
  /** Ausente = regra antiga: exige todos os eixos configurados. */
  mode?: "all" | "any";
} | null;

/** Progresso do usuário, de GET /customization/me. */
export type UnlockProgress = {
  donated: number;
  referrals: number;
};

/** R$ 50 (inteiro) · R$ 49,90 (com centavos). Centavo zero não polui o badge. */
export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Aceita as duas formas digitadas: "50,90" (vírgula, pt-BR) e "50.90".
 * A vírgula decide: com ela, ponto é separador de milhar. Devolve null para
 * qualquer coisa que não seja um valor positivo (vazio, zero, texto).
 */
export function parseMoney(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function formatReferrals(count: number): string {
  return `${count} ${count === 1 ? "indicação" : "indicações"}`;
}

/**
 * Junta só os pedaços exigidos. É a função que faz a regra valer: o que é
 * `null` nunca chega na lista, então nunca chega na tela.
 */
function parts(rule: NonNullable<UnlockRule>): string[] {
  const out: string[] = [];
  if (rule.donationMin != null) out.push(formatBRL(rule.donationMin));
  if (rule.referralMin != null) out.push(formatReferrals(rule.referralMin));
  return out;
}

/** Badge curto: `Grátis` · `R$ 50` · `3 indicações` · `R$ 50 + 3 indicações`. */
export function formatUnlockRequirement(rule: UnlockRule): string {
  if (!rule) return "Grátis";
  const list = parts(rule);
  // Regra "vazia" não deveria existir (o backend serializa grátis como null),
  // mas se vier, tratar como grátis é melhor que renderizar string vazia.
  return list.length ? list.join(rule.mode === "any" ? " ou " : " + ") : "Grátis";
}

/** Frase para o usuário final: "Doe R$ 50 e faça 3 indicações para liberar". */
export function formatUnlockCta(rule: UnlockRule): string {
  if (!rule) return "Disponível para todos";
  const actions: string[] = [];
  if (rule.donationMin != null) actions.push(`doe ${formatBRL(rule.donationMin)}`);
  if (rule.referralMin != null) actions.push(`faça ${formatReferrals(rule.referralMin)}`);
  if (!actions.length) return "Disponível para todos";
  const sentence = actions.join(rule.mode === "any" ? " ou " : " e ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)} para liberar`;
}

export function meetsUnlock(rule: UnlockRule, progress: UnlockProgress): boolean {
  if (!rule) return true;
  if (rule.mode === "any") {
    return (
      (rule.donationMin != null && progress.donated >= rule.donationMin) ||
      (rule.referralMin != null && progress.referrals >= rule.referralMin)
    );
  }
  return (
    progress.donated >= (rule.donationMin ?? 0) &&
    progress.referrals >= (rule.referralMin ?? 0)
  );
}

/** Conquista permanente (passe ou presente) dispensa os requisitos atuais. */
export function canUseCustomization(
  rule: UnlockRule, progress: UnlockProgress | null, granted: boolean, isAdmin = false,
): boolean {
  return isAdmin || granted || !rule || (progress !== null && meetsUnlock(rule, progress));
}

/**
 * O que ainda falta. `null` quando já bate — o chamador usa isso para decidir
 * entre "conquistado" e "faltam X". Eixo já cumprido some da frase pelo mesmo
 * motivo que o eixo não exigido: só o que falta é informação.
 */
export function formatUnlockRemaining(
  rule: UnlockRule,
  progress: UnlockProgress,
): string | null {
  if (meetsUnlock(rule, progress)) return null;
  const missing: string[] = [];
  if (rule?.donationMin != null && progress.donated < rule.donationMin) {
    missing.push(formatBRL(rule.donationMin - progress.donated));
  }
  if (rule?.referralMin != null && progress.referrals < rule.referralMin) {
    missing.push(formatReferrals(rule.referralMin - progress.referrals));
  }
  return missing.length ? `Faltam ${missing.join(rule?.mode === "any" ? " ou " : " e ")}` : null;
}
