import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const check = process.argv.slice(2).includes("--check");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--check");
if (unknownArgs.length) throw new Error(`未知参数：${unknownArgs.join(" ")}`);
const bundled = await build({
  stdin: {
    contents: 'export { VENDOR_REGISTRY } from "./src/shared/vendor-registry/index.ts"; export { renderAdaptedModelsMarkdown } from "./src/shared/vendor-registry/catalog-doc.ts"; export { validateModelCatalog } from "./src/shared/vendor-registry/validation.ts";',
    resolveDir: root, sourcefile: "adapted-models-entry.ts", loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false,
});
const { VENDOR_REGISTRY, renderAdaptedModelsMarkdown, validateModelCatalog } =
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const errors = validateModelCatalog(VENDOR_REGISTRY);
if (errors.length) throw new Error(`模型声明检查失败：\n${errors.join("\n")}`);
const output = path.join(root, "docs/references/adapted-models.md");
const content = renderAdaptedModelsMarkdown(VENDOR_REGISTRY);
if (check) {
  let current;
  try { current = await readFile(output, "utf8"); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error("适配清单不存在，请运行 pnpm run generate:adapted-models");
  }
  if (current.replace(/\r\n/g, "\n") !== content) {
    throw new Error("适配清单已过期，请运行 pnpm run generate:adapted-models 并提交文档");
  }
  console.log("模型声明与适配清单检查通过");
} else {
  await writeFile(output, content, "utf8");
  console.log("已生成 docs/references/adapted-models.md");
}
