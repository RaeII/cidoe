import type { User } from "../user/user.types";

/**
 * Credenciais do login do painel admin. `login` aceita username OU email —
 * o backend resolve o identificador.
 */
export interface LoginInput {
  login: string;
  password: string;
}

export interface LoginResponse {
  data: User;
  /** TTL da sessão em segundos (o token em si fica no cookie httpOnly). */
  expiresIn: number;
}

/** Body do login com Google: o `credential` (ID token) devolvido pelo GIS. */
export interface GoogleAuthInput {
  credential: string;
}

// ─── Passwordless (código por e-mail) ───────────────────────────

/** Body de request-code do login: só o e-mail. */
export interface RequestLoginCodeInput {
  email: string;
}

/** Perfil enviado somente depois que o e-mail foi confirmado. */
export interface CompleteRegistrationInput {
  registrationToken: string;
  username: string;
  name: string;
  referralCode?: string;
  /** Versão dos Termos + Política aceita na caixa do cadastro (`LEGAL_VERSION`). */
  termsVersion: string;
}

/** Desafio criado pelo request-code — código de 6 dígitos enviado por e-mail. */
export interface AuthChallenge {
  challengeId: string;
  /** ISO — quando o desafio expira. */
  expiresAt: string;
  /** ISO — quando um novo código pode ser reenviado (cooldown). */
  resendAvailableAt: string;
  /** Só em dev (AUTH_DEBUG_CODE): código em texto p/ preencher no front. NUNCA em produção. */
  debugCode?: string;
}

/** Body de verify-code: id do desafio + código de 6 dígitos. */
export interface VerifyCodeInput {
  challengeId: string;
  code: string;
}

export interface RegistrationRequiredResult {
  status: "registration_required";
  /** Prova curta do e-mail verificado. Deve existir somente em memória. */
  registrationToken: string;
  expiresAt: string;
}

/** 1º acesso por Google: a conta ainda não existe — sugestões para o usuário confirmar. */
export interface GoogleRegistrationRequiredResult extends RegistrationRequiredResult {
  /** E-mail verificado pelo Google — exibido bloqueado, não editável. */
  email: string;
  name: string | null;
  username: string;
}

export type GoogleAuthResponse =
  | (LoginResponse & { status: "authenticated" })
  | GoogleRegistrationRequiredResult;

export type GoogleAuthResult =
  | { status: "authenticated"; user: User }
  | GoogleRegistrationRequiredResult;

export type VerifyLoginCodeResponse =
  | (LoginResponse & { status: "authenticated" })
  | RegistrationRequiredResult;

export type VerifyCodeResult =
  | { status: "authenticated"; user: User }
  | RegistrationRequiredResult;
