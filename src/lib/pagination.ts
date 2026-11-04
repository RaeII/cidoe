/**
 * Janela de páginas para a barra de paginação: 1, a atual ± 1 e a última.
 * Os buracos viram reticências — buraco de uma página só mostra o número, que
 * é mais curto que as reticências que o esconderiam.
 */
export function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const keep = [1, page - 1, page, page + 1, totalPages].filter(
    (n) => n >= 1 && n <= totalPages,
  );
  const pages = [...new Set(keep)].sort((a, b) => a - b);
  return pages.flatMap((n, i) => (i > 0 && n - pages[i - 1] > 1 ? ["…" as const, n] : [n]));
}
