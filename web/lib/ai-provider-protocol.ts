import type { AiProviderId } from "./ai-provider-catalog";

export interface AiCredential {
  provider: AiProviderId;
  model: string;
  apiKey: string;
}

export interface ProviderRequest {
  url: string;
  init: RequestInit;
}

export function providerVerificationRequest(provider: AiProviderId, apiKey: string): ProviderRequest {
  if (provider === "gemini") {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      init: { headers: { "x-goog-api-key": apiKey } },
    };
  }
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/models",
      init: { headers: { "anthropic-version": "2023-06-01", "x-api-key": apiKey } },
    };
  }
  if (provider === "openrouter") {
    return {
      url: "https://openrouter.ai/api/v1/key",
      init: { headers: { Authorization: `Bearer ${apiKey}` } },
    };
  }
  return {
    url: provider === "deepseek"
      ? "https://api.deepseek.com/models"
      : "https://api.openai.com/v1/models",
    init: { headers: { Authorization: `Bearer ${apiKey}` } },
  };
}

export function providerCompletionRequest(
  credential: AiCredential,
  systemPrompt: string,
  userPrompt: string,
): ProviderRequest {
  if (credential.provider === "gemini") {
    const model = credential.model.replace(/^models\//, "");
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": credential.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      },
    };
  }

  if (credential.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "x-api-key": credential.apiKey,
        },
        body: JSON.stringify({
          model: credential.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      },
    };
  }

  const baseUrl = credential.provider === "deepseek"
    ? "https://api.deepseek.com"
    : credential.provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : "https://api.openai.com/v1";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credential.apiKey}`,
    "Content-Type": "application/json",
  };
  if (credential.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/Kevinzzz-hub/herbert";
    headers["X-OpenRouter-Title"] = "Herbert";
  }
  const body: Record<string, unknown> = {
    model: credential.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  };
  if (credential.provider === "openai") body.max_completion_tokens = 4096;
  else body.max_tokens = 4096;
  if (credential.provider === "deepseek") body.thinking = { type: "disabled" };

  return {
    url: `${baseUrl}/chat/completions`,
    init: { method: "POST", headers, body: JSON.stringify(body) },
  };
}

export function providerResponseText(provider: AiProviderId, body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const object = body as Record<string, unknown>;
  if (provider === "gemini") {
    const candidates = object.candidates;
    if (!Array.isArray(candidates)) return null;
    const content = candidates[0] && typeof candidates[0] === "object"
      ? (candidates[0] as Record<string, unknown>).content
      : null;
    const parts = content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>).parts
      : null;
    if (!Array.isArray(parts)) return null;
    return parts.map((part) => part && typeof part === "object" ? (part as Record<string, unknown>).text : "")
      .filter((text): text is string => typeof text === "string")
      .join("") || null;
  }
  if (provider === "anthropic") {
    const content = object.content;
    if (!Array.isArray(content)) return null;
    return content.map((part) => part && typeof part === "object" ? (part as Record<string, unknown>).text : "")
      .filter((text): text is string => typeof text === "string")
      .join("") || null;
  }
  const choices = object.choices;
  if (!Array.isArray(choices)) return null;
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>).message
    : null;
  const content = message && typeof message === "object" && !Array.isArray(message)
    ? (message as Record<string, unknown>).content
    : null;
  return typeof content === "string" ? content : null;
}
