import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { verifyAiCredential, type AiCredential } from "./ai-provider";
import {
  getAiProviderOption,
  isAiProviderId,
  type AiProviderId,
} from "./ai-provider-catalog";
import { HerbertWebError } from "./herbert";

export interface ApiKeyStatus {
  configured: boolean;
  provider: AiProviderId | null;
  providerLabel: string | null;
  model: string | null;
  keyHint: string | null;
  updatedAt: string | null;
}

let publicServerClient: SupabaseClient | null = null;
let adminServerClient: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const value = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new HerbertWebError("AUTH_NOT_CONFIGURED", "Herbert 的登录服务尚未配置完成。", 503);
  return value;
}

function getPublicServerClient(): SupabaseClient {
  if (publicServerClient) return publicServerClient;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new HerbertWebError("AUTH_NOT_CONFIGURED", "Herbert 的登录服务尚未配置完成。", 503);
  publicServerClient = createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return publicServerClient;
}

function getAdminServerClient(): SupabaseClient {
  if (adminServerClient) return adminServerClient;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HerbertWebError("VAULT_NOT_CONFIGURED", "Herbert 的密钥保险箱尚未配置完成。", 503);
  adminServerClient = createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminServerClient;
}

export async function requireAuthenticatedUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new HerbertWebError("AUTH_REQUIRED", "请先登录 Herbert。", 401);
  }

  const { data, error } = await getPublicServerClient().auth.getUser(match[1]);
  if (error || !data.user) {
    throw new HerbertWebError("AUTH_REQUIRED", "登录状态已失效，请重新登录。", 401);
  }
  return data.user;
}

export async function getApiKeyStatus(userId: string): Promise<ApiKeyStatus> {
  const { data, error } = await getAdminServerClient()
    .rpc("herbert_ai_credential_status", { p_user_id: userId })
    .maybeSingle();
  if (error) throw vaultError();
  if (!data) return emptyStatus();
  const row = data as { provider: unknown; model: string; key_hint: string; updated_at: string };
  if (!isAiProviderId(row.provider)) throw vaultError();
  return statusFromRow(row.provider, row.model, row.key_hint, row.updated_at);
}

export async function saveAiCredential(userId: string, credential: AiCredential): Promise<ApiKeyStatus> {
  await verifyAiCredential(credential.provider, credential.apiKey);
  const provider = getAiProviderOption(credential.provider);
  const hint = `${provider.label} ••••${credential.apiKey.slice(-4)}`;
  const { data, error } = await getAdminServerClient()
    .rpc("herbert_store_ai_credential", {
      p_user_id: userId,
      p_provider: credential.provider,
      p_model: credential.model,
      p_secret: credential.apiKey,
      p_hint: hint,
    })
    .single();
  if (error) throw vaultError();
  const row = data as { provider: AiProviderId; model: string; key_hint: string; updated_at: string };
  return statusFromRow(row.provider, row.model, row.key_hint, row.updated_at);
}

export async function deleteAiCredential(userId: string): Promise<void> {
  const { error } = await getAdminServerClient()
    .rpc("herbert_delete_ai_credential", { p_user_id: userId });
  if (error) throw vaultError();
}

export async function requireUserAiCredential(request: Request): Promise<AiCredential> {
  const user = await requireAuthenticatedUser(request);
  const { data, error } = await getAdminServerClient()
    .rpc("herbert_get_ai_credential", { p_user_id: user.id })
    .maybeSingle();
  if (error) throw vaultError();
  const row = data as { provider?: unknown; model?: string; decrypted_secret?: string } | null;
  if (!row || !isAiProviderId(row.provider) || !row.model?.trim() || !row.decrypted_secret?.trim()) {
    throw new HerbertWebError("API_KEY_REQUIRED", "请先连接你自己的 AI 服务。", 428);
  }
  return { provider: row.provider, model: row.model.trim(), apiKey: row.decrypted_secret.trim() };
}

export function readAiCredentialInput(value: unknown): AiCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HerbertWebError("INVALID_PROVIDER_KEY", "AI 连接内容格式不正确。", 400);
  }
  const input = value as Record<string, unknown>;
  if (!isAiProviderId(input.provider)) {
    throw new HerbertWebError("INVALID_PROVIDER", "请选择 Herbert 支持的 AI 服务商。", 400);
  }
  const option = getAiProviderOption(input.provider);
  if (typeof input.apiKey !== "string") {
    throw new HerbertWebError("INVALID_PROVIDER_KEY", `请输入 ${option.label} API Key。`, 400);
  }
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new HerbertWebError("INVALID_PROVIDER_KEY", `${option.label} API Key 格式不正确。`, 400);
  }
  const model = typeof input.model === "string" && input.model.trim()
    ? input.model.trim()
    : option.defaultModel;
  if (model.length > 120 || !/^[a-zA-Z0-9._~:/-]+$/.test(model)) {
    throw new HerbertWebError("INVALID_MODEL", "模型名称格式不正确，请检查后重试。", 400);
  }
  return { provider: input.provider, model, apiKey };
}

function emptyStatus(): ApiKeyStatus {
  return { configured: false, provider: null, providerLabel: null, model: null, keyHint: null, updatedAt: null };
}

function statusFromRow(
  provider: AiProviderId,
  model: string,
  keyHint: string,
  updatedAt: string,
): ApiKeyStatus {
  return {
    configured: true,
    provider,
    providerLabel: getAiProviderOption(provider).label,
    model,
    keyHint,
    updatedAt,
  };
}

function vaultError(): HerbertWebError {
  return new HerbertWebError("VAULT_ERROR", "Herbert 的密钥保险箱暂时不可用，请稍后重试。", 503);
}
