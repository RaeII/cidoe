import { http } from "../http";
import type {
  AuthChallenge,
  CompleteRegistrationInput,
  GoogleAuthInput,
  GoogleAuthResponse,
  LoginResponse,
  RequestLoginCodeInput,
  VerifyLoginCodeResponse,
  VerifyCodeInput,
} from "./auth.types";

// Rotas /auth do backend — sessão da CENA. O token JWT vive em cookie httpOnly
// (`token_access`) — setado no login, removido no logout. O JS nunca o lê.
// Login do painel admin é outro fluxo: `adminLogin` em ../admin/admin.routes.

export async function logout() {
  await http.post("/auth/logout");
}

// Login com Google (GIS). O front recebe o ID token (`credential`) do popup do
// Google e o envia aqui; o backend entra (cookie httpOnly) ou devolve os dados
// sugeridos para o usuário confirmar antes de criar a conta.
export async function loginWithGoogle(input: GoogleAuthInput) {
  const { data } = await http.post<GoogleAuthResponse>("/auth/google", input);
  return data;
}

// Passwordless (código por e-mail). request-code envia o código; verify-code
// valida e seta o cookie httpOnly da cena.

export async function requestLoginCode(input: RequestLoginCodeInput) {
  const { data } = await http.post<AuthChallenge>("/auth/login/request-code", input);
  return data;
}

export async function verifyLoginCode(input: VerifyCodeInput) {
  const { data } = await http.post<VerifyLoginCodeResponse>("/auth/login/verify-code", input);
  return data;
}

export async function completeRegistration(input: CompleteRegistrationInput) {
  const { data } = await http.post<LoginResponse>("/auth/register/complete", input);
  return data;
}
