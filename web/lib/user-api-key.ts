import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { HerbertWebError } from "./herbert";

export interface ApiKeyStatus {
  configured: boolean;
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
    .rpc("herbert_deepseek_key_status", { p_user_id: userId })
    .maybeSingle();
  if (error) throw vaultError();
  if (!data) return { configured: false, keyHint: null, updatedAt: null };
  const row = data as { key_hint: string; updated_at: string };
  return { configured: true, keyHint: row.key_hint, updatedAt: row.updated_at };
}

export async function saveDeepSeekApiKey(userId: string, apiKey: string): Promise<ApiKeyStatus> {
  await verifyDeepSeekApiKey(apiKey);
  const hint = `DeepSeek ••••${apiKey.slice(-4)}`;
  const { data, error } = await getAdminServerClient()
    .rpc("herbert_store_deepseek_key", {
      p_user_id: userId,
      p_secret: apiKey,
      p_hint: hint,
    })
    .single();
  if (error) throw vaultError();
  const row = data as { key_hint: string; updated_at: string };
  return { configured: true, keyHint: row.key_hint, updatedAt: row.updated_at };
}

export async function deleteDeepSeekApiKey(userId: string): Promise<void> {
  const { error } = await getAdminServerClient()
    .rpc("herbert_delete_deepseek_key", { p_user_id: userId });
  if (error) throw vaultError();
}

export async function requireUserDeepSeekKey(request: Request): Promise<string> {
  const user = await requireAuthenticatedUser(request);
  const { data, error } = await getAdminServerClient()
    .rpc("herbert_get_deepseek_key", { p_user_id: user.id })
    .maybeSingle();
  if (error) throw vaultError();
  const apiKey = (data as { decrypted_secret?: string } | null)?.decrypted_secret?.trim();
  if (!apiKey) {
    throw new HerbertWebError("API_KEY_REQUIRED", "请先连接你自己的 DeepSeek API Key。", 428);
  }
  return apiKey;
}

function normalizeDeepSeekApiKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new HerbertWebError("INVALID_PROVIDER_KEY", "请输入 DeepSeek API Key。", 400);
  }
  const apiKey = value.trim();
  if (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new HerbertWebError("INVALID_PROVIDER_KEY", "DeepSeek API Key 格式不正确。", 400);
  }
  return apiKey;
}

export function readDeepSeekApiKey(value: unknown): string {
  return normalizeDeepSeekApiKey(value);
}

async function verifyDeepSeekApiKey(apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new HerbertWebError("PROVIDER_ERROR", "暂时无法连接 DeepSeek，请稍后再保存。", 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new HerbertWebError("INVALID_PROVIDER_KEY", "这个 DeepSeek API Key 无法通过验证。", 400);
  }
  if (!response.ok) {
    throw new HerbertWebError("PROVIDER_ERROR", `DeepSeek 暂时无法验证密钥（${response.status}）。`, 502);
  }
}

function vaultError(): HerbertWebError {
  return new HerbertWebError("VAULT_ERROR", "Herbert 的密钥保险箱暂时不可用，请稍后重试。", 503);
}
