import { fileURLToPath } from "node:url";

// 原版宿主默认不收集 examples/ 测试；独立配置不改变宿主测试入口。
export default {
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  test: {
    environment: "node",
    include: ["examples/subscription-oauth/test/responses-search-compat.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    watch: false,
  },
};
