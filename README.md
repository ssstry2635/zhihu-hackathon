# 见山另一面 · 可运行 Demo

基于《见山另一面｜四人开发 PRD v2》的四页代码框架。核心是 **真人分类讨论区 + Agent 圆桌**，通过“补充这个问题”把圆桌中的证据缺口带回真人讨论。

## 先运行

环境：Node.js 22.13+、pnpm（工程使用 pnpm 11 生成锁文件）。

```sh
pnpm install
pnpm db:migrate
pnpm dev
```

打开终端输出的本地地址，默认是 http://localhost:3000 。第一次安装需要下载 Cloudflare 的本地运行时，可能稍慢。项目已明确允许 esbuild、sharp、workerd 的依赖安装脚本。

无需知乎凭证也可以完整演示。讨论保存在项目本地 D1/SQLite 数据库中，刷新不会丢失；使用两个浏览器或普通窗口加无痕窗口即可模拟两名访客。

## 演示顺序

1. 问题现场：点击“见山另一面”，进入预置样本。
2. 观点总览：切换角度/立场，展开来源，进入“学习投入”。
3. 分类讨论：填写昵称，发布一段经历；另一浏览器回复和点赞。
4. Agent 圆桌：播放或查看完整讨论，追问一次。
5. 点击“补充这个问题”，发布经历或证据。
6. 返回圆桌刷新，查看补充数量；讨论区可查看已保存材料。

**所有预置来源、作者、发言和圆桌均是模拟或演示内容；不是实时采集的知乎原文。** 预置圆桌自由追问返回固定演示回应。实际发帖、回复、点赞、会话隔离和补充关联是真实服务端功能。

## 四人如何接手

| 负责人             | 主要目录                                                               | 接手重点                       |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------ |
| A · 入口/接入/集成 | `features/entry/`、`lib/server/zhihu.ts`、`app/api/`、`vite.config.ts` | 官方搜索、入口、部署与接口集成 |
| B · 分类/公共数据  | `features/overview/`、`shared/`、`lib/server/analysis.ts`              | 分类生成、样本、引用、统计口径 |
| C · 真人讨论       | `features/discussion/`、`lib/server/forum.ts`、`db/schema.ts`          | 身份、存储、发布回复与点赞     |
| D · Agent 圆桌     | `features/roundtable/`、`lib/server/roundtable.ts`                     | 角色编排、追问与待解问题       |

`shared/types.ts` 是共同数据契约。`shared/demo.ts` 是唯一预置样本来源。修改 ID、数据字段、数据库结构时先与依赖方同步。UI 公共组件在 `components/`，样式在 `app/globals.css`。

## 知乎官方接入

依据官方 skill **0.5.3-beta.20260904115023**，副本位于 `docs/zhihu-skill/`，接入说明见 [docs/ZHIHU-INTEGRATION.md](docs/ZHIHU-INTEGRATION.md)。

应用后端按官方 HTTP 文档调用，不依赖 CLI 已安装。CLI 是开发者查询和验收工具；当前工程不自动安装它，不会读取用户创作/收藏。

- 搜索：`GET https://developer.zhihu.com/api/v1/content/zhihu_search`，`Query` + `Count=10`。
- 直答：`POST https://developer.zhihu.com/v1/chat/completions`，仅传 `model/messages/stream`。
- 服务端凭证：`ZHIHU_ACCESS_SECRET`；模型：`ZHIHU_MODEL`，默认 `zhida-fast-1p5`。
- 没有凭证时实时入口不可用，服务端返回明确 503，不把失败伪装成实时结果。
- 摘要与精选评论不是完整回答，也不保证属于同一个知乎问题。
- 模型结果必须通过分类、ID、引用原句和阶段结构检查；不信任模型给出的数量。

**尚未使用团队凭证完成官方接口实测。** 角色质量、接口耗时和实际模型权限需要凭证到位后验证，不能把已写适配层等同真实接入已验收。

## 工程与存储

React 19 + TypeScript + Tailwind + Vinext/Vite；服务端运行于 Cloudflare Workers，本地使用同一模拟运行时。数据库为 D1/SQLite，原始 SQL 均使用参数绑定，Drizzle 只管理表结构和迁移。

访客身份由 HttpOnly、SameSite=Lax Cookie 持有，作者 ID 在服务端确定。它是演示访客身份，不是知乎 OAuth 账号。帖子、点赞、圆桌会话和来源快照存在数据库，浏览器 sessionStorage 仅保存未提交草稿。

```sh
pnpm typecheck
pnpm test:contracts
pnpm test:smoke
pnpm build
```

`test:smoke` 需要开发服务已启动，只允许访问 localhost/127.0.0.1，会新增标记为“本地验收”的帖子。它覆盖跨访客回复、点赞幂等、请求去重、圆桌隔离、追问额度、问题补充及错误路径。导航回归另见 scripts/navigation-checks.mjs：传入隔离的 Playwright page 和预览地址即可执行，不发布用户帖子。

修改 `db/schema.ts` 后运行 `pnpm db:generate`，检查生成迁移，再执行 `pnpm db:migrate`。已部署迁移不可改写；新增变更创建新迁移。

## 页面跳转说明

页面间使用原生链接，分析完成后通过完整页面导航进入总览，规避当前 Vinext 生产构建中 next/link 的运行时异常。圆桌、分类与 gap 参数保留；讨论草稿仍由 sessionStorage 恢复。

## 当前框架与完整 PRD 的差别

- 仅一个预置议题；未做真实浏览器插件、自由搜索入口或知乎 OAuth。
- 生成接口同步返回结果，页面保持等待；独立异步任务中心是后续增强。
- 真实搜索/分类和圆桌适配层已实现，但尚无团队凭证实测。
- 不自动将新增帖子重新注入模型；通过关联问题和材料列表展示补充。
- 访客模式用于演示；没有成熟社区的账户恢复、内容治理或通知系统。
- WebMCP 工具仅支持读取讨论和准备草稿，不会代用户发布；未在支持该 API 的浏览器中完成契约验证。

## 部署与代码仓库

`.openai/hosting.json` 记录 Sites 项目及逻辑数据库绑定，生产数据库由平台配置。后端凭证通过部署平台的安全配置注入。生成产物在 `dist/`，本地数据库在 `.wrangler/`，二者不应提交。

用户指定的目标仓库是 [ssstry2635/zhihu-hackathon](https://github.com/ssstry2635/zhihu-hackathon)。本次源码可单独放入该仓库根目录；尚未替用户推送该 GitHub 仓库。Sites 私有部署所需源代码保存与该 GitHub 仓库是不同操作。

PRD 见 [docs/PRD-v2.md](docs/PRD-v2.md)。

