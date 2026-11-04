import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { ABOUT_PATH } from "@/lib/seo";

export function PublicPageNav() {
  return (
    <nav aria-label="Páginas do Cidoe" className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm font-semibold">
      {[
        { to: ABOUT_PATH, label: "Sobre" },
        { to: TERMS_PATH, label: "Termos" },
        { to: PRIVACY_PATH, label: "Privacidade" },
      ].map(({ to, label }) => (
        <a key={to} href={to}
          className="inline-flex min-h-11 touch-manipulation items-center text-muted-foreground underline-offset-4 transition-[color,translate] duration-150 hover:text-primary hover:underline active:text-foreground motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-px motion-reduce:transition-none">
          {label}
        </a>
      ))}
    </nav>
  );
}
