import { readProjectStorage } from "./projectStorage";

const MEASUREMENT_ID = "G-GEHP0ENSCR";
const STORAGE_KEY = "cidoe:analytics-consent";
export const COOKIE_PREFERENCES_EVENT = "cidoe:cookie-preferences";

type AnalyticsConsent = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
    "ga-disable-G-GEHP0ENSCR"?: boolean;
  }
}

let initialized = false;

export function getAnalyticsConsent(): AnalyticsConsent | null {
  try {
    const value = readProjectStorage(localStorage, STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

function applyAnalyticsConsent(consent: AnalyticsConsent | null) {
  if (!import.meta.env.PROD) return;

  window["ga-disable-G-GEHP0ENSCR"] = consent !== "granted";
  if (!initialized && consent !== "granted") return;

  if (!initialized) {
    const dataLayer = window.dataLayer = window.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params -- Mantém o formato oficial da fila do gtag.js.
    window.gtag = function () { dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }

  window.gtag!("consent", "update", { analytics_storage: consent });
  if (initialized) return;

  window.gtag!("js", new Date());
  window.gtag!("config", MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // Código de indicação (?ref=) identifica quem indicou: não vai ao Analytics.
    page_location: stripReferral(location.href),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
  initialized = true;
}

function stripReferral(href: string) {
  const url = new URL(href);
  url.searchParams.delete("ref");
  return url.href;
}

export function initializeAnalytics() {
  applyAnalyticsConsent(getAnalyticsConsent());
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  try {
    localStorage.setItem(STORAGE_KEY, consent);
  } catch {
    // Storage bloqueado: a escolha vale apenas nesta visita.
  }
  applyAnalyticsConsent(consent);
}

if (import.meta.env.PROD) {
  window.addEventListener("storage", (event) => {
    // Abas abertas antes do deploy ainda gravam a chave antiga; remoção na migração não revoga o aceite.
    if (event.key === "cidoa:analytics-consent" && event.newValue !== null) {
      setAnalyticsConsent(event.newValue === "granted" ? "granted" : "denied");
      return;
    }
    if (event.key === STORAGE_KEY || event.key === null) initializeAnalytics();
  });
}
