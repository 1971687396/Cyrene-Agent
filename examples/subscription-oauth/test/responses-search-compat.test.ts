import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { projectSearchResponse, prepareSearchInput, createSearchSseCompat } = require("../lib/responses-search-compat.cjs");
const search = { type: "web_search_call", id: "ws_native", status: "completed", action: {
  type: "search", query: "角色官方外观", sources: [{ type: "url", title: "官方资料", url: "https://example.test/source" }],
}, results: [{ type: "image_result", image_url: "https://example.test/image.png", source_website_url: "https://example.test/source", caption: "参考图说明" }] };
const tool = { type: "function_call", id: "fc_todo", call_id: "call_todo", name: "update_todo", arguments: "{}", status: "completed" };
const reasoning = { type: "reasoning", id: "rs_test", encrypted_content: "opaque-test-only", summary: [] };
const message = { type: "message", id: "msg_answer", role: "assistant", status: "completed", content: [{ type: "output_text",
  text: "正常回答", annotations: [{ type: "url_citation", start_index: 0, end_index: 4, title: "官方资料", url: "https://example.test/source" }] }] };

function frame(event: object, separator = "\n\n") {
  return `event: ${(event as any).type}\ndata: ${JSON.stringify(event)}${separator}`;
}

function events(text: string): any[] {
  return text.split(/\r?\n\r?\n/).flatMap(block => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return [];
    try { return [JSON.parse(data)]; } catch { return []; }
  });
}

describe("Responses native search temporary compatibility", () => {
  it("projects only native search into bounded portable references without mutating tools, reasoning or citations", () => {
    const original = { id: "resp_test", status: "completed", output: [reasoning, search, tool, message] };
    const snapshot = JSON.stringify(original);
    const projected = projectSearchResponse(original);
    expect(projected.output.slice(0, 3)).toEqual([reasoning, tool, message]);
    expect(projected.output.some(item => item.type === "web_search_call")).toBe(false);
    const reference = projected.output[3];
    expect(reference.type).toBe("message");
    expect(reference.content[0].text).toContain("角色官方外观");
    expect(reference.content[0].text).toContain("https://example.test/source");
    expect(reference.content[0].text).toContain("https://example.test/image.png");
    expect(reference.content[0].text).toContain("参考图说明");
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("leaves responses without native search and unsupported JSON shapes untouched", () => {
    const original = { output: [tool, message] };
    expect(projectSearchResponse(original)).toBe(original);
    expect(projectSearchResponse({ error: "failed" })).toEqual({ error: "failed" });
    expect(projectSearchResponse(null)).toBeNull();
  });

  it("does not label incomplete searches as completed or alter an incomplete function call", () => {
    const incompleteTool = { ...tool, status: "incomplete", arguments: "{" };
    const projected = projectSearchResponse({ status: "incomplete", output: [{ ...search, status: "in_progress" }, incompleteTool] });
    expect(projected.status).toBe("incomplete");
    expect(projected.output[0]).toEqual(incompleteTool);
    expect(projected.output[1].content[0].text).toContain("in_progress");
    expect(projected.output[1].content[0].text).not.toContain("原生搜索已完成");
  });

  it("ignores arbitrary metadata and unsafe links, and never emits raw credential fields", () => {
    const projected = projectSearchResponse({ output: [{ ...search, access_token: "private-marker", action: {
      type: "search", sources: [{ url: "javascript:alert(1)" }, { url: "https://user:private-password@example.test/" },
        { url: "https://example.test/safe", title: "[title]*<html>" }],
    }, results: [] }] });
    const text = JSON.stringify(projected);
    expect(text).not.toMatch(/private-marker|private-password|javascript:|access_token/);
    expect(text).toContain("https://example.test/safe");
    expect(projected.output[0].content[0].text).toContain("\\[title\\]");
  });

  it("bounds large search metadata without cutting a Markdown URL in half", () => {
    const large = { ...search, action: { type: "search", query: "长".repeat(20000), sources: [] }, results: Array.from({ length: 20 }, (_, index) => ({
      url: `https://example.test/${index}/${"a".repeat(2500)}`, snippet: "内容".repeat(5000),
    })) };
    const projected = projectSearchResponse({ output: Array.from({ length: 100 }, (_, index) => ({ ...large, id: `ws_${index}` })) });
    const text = projected.output[0].content[0].text;
    expect(text.length).toBeLessThanOrEqual(16 * 1024);
    expect(text).toContain("省略");
    expect((text.match(/\]\(</g) ?? []).length).toBe((text.match(/>\)/g) ?? []).length);
  });

  it("removes only ws_ orphan outputs, preserving real ws_-named function pairs and unrelated malformed results", () => {
    const realCall = { ...tool, call_id: "ws_real_function" };
    const realResult = { type: "function_call_output", call_id: "ws_real_function", output: "正常工具结果" };
    const unrelated = { type: "function_call_output", call_id: "call_missing", output: "仍由上游明确报错" };
    const original = { input: [realCall, realResult, { type: "function_call_output", call_id: "ws_old_native", output: "旧版误执行" }, unrelated] };
    const snapshot = JSON.stringify(original);
    const prepared = prepareSearchInput(original);
    expect(prepared.removedOrphans).toBe(1);
    expect(prepared.body.input).toEqual([realCall, realResult, unrelated]);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(prepareSearchInput({ input: "plain prompt" }).removedOrphans).toBe(0);
  });

  it("sends generated reference IDs as ordinary text, without stripping real assistant IDs", () => {
    const reference = projectSearchResponse({ output: [search] }).output[0];
    const prepared = prepareSearchInput({ input: [reference, message] });
    expect(prepared.body.input[0].id).toBeUndefined();
    expect(prepared.body.input[0].content).toEqual(reference.content);
    expect(prepared.body.input[1]).toEqual(message);
    expect(reference.id).toMatch(/^msg_suboauth_search_/);
    const { type, ...implicitMessage } = reference;
    expect(prepareSearchInput({ input: [implicitMessage] }).body.input[0].id).toBeUndefined();
  });

  it.each([1, 7, 100000])("handles split SSE frames with chunk size %s while keeping normal events exact", chunkSize => {
    const stream = createSearchSseCompat();
    const ordinary = frame({ type: "response.output_item.done", output_index: 18, item: tool }, "\r\n\r\n");
    const raw = frame({ type: "response.output_item.added", output_index: 0, item: { ...search, status: "in_progress" } })
      + frame({ type: "response.web_search_call.searching", item_id: search.id, output_index: 0, sequence_number: 1 })
      + frame({ type: "response.output_item.done", output_index: 0, item: search }) + ordinary
      + frame({ type: "response.completed", response: { id: "resp_test", status: "completed", output: [reasoning, search, tool, message] } });
    let output = "";
    for (let index = 0; index < raw.length; index += chunkSize) output += stream.push(raw.slice(index, index + chunkSize));
    output += stream.flush();
    expect(output).toContain(ordinary);
    expect(output).toContain(": subscription-oauth native-search activity");
    const transformed = events(output);
    expect(transformed.some(event => event.item?.type === "web_search_call")).toBe(false);
    expect(transformed.some(event => event.type === "response.web_search_call.searching")).toBe(true);
    const terminal = transformed.find(event => event.type === "response.completed");
    expect(terminal.response.output.slice(0, 3)).toEqual([reasoning, tool, message]);
    expect(terminal.response.output.at(-1).content[0].text).toContain("https://example.test/image.png");
    const referenceAdded = transformed.find(event => event.type === "response.output_item.added" && event.item.id?.startsWith("msg_suboauth_search_"));
    expect(referenceAdded.output_index).toBe(19);
    expect(transformed.filter(event => event.type === "response.output_text.delta")).toHaveLength(1);
  });

  it("uses completed search snapshots when the terminal omits them", () => {
    const stream = createSearchSseCompat();
    const output = stream.push(frame({ type: "response.output_item.done", output_index: 0, item: search })
      + frame({ type: "response.completed", response: { id: "resp_test", status: "completed", output: [message] } }));
    expect(events(output).at(-1).response.output.at(-1).content[0].text).toContain("角色官方外观");
  });

  it("handles terminal-only searches and repeated terminal snapshots without duplicate reference deltas", () => {
    const stream = createSearchSseCompat();
    const terminal = frame({ type: "response.completed", response: { id: "resp_test", status: "completed", output: [search, tool] } });
    const transformed = events(stream.push(terminal + terminal));
    expect(transformed.filter(event => event.type === "response.output_text.delta")).toHaveLength(1);
    expect(transformed.filter(event => event.type === "response.completed").map(event => event.response.output)).toEqual([
      projectSearchResponse({ id: "resp_test", output: [search, tool] }).output,
      projectSearchResponse({ id: "resp_test", output: [search, tool] }).output,
    ]);
  });

  it("accepts multiline SSE data and flushes a last unterminated frame", () => {
    const stream = createSearchSseCompat();
    const data = JSON.stringify({ type: "response.completed", response: { id: "resp_test", status: "completed", output: [search] } });
    const split = data.indexOf(',"response"');
    const raw = `id: 12\nevent: response.completed\ndata: ${data.slice(0, split + 1)}\ndata: ${data.slice(split + 1)}`;
    expect(stream.push(raw)).toBe("");
    const output = stream.flush();
    expect(output).toContain("id: 12");
    expect(events(output).at(-1).response.output[0].type).toBe("message");
  });

  it("does not swallow error events or invent successful completion on cancellation", () => {
    const stream = createSearchSseCompat();
    const failure = frame({ type: "error", code: "forbidden", message: "Permission denied" });
    expect(stream.push(failure)).toBe(failure);
    const pending = stream.push(frame({ type: "response.output_item.added", output_index: 0, item: { ...search, status: "in_progress" } })) + stream.flush();
    expect(events(pending)).toEqual([]);
    const malformed = "event: extension\ndata: not-json\n\n: heartbeat\n\ndata: [DONE]\n\n";
    expect(stream.push(malformed)).toBe(malformed);
  });
});
