/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem da API (ex.: domínio real/CDN em produção). Ausente = "/api" via proxy dev. */
  readonly VITE_API_URL?: string;
  /** Client ID público do Google OAuth (login com Google). Sobrescreve o default embutido. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
