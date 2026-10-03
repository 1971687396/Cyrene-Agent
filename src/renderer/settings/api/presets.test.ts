import { describe, expect, it } from "vitest";
import { MODEL_PRESETS, presetTransportUrl } from "./presets";

describe("provider preset transport endpoints", () => {
  it("preserves every builtin candidate and the two custom entries", () => {
    expect(MODEL_PRESETS.map(({ providerId, mainModels }) => [providerId, mainModels])).toEqual([
      ["minimax", ["MiniMax-M3.1-Flash-Preview", "MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.5"]],
      ["deepseek", ["deepseek-flash", "deepseek-v4-pro"]],
      ["doubao", ["doubao-seed-2-1-pro-260628", "doubao-seed-2-0-pro-260215", "doubao-seed-2-0-lite-260428", "doubao-seed-2-0-mini-260428"]],
      ["glm", ["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx", "glm-5.2", "glm-5.1", "glm-5-turbo", "glm-4.7"]],
      ["kimi", ["kimi-k2.6", "kimi-k2.5", "kimi-k2-thinking"]],
      ["qwen", ["qwen-max", "qwen-plus", "qwen-turbo"]],
      ["chatgpt", ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-5.6", "gpt-5.6-terra", "gpt-5.6-luna"]],
      ["claude", ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-4-6"]],
      ["mimo", ["mimo-v2.6-pro", "mimo-v2.6-flash", "mimo-v2.6-pro-ultraspeed"]],
      ["grok", ["grok-4.7", "grok-4.6", "grok-4.5", "grok-build-0.1"]],
      ["gemini", ["gemini-3.8-flash", "gemini-3.1-pro", "gemini-3.5-flash", "gemini-2.5-flash"]],
      ["custom-cloud", []], ["custom-local", []],
    ]);
  });

  it("keeps MiMo vision defaults and custom endpoint presentation", () => {
    const mimo = MODEL_PRESETS.find((preset) => preset.providerId === "mimo")!;
    expect(mimo.visionModels).toEqual(["mimo-v2.6-pro", "mimo-v2.6-flash"]);
    expect(mimo.defaultVisionModel).toBe("mimo-v2.6-pro");
    expect(mimo.visionBaseUrl).toBe("https://api.xiaomimimo.com/v1");
    expect(MODEL_PRESETS.at(-1)?.hiddenInPresetList).toBe(true);
    expect(MODEL_PRESETS.at(-2)?.customEndpointMode).toBe("cloud");
  });

  it("uses MiniMax's official Responses endpoint and retains its existing defaults", () => {
    const minimax = MODEL_PRESETS.find((preset) => preset.providerId === "minimax");
    expect(minimax).toBeDefined();
    expect(presetTransportUrl(minimax!, "responses")).toBe("https://api.minimax.cn/v1");
    expect(presetTransportUrl(minimax!, "anthropic")).toBe("https://api.minimaxi.com/anthropic");
    expect(presetTransportUrl(minimax!, "openai")).toBe("https://api.minimaxi.com/v1");
  });
});
