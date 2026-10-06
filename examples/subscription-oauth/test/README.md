# 1.3.5 独立回归

这个源码分支基于未修改宿主提交 `bcedee274f73ce2d0f63b5f56d952087b73e2b9d`，只增加插件产物和独立测试，不修改宿主。市场 PR 只提交生产文件；本目录不进入安装包。

## 测试语义

- `responses-search-compat.test.ts`：原生搜索转为有界参考文本；保留普通工具配对、引用及加密推理；只过滤没有真实函数配对的 `ws_...` 历史输出。包括 SSE 分片、终态、取消和不可信 URL 等边界。
- `native-search-host-verify.cjs`：调用指定原版宿主构建及其实际 AI SDK，通过本地代理模拟订阅上游。ChatGPT/Grok × 流式/非流式 × 仅搜索/搜索加普通工具，共 8 个场景。检查原生搜索不进入本地执行器、续轮没有孤立搜索输出、历史保存后链接不丢失，以及普通工具与加密推理保持完整。
- `e2e.cjs`、`image-generation-verify.cjs`、`verify.cjs`：已有协议代理、生图及基础自检回归。上游均使用模拟数据，不读取订阅凭据。
- `package-verify.cjs`：用指定原版宿主的实际安装器检查本地 ZIP，18 个生产文件须与源码逐字节相同，只使用临时安装目录。

这些是离线协议验证，不证明真实订阅上游会返回所有搜索字段，也不代表所有渠道的真实账号验收。用户已反馈 1.3.5 实测通过，未提供逐渠道、逐场景报告。

## 运行

在仓库根目录安装依赖后，可运行独立单元测试：

```powershell
pnpm install --frozen-lockfile
pnpm exec vitest run --config examples/subscription-oauth/test/vitest.config.mts
node examples/subscription-oauth/test/verify.cjs
node examples/subscription-oauth/test/e2e.cjs
node examples/subscription-oauth/test/image-generation-verify.cjs
```

原版宿主需已安装依赖并完成构建；将以下路径改成自己的原版宿主目录。测试不会修改该目录或使用真实订阅账号。

```powershell
node examples/subscription-oauth/test/native-search-host-verify.cjs D:/Cyrene-Agent
```

安装包验证前，在本源码仓库根目录生成本地 ZIP。正式市场包应由维护者从审核过的市场目录打包，本地验证 ZIP 不提交到市场仓库。

```powershell
New-Item -ItemType Directory -Path dist -Force | Out-Null
Compress-Archive -Path examples/subscription-oauth/manifest.json,examples/subscription-oauth/index.cjs,examples/subscription-oauth/ui.html,examples/subscription-oauth/README.md,examples/subscription-oauth/icon.png,examples/subscription-oauth/lib -DestinationPath dist/subscription-oauth-1.3.5.zip -Force
pnpm exec electron examples/subscription-oauth/test/package-verify.cjs D:/Cyrene-Agent
```
