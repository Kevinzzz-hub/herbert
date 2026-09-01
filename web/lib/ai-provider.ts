import "server-only";
import { getAiProviderOption, type AiProviderId } from "./ai-provider-catalog";
import {
  providerCompletionRequest,
  providerResponseText,
  providerVerificationRequest,
  type AiCredential,
} from "./ai-provider-protocol";
import { HerbertWebError, type JsonCompletion } from "./herbert";

export type { AiCredential } from "./ai-provider-protocol";

export async function verifyAiCredential(provider: AiProviderId, apiKey: string): Promise<void> {
  const option = getAiProviderOption(provider);
  const request = providerVerificationRequest(provider, apiKey);
  let response: Response;
  try {
    response = await fetch(request.url, request.init);
  } catch {
    throw new HerbertWebError("PROVIDER_ERROR", `暂时无法连接 ${option.label}，请稍后再保存。`, 502);
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new HerbertWebError("INVALID_PROVIDER_KEY", `这个 ${option.label} API Key 无法通过验证。`, 400);
  }
  if (!response.ok) {
    throw new HerbertWebError("PROVIDER_ERROR", `${option.label} 暂时无法验证密钥（${response.status}）。`, 502);
  }
}

export function createAiJson(credential: AiCredential): JsonCompletion {
  if (!credential.apiKey.trim()) {
    throw new HerbertWebError("API_KEY_REQUIRED", "请先连接你自己的 AI 服务。", 428);
  }
  return async (systemPrompt, userPrompt) => {
    const option = getAiProviderOption(credential.provider);
    const request = providerCompletionRequest(credential, systemPrompt, userPrompt);
    let response: Response;
    try {
      response = await fetch(request.url, request.init);
    } catch {
      throw new HerbertWebError("PROVIDER_ERROR", `暂时无法连接 ${option.label}，请稍后重试。`, 502);
    }
    if (response.status === 401 || response.status === 403) {
      throw new HerbertWebError("INVALID_PROVIDER_KEY", `${option.label} API Key 已失效，请在“管理 AI”中更新。`, 400);
    }
    if (response.status === 429) {
      throw new HerbertWebError("PROVIDER_RATE_LIMITED", `${option.label} 当前请求过多或额度不足，请稍后重试。`, 429);
    }
    if (!response.ok) {
      throw new HerbertWebError("PROVIDER_ERROR", `${option.label} 暂时无法完成请求（${response.status}）。`, 502);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new HerbertWebError("INVALID_RESPONSE", `${option.label} 返回了无法读取的内容，请重新尝试。`, 502);
    }
    const content = providerResponseText(credential.provider, body);
    if (!content?.trim()) {
      throw new HerbertWebError("INVALID_RESPONSE", `${option.label} 返回了空内容，请重新尝试。`, 502);
    }
    return parseProviderJson(content, option.label);
  };
}

function parseProviderJson(content: string, providerLabel: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    : trimmed;
  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new HerbertWebError("INVALID_RESPONSE", `${providerLabel} 返回的 JSON 格式不完整，请重新尝试。`, 502);
  }
}
