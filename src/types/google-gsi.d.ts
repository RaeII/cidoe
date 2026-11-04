// Tipos mínimos do Google Identity Services (script accounts.google.com/gsi/client).
// Só o que o AuthDialog usa — não é a API completa.
export {};

interface GoogleCredentialResponse {
  /** ID token (JWT) do usuário — enviado ao backend em POST /auth/google. */
  credential: string;
  select_by?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  use_fedcm_for_button?: boolean;
}

interface GoogleButtonOptions {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
  locale?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: GoogleIdConfiguration): void;
          renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
          prompt(): void;
          cancel(): void;
        };
      };
    };
  }
}
