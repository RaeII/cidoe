import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";

const docLink = "font-semibold underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary";

/**
 * Aceite ativo: caixa nunca pré-marcada. Os links abrem em outra aba para não
 * perder o cadastro em andamento (a prova do e-mail vive só no estado React).
 */
export function TermsConsent({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 text-sm leading-relaxed">
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-px shrink-0"
      />
      <span>
        Tenho 18 anos ou mais, aceito os{" "}
        <a href={TERMS_PATH} target="_blank" rel="noopener" className={docLink}>
          Termos de Uso
        </a>{" "}
        e li a{" "}
        <a href={PRIVACY_PATH} target="_blank" rel="noopener" className={docLink}>
          Política de Privacidade
        </a>
        .
      </span>
    </label>
  );
}
