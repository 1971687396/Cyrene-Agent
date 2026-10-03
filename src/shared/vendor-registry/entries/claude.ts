// claude（Anthropic）的注册表条目 —— 推理规则自 shared/reasoning.ts、能力自 capabilities.ts 原样迁入。
import { defineVendor, legacyMetadata } from "../define-vendor";

export const CLAUDE_REGISTRY = defineVendor({
  capability: {
    id: "claude",
    displayName: "Claude（Anthropic）",
    transport: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authStyle: "x-api-key",
    defaultModel: "claude-sonnet-4-6",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "thinking",
    cacheStrategy: "cache_control",
    testStrategy: "text",
    // 自家协议 only
    supportedTransports: ["anthropic"],
  },
  shortName: "Claude",
  reasoningRules: [
    // ── claude（Anthropic）──
    { modelPattern: /^claude-fable-5/i, modelInferencePattern: /^claude-fable-5/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
    { modelPattern: /^claude-sonnet-5/i, modelInferencePattern: /^claude-sonnet-5/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
    { modelPattern: /^claude-opus-4-(8|7|6)/i, modelInferencePattern: /^claude-opus-4-(8|7|6)/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
    { modelPattern: /^claude-sonnet-4-6/i, modelInferencePattern: /^claude-sonnet-4-6/i, metadata: legacyMetadata("迁自 src/shared/vendor-registry/entries/claude.ts"), capability: {
      control: "toggle-effort",
      supportedEfforts: ["low", "medium", "high", "xhigh"],
      defaultEffort: "high",
      requestStyle: "anthropic-adaptive",
      supportsDisable: true,
    } },
  ],
});
