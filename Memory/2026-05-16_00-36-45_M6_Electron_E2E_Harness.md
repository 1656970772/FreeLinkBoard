# M6 Electron E2E Harness

- 时间：2026-05-16 00:36:45
- 分支：main
- 基础提交：5e4c81f test: add M6 large file save stability

## 本次进展

- 执行 M6 Task 4：Electron E2E Harness。
- 安装 `@playwright/test`，新增 `playwright.config.ts` 与 `tests/e2e/freeLinkBoard.e2e.spec.ts`。
- 新增 `pretest:e2e` 与 `test:e2e` 脚本，避免 E2E 跑到陈旧 `out/` 构建产物。
- E2E 使用项目本地 Electron 可执行文件启动构建后的 `out/main/index.js`，避免首次运行下载 Playwright Electron binary。
- smoke 覆盖：启动首页、`window.freeLinkBoard` preload API、隔离 userData、新建 board、双击创建文本节点、`Ctrl+F` 搜索并高亮命中节点。
- 主进程支持 `FREELINKBOARD_USER_DATA_DIR`，用于 E2E 隔离近期文件目录。
- 主进程限制 `ELECTRON_RENDERER_URL` 只在非 packaged app 下生效。
- 因当前 preload 构建为 `.mjs`，显式设置 `sandbox: false` 以支持 ESM preload；后续可考虑改 CJS preload 恢复 renderer sandbox。
- `.gitignore` 增加 `test-results/`，避免 Playwright trace/output 进入提交。

## 多 Agent 结论

- 子代理确认 Task 4 主体目标已覆盖。
- 审查指出 `sandbox: false`、E2E 关闭断言和陈旧构建风险；已分别通过限制 dev URL、等待 Electron close、添加 `pretest:e2e` 修复。
- 最终复审无 Critical/Important；仅保留后续可选项：将 preload 改 CJS 后恢复 sandbox。

## 验证

- `npm.cmd test`：26 files / 191 tests passed。
- `npm.cmd run typecheck`：passed。
- `npm.cmd run build`：passed。
- `npm.cmd run test:e2e`：1 test passed，且先执行 `pretest:e2e` build。
- `git diff --check`：passed。
