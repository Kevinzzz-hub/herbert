export const AI_PROVIDER_IDS = [
  "deepseek",
  "openai",
  "gemini",
  "anthropic",
  "openrouter",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  description: string;
  defaultModel: string;
  keyPlaceholder: string;
  modelHelp: string;
}

export interface AiCredentialStatus {
  configured: boolean;
  provider: AiProviderId | null;
  providerLabel: string | null;
  model: string | null;
  keyHint: string | null;
  updatedAt: string | null;
}

export const AI_PROVIDER_OPTIONS: readonly AiProviderOption[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "价格友好，适合中文课程资料。",
    defaultModel: "deepseek-v4-flash",
    keyPlaceholder: "sk-••••••••••••",
    modelHelp: "默认使用 DeepSeek V4 Flash。",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "适合稳定的结构化总结与问答。",
    defaultModel: "gpt-5.4-mini",
    keyPlaceholder: "sk-••••••••••••",
    modelHelp: "默认使用 GPT-5.4 mini，也可以填写账号可用的其他模型。",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "长文本能力强，使用 Google AI Studio Key。",
    defaultModel: "gemini-3.5-flash",
    keyPlaceholder: "AIza••••••••••••",
    modelHelp: "默认使用 Gemini 3.5 Flash。",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    description: "适合长文理解与严谨表达。",
    defaultModel: "claude-sonnet-4-6",
    keyPlaceholder: "sk-ant-••••••••••••",
    modelHelp: "默认使用 Claude Sonnet 4.6。",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "一个 Key 使用数百个模型，包括 Kimi、千问等。",
    defaultModel: "~openai/gpt-latest",
    keyPlaceholder: "sk-or-v1-••••••••••••",
    modelHelp: "填写 OpenRouter 模型标识，例如 google/gemini-3.5-flash。",
  },
] as const;

const PROVIDER_IDS = new Set<string>(AI_PROVIDER_IDS);

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && PROVIDER_IDS.has(value);
}

export function getAiProviderOption(provider: AiProviderId): AiProviderOption {
  const option = AI_PROVIDER_OPTIONS.find((candidate) => candidate.id === provider);
  if (!option) throw new Error(`Unsupported Herbert AI provider: ${provider}`);
  return option;
}
