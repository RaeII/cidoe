import axios from "axios";

/** Erro normalizado da API — sempre status numérico (0 = rede) + mensagem legível. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Disparados no `window` quando a API responde 401 fora do login (sessão expirada).
 * Um por sessão: rota `/admin/*` derruba só o painel; o resto, só a cena.
 */
export const SESSION_EXPIRED_EVENT = "api:session-expired";
export const ADMIN_SESSION_EXPIRED_EVENT = "api:admin-session-expired";

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  // Envia os cookies httpOnly de sessão (`token_access` da cena, `token_admin`
  // do painel — este só vai a /api/admin). O JS nunca lê o token.
  withCredentials: true,
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    // Aborts (AbortController) passam intactos — quem chamou decide ignorar
    if (axios.isCancel(error)) return Promise.reject(error);
    const status: number = error?.response?.status ?? 0;
    const message: string =
      error?.response?.data?.message ?? error?.message ?? "Erro de rede";

    // 401 num fluxo de auth (login/cadastro por senha ou código) = credencial/
    // código inválido, não sessão expirada. Só 401 FORA desses fluxos limpa a
    // sessão local — AuthProvider (cena) e AdminAuthProvider (painel) escutam.
    const url: string = error?.config?.url ?? "";
    const isAuthFlow = /\/auth\/(login|register|google)/.test(url);
    if (status === 401 && !isAuthFlow) {
      const event = url.startsWith("/admin/") ? ADMIN_SESSION_EXPIRED_EVENT : SESSION_EXPIRED_EVENT;
      window.dispatchEvent(new Event(event));
    }

    return Promise.reject(new ApiError(status, message));
  },
);
