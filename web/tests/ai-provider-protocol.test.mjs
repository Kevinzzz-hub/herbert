import assert from "node:assert/strict";
import test from "node:test";
import { AI_PROVIDER_OPTIONS, getAiProviderOption } from "../lib/ai-provider-catalog.ts";
import {
  providerCompletionRequest,
  providerResponseText,
  providerVerificationRequest,
} from "../lib/ai-provider-protocol.ts";

test("offers five bounded AI providers without accepting an arbitrary host", () => {
  assert.deepEqual(AI_PROVIDER_OPTIONS.map((provider) => provider.id), [
    "deepseek",
    "openai",
    "gemini",
    "anthropic",
    "openrouter",
  ]);
  assert.equal(getAiProviderOption("openrouter").defaultModel, "~openai/gpt-latest");
  assert.match(getAiProviderOption("openrouter").description, /Kimi、千问/);
});

test("validates each key only against its allowlisted provider endpoint", () => {
  assert.equal(providerVerificationRequest("deepseek", "test-key").url, "https://api.deepseek.com/models");
  assert.equal(providerVerificationRequest("openai", "test-key").url, "https://api.openai.com/v1/models");
  assert.equal(providerVerificationRequest("gemini", "test-key").url, "https://generativelanguage.googleapis.com/v1beta/models");
  assert.equal(providerVerificationRequest("anthropic", "test-key").url, "https://api.anthropic.com/v1/models");
  assert.equal(providerVerificationRequest("openrouter", "test-key").url, "https://openrouter.ai/api/v1/key");
});

test("builds compatible structured JSON requests for OpenAI, Gemini, and Claude", () => {
  const openAi = providerCompletionRequest(
    { provider: "openai", model: "gpt-test", apiKey: "test-key" },
    "system",
    "user",
  );
  assert.equal(openAi.url, "https://api.openai.com/v1/chat/completions");
  const openAiBody = JSON.parse(openAi.init.body);
  assert.deepEqual(openAiBody.response_format, { type: "json_object" });
  assert.equal(openAiBody.max_completion_tokens, 4096);

  const gemini = providerCompletionRequest(
    { provider: "gemini", model: "gemini-test", apiKey: "test-key" },
    "system",
    "user",
  );
  assert.match(gemini.url, /gemini-test:generateContent$/);
  const geminiBody = JSON.parse(gemini.init.body);
  assert.equal(geminiBody.generationConfig.responseMimeType, "application/json");

  const claude = providerCompletionRequest(
    { provider: "anthropic", model: "claude-test", apiKey: "test-key" },
    "system",
    "user",
  );
  assert.equal(claude.url, "https://api.anthropic.com/v1/messages");
  assert.equal(JSON.parse(claude.init.body).system, "system");
});

test("extracts provider text from each supported response shape", () => {
  assert.equal(providerResponseText("openai", { choices: [{ message: { content: "{}" } }] }), "{}");
  assert.equal(providerResponseText("gemini", { candidates: [{ content: { parts: [{ text: "{}" }] } }] }), "{}");
  assert.equal(providerResponseText("anthropic", { content: [{ type: "text", text: "{}" }] }), "{}");
});
