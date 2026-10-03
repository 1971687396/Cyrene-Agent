import type { AdaptationEvidence, ModelSamplingRuleInput, RuleMetadata, StructuredOutputRuleInput } from "./model-types";
import type { ModelReasoningRule, Transport, VendorRegistryEntry } from "./types";
import { evidenceCoversTransport } from "./validation";

const TRANSPORTS: readonly Transport[] = ["openai", "anthropic", "responses"];
const REASONING_LABELS = {
  none: "不提供思考控制", dynamic: "未知（需手动配置）", "fixed-on": "强制思考",
  toggle: "思考开关", effort: "思考档位", "toggle-effort": "思考开关与档位",
} as const;
const OUTPUT_LABELS = {
  provider_json_schema: "JSON Schema", provider_json_object: "JSON 对象", prompt_json: "提示词 JSON（专用契约）",
} as const;

function cell(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").replace(/`/g, "&#96;");
}

function evidenceLabel(evidence: AdaptationEvidence): string {
  if (evidence.kind === "legacy") return `历史未核验：${cell(evidence.note)}`;
  if (evidence.kind === "official") return `官方资料 [链接](<${encodeURI(evidence.url).replace(/>/g, "%3E")}>)；核验 ${cell(evidence.checkedAt)}；协议 ${evidence.transports.join(" / ")}`;
  return `脱敏实测：${cell(evidence.artifact)}；核验 ${cell(evidence.checkedAt)}；协议 ${evidence.transport}；端点 ${cell(evidence.endpoint)}`;
}

function declared(label: string, metadata?: RuleMetadata, transport?: Transport): string {
  if (!metadata || metadata.status === "unknown") return "未知（已有规则未确认）";
  if (transport && !evidenceCoversTransport(metadata.evidence, transport)) return "未知（已有规则，证据未覆盖该协议）";
  if (metadata.status === "unsupported") return "声明不支持";
  return `${label}${metadata.evidence.kind === "legacy" ? "（历史未核验）" : ""}`;
}

function reasoningLabel(rule?: ModelReasoningRule, transport?: Transport): string {
  if (!rule?.metadata) return "未知（无专用规则）";
  const cap = rule.capability;
  const details = [
    cap.supportedEfforts?.length ? `档位 ${cap.supportedEfforts.join(" / ")}` : "",
    cap.supportsDisable ? "可关闭" : "不可关闭",
    cap.defaultEffort ? `默认 ${cap.defaultEffort}` : "",
    cap.autoEffort ? `自动 ${cap.autoEffort}` : "",
  ].filter(Boolean).join("；");
  return declared(`${REASONING_LABELS[cap.control]}；${details}`, rule.metadata, transport);
}

function samplingLabel(rule?: ModelSamplingRuleInput, transport?: Transport): string {
  if (!rule) return "未知（无采样白名单）";
  const details = [rule.diversity ? "温度 / Top-P" : "无多样性参数",
    rule.repetition ? `重复惩罚 ${rule.repetition}` : "",
    rule.requiresReasoningOff ? "仅关闭思考时" : "",
    rule.maximumTemperature !== undefined ? `温度上限 ${rule.maximumTemperature}` : "",
  ].filter(Boolean).join("；");
  return declared(details, rule.metadata, transport);
}

function outputLabel(rule?: StructuredOutputRuleInput): string {
  if (!rule) return "未知（提示词 JSON 回退）";
  const hints = [rule.requestHints?.sendJsonObject ? "发送 JSON 对象提示" : "", rule.requestHints?.reasoningSplit ? "分离思考" : "",
    rule.repairOverrides?.length ? "部分型号使用既有慢修复预算" : ""].filter(Boolean);
  return declared(`${OUTPUT_LABELS[rule.mode]}；等级 ${rule.tier}${hints.length ? `；${hints.join("；")}` : ""}`, rule.metadata, rule.transport);
}

/** 纯共享声明的投影，不加载主进程策略、界面或付费接口。 */
export function renderAdaptedModelsMarkdown(entries: readonly VendorRegistryEntry[]): string {
  const lines = [
    "# 模型适配清单", "", "<!-- 自动生成：pnpm run generate:adapted-models；不要手工修改此文件。 -->", "",
    "本清单描述仓库中的静态声明，不代表每个型号都经过当前官方接口实测。历史迁移规则统一标为「历史未核验」。", "",
    "- 型号目录、能力规则和界面预填值均维护在 `src/shared/vendor-registry/entries/`。",
    "- 推理与采样列按预设协议展示；结构化输出分协议列出，仅适用于现有官方端点判定。中转、自定义和本地端点保留提示词 JSON 回退。",
    "- 元数据记录证据，不改变请求策略。型号名称和别名说明不会自动重写用户请求。缺少白名单时采样参数不注入。",
    "- 历史代码中的验证等级保留原值，不能替代本清单的证据核验。未匹配结构化输出规则时保守回退。",
    "- 贡献步骤见 [模型适配贡献指南](../contributing/model-adaptation.md)。", "",
  ];
  for (const entry of entries) {
    const cap = entry.capability;
    const transport = entry.presetDefaults?.transport ?? cap.transport;
    lines.push(`## ${cell(cap.displayName)}`, "",
      `预设协议：${transport}；预填地址：${cell(entry.presetDefaults?.baseUrl ?? cap.baseUrl)}。`, "",
      `运行默认：${cap.transport} / ${cell(cap.baseUrl)} / ${cell(cap.defaultModel)}。`, "",
      `工具支持：厂商级声明 ${cap.supportsTools ? "支持" : "不支持"}，未逐型号核验。视觉推荐仅表示目录推荐用途，未逐型号核验。`, "",
      "| 型号 | 界面推荐 | 推理（预设协议） | 采样（预设协议） | 结构化输出（官方端点） | 证据与限制 |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const item of entry.models ?? []) {
      const reasoning = entry.reasoningRules.find((rule) => rule.modelPattern.test(item.model));
      const sampling = entry.samplingRules?.find((rule) => rule.modelPattern.test(item.model));
      const outputs = TRANSPORTS.map((protocol) => ({ protocol,
        rule: entry.structuredOutputRules?.find((rule) => rule.transport === protocol && rule.modelPattern.test(item.model)),
      }));
      const evidence = [
        reasoning?.metadata ? `推理：${evidenceLabel(reasoning.metadata.evidence)}` : "",
        sampling ? `采样：${evidenceLabel(sampling.metadata.evidence)}` : "",
        ...outputs.filter(({ rule }) => rule).map(({ protocol, rule }) => `输出 ${protocol}：${evidenceLabel(rule!.metadata.evidence)}`),
        item.aliases?.length ? `别名说明：${cell(item.aliases.join(" / "))}` : "",
        item.note ? cell(item.note) : "",
        ...(item.unknownCapabilities ?? []).map((unknown) => `未知 ${unknown.feature} / ${unknown.transport}：${cell(unknown.note)}`),
      ].filter(Boolean).join("<br>") || "无型号级证据";
      const recommendation = item.recommendedFor.map((purpose) => purpose === "chat" ? "主模型" : "视觉").join(" / ") || "非推荐";
      lines.push(`| ${cell(item.model)} | ${recommendation} | ${reasoningLabel(reasoning, transport)} | ${samplingLabel(sampling, transport)} | ${outputs.map(({ protocol, rule }) => `${protocol}：${outputLabel(rule)}`).join("<br>")} | ${evidence} |`);
    }
    const families = [
      ...entry.reasoningRules.filter((rule) => rule.familyLabel).map((rule) => ["推理", rule.familyLabel!, rule.modelPattern, reasoningLabel(rule), rule.metadata!] as const),
      ...(entry.samplingRules ?? []).filter((rule) => rule.familyLabel).map((rule) => ["采样", rule.familyLabel!, rule.modelPattern, samplingLabel(rule), rule.metadata] as const),
      ...(entry.structuredOutputRules ?? []).filter((rule) => rule.familyLabel).map((rule) => [`输出 ${rule.transport}`, rule.familyLabel!, rule.modelPattern, outputLabel(rule), rule.metadata] as const),
    ];
    if (families.length) {
      lines.push("", "### 人工标注的规则范围", "", "以下为规则说明，实际型号仍按首条匹配生效；系列标签不承诺未来型号兼容。", "",
        "| 能力 | 系列标签 | 实际匹配 | 声明 | 证据 |", "| --- | --- | --- | --- | --- |");
      for (const [feature, label, pattern, description, metadata] of families) {
        lines.push(`| ${feature} | ${cell(label)} | ${cell(pattern.toString())} | ${description} | ${evidenceLabel(metadata.evidence)} |`);
      }
    }
    lines.push("");
  }
  lines.push("## 自定义端点", "", "`custom-cloud`（云端自定义端点）与 `custom-local`（本地模型端点）不维护内置型号推荐；用户填写实际服务提供的名称和协议。", "");
  return lines.join("\n");
}
