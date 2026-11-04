/** Aviso fixo do pré-lançamento no rodapé dos modais de contribuição e personalização. */
export function SimulationNotice() {
  return (
    <p role="note" className="flex shrink-0 items-start gap-2 bg-ambar px-5 py-1.5 text-xs font-semibold leading-4 text-tinta sm:px-8 lg:px-10">
      <span aria-hidden="true" className="font-mono">!</span>
      Contribuições de teste: nada é cobrado e os edifícios ficam salvos só neste navegador.
    </p>
  );
}
