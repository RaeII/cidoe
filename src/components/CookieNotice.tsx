import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { COOKIE_PREFERENCES_EVENT, getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics";
import { PRIVACY_PATH } from "@/lib/legal";

export function CookieNotice() {
  const [dismissed, setDismissed] = useState(() => getAnalyticsConsent() !== null);

  useEffect(() => {
    const reopen = () => setDismissed(false);
    window.addEventListener(COOKIE_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_PREFERENCES_EVENT, reopen);
  }, []);

  function choose(consent: "granted" | "denied") {
    setAnalyticsConsent(consent);
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <section
      aria-label="Cookies"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-40 flex flex-col items-start gap-4 pixel bevel-edge bg-card p-5 text-card-foreground md:bottom-6 md:left-auto md:max-w-md"
    >
      <p className="text-sm leading-relaxed">
        Usamos cookies essenciais para o site funcionar. Se você aceitar, também usamos o Google Analytics para medir
        o uso do site. Saiba mais na{" "}
        <a
          href={`${PRIVACY_PATH}#cookies`}
          target="_blank"
          rel="noopener"
          className="font-semibold underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary"
        >
          Política de Privacidade
        </a>
        .
      </p>
      <div className="flex gap-3">
        <Button type="button" size="sm" variant="outline" onClick={() => choose("denied")}>Recusar</Button>
        <Button type="button" size="sm" onClick={() => choose("granted")}>Aceitar</Button>
      </div>
    </section>
  );
}
