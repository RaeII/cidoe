import { http } from "../http";
import type { LoginInput, LoginResponse } from "../auth/auth.types";
import type { User, UserPage } from "../user/user.types";
import type {
  CreateOptionInput,
  CreateTestBuildingsResult,
  CustomizationTree,
  DashboardStats,
  EarlySignupInput,
  EarlySignupSettings,
  DeleteAllBuildingsResult,
  IbgeCounts,
  IbgeStatus,
  UpdateCategoryInput,
  UpdateOptionInput,
  AdminOng,
  OngInput,
  OngPage,
} from "./admin.types";

// Rotas /admin do backend — todas exigem sessão admin (cookie httpOnly
// `token_admin`, separado da sessão da cena), exceto login/logout.

// ─── Sessão do painel ───────────────────────────────────────────

/** Senha de conta admin. Abre só a sessão do painel; a cena não é tocada. */
export async function adminLogin(input: LoginInput) {
  const { data } = await http.post<LoginResponse>("/admin/auth/login", input);
  return data;
}

export async function adminLogout() {
  await http.post("/admin/auth/logout");
}

export async function getAdminSession() {
  const { data } = await http.get<LoginResponse>("/admin/auth/me");
  return data;
}

// ─── Usuários ───────────────────────────────────────────────────

/**
 * Lista usuários ativos. `search` casa username, nome ou e-mail —
 * é assim que se acha uma conta sem paginar a base toda.
 */
export async function listUsers(
  params: { search?: string; page?: number; limit?: number } = {},
) {
  const { data } = await http.get<UserPage>("/admin/users", {
    // axios omite chave undefined — `search` vazio não vira `?search=`.
    params: { search: params.search || undefined, page: params.page, limit: params.limit },
  });
  return data;
}

/** Liga/desliga o acesso de administrador. Backend confere a permissão no banco a cada requisição. */
export async function setUserAdmin(id: number, isAdmin: boolean) {
  const { data } = await http.put<{ data: User }>(`/admin/users/${id}`, { is_admin: isAdmin });
  return data.data;
}

/**
 * Exclui o usuário e todos os dados dele. Definitivo — leva doações,
 * personalizações, indicações e identidades de login junto, e libera
 * o e-mail para um novo cadastro.
 */
export async function deleteUser(id: number) {
  await http.delete(`/admin/users/${id}`);
}

export async function listOngs(params: { search?: string; page?: number; limit?: number } = {}) {
  const { data } = await http.get<OngPage>("/admin/ongs", { params });
  return data;
}

export async function createOng(input: OngInput) {
  const { data } = await http.post<{ data: AdminOng }>("/admin/ongs", input);
  return data.data;
}

export async function updateOng(id: number, input: Partial<OngInput>) {
  const { data } = await http.put<{ data: AdminOng }>(`/admin/ongs/${id}`, input);
  return data.data;
}

export async function deleteOng(id: number) {
  await http.delete(`/admin/ongs/${id}`);
}

// ─── Primeiros inscritos ────────────────────────────────────────

export async function getEarlySignupSettings() {
  const { data } = await http.get<{ data: EarlySignupSettings }>("/admin/early-signups");
  return data.data;
}

export async function saveEarlySignupSettings(input: EarlySignupInput) {
  const { data } = await http.put<{ data: EarlySignupSettings }>("/admin/early-signups", input);
  return data.data;
}

export async function getDashboardStats() {
  const { data } = await http.get<{ data: DashboardStats }>("/admin/dashboard/stats");
  return data.data;
}

export async function getLocalEmailSettings() {
  const { data } = await http.get<{ data: { enabled: boolean } }>("/admin/dashboard/local-email");
  return data.data;
}

export async function saveLocalEmailSettings(enabled: boolean) {
  const { data } = await http.put<{ data: { enabled: boolean } }>("/admin/dashboard/local-email", { enabled });
  return data.data;
}

/** Cria N edifícios (doações) de teste. Acumulativo — soma ao banco. */
export async function createTestBuildings(count: number) {
  const { data } = await http.post<{ data: CreateTestBuildingsResult }>(
    "/admin/test-buildings",
    { count },
  );
  return data.data;
}

/** Exclui TODAS as doações. Destrutivo — exige senha do .env do backend. */
export async function deleteAllBuildings(password: string) {
  const { data } = await http.delete<{ data: DeleteAllBuildingsResult }>(
    "/admin/test-buildings",
    { data: { confirm: true, password } },
  );
  return data.data;
}

/** Diz se o catálogo IBGE (regiões/estados/municípios) já foi vinculado + contagens. */
export async function getIbgeStatus() {
  const { data } = await http.get<{ data: IbgeStatus }>("/admin/ibge/status");
  return data.data;
}

/** Sincroniza regiões/estados/municípios do IBGE no banco (upsert idempotente). */
export async function syncIbge() {
  const { data } = await http.post<{ data: IbgeCounts }>("/admin/ibge/sync");
  return data.data;
}

// ─── Personalizações (catálogo) ─────────────────────────────────

/** Árvore completa de personalizações (inclui inativas) para gestão. */
export async function getCustomizationTree() {
  const { data } = await http.get<{ data: CustomizationTree }>("/admin/customization");
  return data.data;
}

/** Cria opção — só em categoria extensível (Cor/Textura). */
export async function createCustomizationOption(input: CreateOptionInput) {
  const { data } = await http.post<{ data: { id: number } }>(
    "/admin/customization/options",
    input,
  );
  return data.data;
}

/** Atualiza opção (label/value/sort/ativo). A key nunca muda. */
export async function updateCustomizationOption(id: number, input: UpdateOptionInput) {
  await http.put(`/admin/customization/options/${id}`, input);
}

/** Exclui opção. Opções presas a código não podem ser excluídas — desative-as. */
export async function deleteCustomizationOption(id: number) {
  await http.delete(`/admin/customization/options/${id}`);
}

/** Atualiza categoria — liga/desliga (isActive), renomeia ou reordena. */
export async function updateCustomizationCategory(id: number, input: UpdateCategoryInput) {
  await http.put(`/admin/customization/categories/${id}`, input);
}
