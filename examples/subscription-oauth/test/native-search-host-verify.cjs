"use strict";

// 使用指定的未修改宿主构建和它的实际 AI SDK；上游全部模拟，不读取账号凭据。
// node examples/subscription-oauth/test/native-search-host-verify.cjs D:/Cyrene-Agent
const assert = require("node:assert/strict");
const path = require("node:path");
const { createProxy } = require("../lib/proxy.cjs");

const hostRoot = process.argv[2];
if (!hostRoot) throw new Error("请指定已构建的原版宿主目录");
const { streamChatWithAiSdk, generateChatWithAiSdk } = require(path.resolve(hostRoot, "dist/main/main/orchestrator/vendors/model-runtime.js"));
const { getAdapterForConfig, PROVIDER_CAPABILITIES } = require(path.resolve(hostRoot, "dist/main/main/orchestrator/vendors/index.js"));
const originalFetch = globalThis.fetch;
const sourceUrl = "https://example.test/official-reference";
const imageUrl = "https://example.test/reference.png";

function modelResponse(model, withTool, final = false) {
  return {
    id: final ? "resp_fixture_final" : "resp_fixture_search", model, created_at: 1, status: "completed",
    output: final ? [{ type: "message", id: "msg_fixture_final", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: "工具续轮完成", annotations: [] }] }] : [
      { type: "reasoning", id: "rs_fixture", summary: [], encrypted_content: "opaque-fixture-only" },
      { type: "web_search_call", id: "ws_fixture_native", status: "completed", action: {
        type: "search", query: "official character reference", sources: [{ type: "url", url: sourceUrl, title: "角色资料" }],
      }, results: [{ type: "image_result", image_url: imageUrl, source_website_url: sourceUrl, caption: "角色参考图" }] },
      ...(withTool ? [{ type: "function_call", id: "fc_fixture", call_id: "call_fixture_todo",
        name: "update_todo", arguments: '{"items":[]}', status: "completed" }] : []),
      { type: "message", id: "msg_fixture", role: "assistant", status: "completed", content: [{ type: "output_text",
        text: "模型回答正常", annotations: [{ type: "url_citation", start_index: 0, end_index: 6, url: sourceUrl, title: "角色资料" }] }] },
    ],
    usage: { input_tokens: 3, output_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  };
}

function reply(body, streaming) {
  if (!streaming) return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const events = [{ type: "response.created", response: { id: body.id, model: body.model, created_at: 1 } }];
  body.output.forEach((item, output_index) => {
    events.push({ type: "response.output_item.added", output_index, item: item.type === "function_call"
      ? { ...item, arguments: "" } : item.type === "message" ? { ...item, content: [] } : item });
    if (item.type === "web_search_call") events.push({ type: "response.web_search_call.searching", item_id: item.id, output_index, sequence_number: 1 });
    if (item.type === "function_call") events.push({ type: "response.function_call_arguments.delta", item_id: item.id, output_index, delta: item.arguments });
    if (item.type === "message") events.push({ type: "response.output_text.delta", item_id: item.id, output_index, content_index: 0, delta: item.content[0].text });
    events.push({ type: "response.output_item.done", output_index, item });
  });
  // 同时覆盖 Codex 终态 output 为空、需要代理补齐的情况。
  events.push({ type: "response.completed", response: { ...body, output: [] } });
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

async function verify(provider, model, streaming, withTool) {
  let calls = 0;
  const proxy = createProxy({ getTokens: async () => ({ tokens: { accessToken: "offline-fixture-only", accountId: "offline-fixture-only" } }) });
  const port = await proxy.start(0);
  const origin = `http://127.0.0.1:${port}`;
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith(`${origin}/`)) return originalFetch(input, init);
      const allowedUpstream = provider === "chatgpt" ? "https://chatgpt.com/backend-api/codex/responses" : "https://api.x.ai/v1/responses";
      assert.equal(url, allowedUpstream, "离线测试禁止任何意外网络请求");
      const body = JSON.parse(init.body);
      assert(body.tools.some(tool => tool.type === "web_search"), "仍须启用订阅原生搜索");
      assert(!body.tools.some(tool => tool.type === "function" && tool.name === "web_search"), "不得调用宿主搜索后端");
      if (calls > 0) {
        assert(!body.input.some(item => item.type === "function_call_output" && item.call_id === "ws_fixture_native"), "不得发送原生搜索的函数结果");
        assert(!body.input.some(item => item.id?.startsWith("msg_suboauth_search_")), "插件生成的参考 ID 不得冒充厂商保存的 item ID");
        assert(JSON.stringify(body.input).includes(sourceUrl), "续轮必须保留搜索来源");
        assert(JSON.stringify(body.input).includes(imageUrl), "续轮必须保留参考图地址");
        assert(body.input.some(item => item.type === "reasoning" && item.encrypted_content === "opaque-fixture-only"), "不得删除加密推理");
        if (withTool) {
          assert(body.input.some(item => item.type === "function_call" && item.call_id === "call_fixture_todo"));
          assert(body.input.some(item => item.type === "function_call_output" && item.call_id === "call_fixture_todo"));
        }
      }
      return reply(modelResponse(model, withTool, calls++ > 0), streaming);
    };
    const config = { provider: PROVIDER_CAPABILITIES.find(cap => cap.id === provider).displayName,
      model, baseUrl: `${origin}/v1`, apiKey: "oauth-fixture-only", explicitTransport: "responses" };
    const adapter = getAdapterForConfig(config);
    const run = streaming ? streamChatWithAiSdk : generateChatWithAiSdk;
    const tools = [
      { name: "web_search", description: "宿主第三方搜索", parameters: { type: "object", properties: {} } },
      { name: "update_todo", description: "本地待办", parameters: { type: "object", properties: { items: { type: "array" } } } },
    ];
    const user = { role: "user", content: "核对角色资料再继续" };
    const first = await run({ adapter, config, request: { model, messages: [user], tools }, timeoutMs: 5000 });
    assert.deepEqual(first.toolCalls.map(call => call.name), withTool ? ["update_todo"] : [], "原生搜索不得进入本地待执行工具列表");
    assert(first.text.includes("模型回答正常"));
    assert(first.text.includes(sourceUrl));
    assert(first.text.includes(imageUrl));
    const restored = JSON.parse(JSON.stringify(first.assistantMessage));
    const messages = [user, restored, ...first.toolCalls.map(call => ({ role: "tool", name: call.name,
      toolCallId: call.id, content: "本地工具执行完成" })), { role: "user", content: "继续" }];
    const next = await run({ adapter, config, request: { model, messages, tools }, timeoutMs: 5000 });
    assert.equal(next.text, "工具续轮完成");
    assert.equal(calls, 2, "不得靠重复上游请求掩盖问题");
    console.log(`PASS ${provider} streaming=${streaming} local-tool=${withTool}: 原生搜索不误执行，来源/参考图/正常工具续轮保留`);
  } finally {
    globalThis.fetch = originalFetch;
    proxy.server.closeAllConnections();
    await proxy.stop();
  }
}

(async () => {
  for (const [provider, model] of [["chatgpt", "gpt-6.1-sol"], ["grok", "grok-4.6"]]) {
    for (const streaming of [true, false]) for (const withTool of [false, true]) await verify(provider, model, streaming, withTool);
  }
  console.log("8 个未修改宿主 + 实际 AI SDK 的离线兼容场景全部通过；没有真实订阅请求。");
})().catch(error => { console.error(error); process.exitCode = 1; });
