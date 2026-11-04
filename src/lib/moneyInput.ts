const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Máscara durante a digitação: dígitos representam centavos, vírgula sempre visível. */
export function formatMoneyInput(raw: string): string | null {
  if (!/^[\d.,]*$/.test(raw)) return null;
  const cents = Number(raw.replace(/\D/g, ""));
  return Number.isSafeInteger(cents) ? moneyFormatter.format(cents / 100) : null;
}

/** Colagem: interpreta reais/centavos e devolve o mesmo formato fixo da máscara. */
export function normalizeMoneyInput(raw: string): string | null {
  const text = raw.trim().replace(/^R\$\s*/, "");
  const normalized = /^\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?$/.test(text)
    ? text.replace(/\./g, "")
    : text.replace(".", ",");
  if (!/^\d*(?:,\d{0,2})?$/.test(normalized)) return null;
  const value = normalized === "," ? 0 : Number(normalized.replace(",", "."));
  return Number.isSafeInteger(Math.round(value * 100))
    ? moneyFormatter.format(value)
    : null;
}
