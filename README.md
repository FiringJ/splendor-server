# Splendor 服务端

NestJS + Socket.IO。人类玩家仍通过 `gameAction` 走 `GameService`；AI 回合在 `GameGateway.handleAITurn` 里决定下一步。

## AI 引擎

规则校验留在 `GameService`。Jev 只在已经枚举出的合法 `GameAction` 里做 Choice，不会自己发明动作。超时、HTTP 错误、非法选择，或没有密钥时，回退到现有的 `AIService.getNextAction`。

| 环境变量 | 作用 |
|---|---|
| `AI_ENGINE=heuristic` | 默认。只用启发式 AI。 |
| `AI_ENGINE=jev` | 用 TypeSafe Jev（OpenRouter Decisions，模型 `typesafe/jev-1.13`）选动作。 |
| `AI_ENGINE=shadow` | 仍由启发式落子，同时请求 Jev 并记下它的选择，方便对比。 |
| `OPENROUTER_API_KEY` | 只从服务端进程环境读取。不要写进仓库，也不要放到任何 `NEXT_PUBLIC_` 变量里。 |

本地跑一局 Jev AI：

```bash
export AI_ENGINE=jev
export OPENROUTER_API_KEY=你的密钥
pnpm dev
```

Docker Compose 会把这两个变量传进容器。没设置时 `AI_ENGINE` 仍是 `heuristic`，空的密钥不会被当成真密钥。

## CORS / 客户端来源 · CLIENT_ORIGIN

HTTP 与 Socket.IO 共用 `getCorsOrigins()`：

- 默认：`https://www.splendor.uno`、`http://localhost:3000`
- 临时允许任意 `*.fly.dev` 客户端（方便 Fly 预览）
- 额外来源用环境变量 `CLIENT_ORIGIN`（逗号分隔），例如：`https://your-client.fly.dev`

不要把 API 密钥写进仓库或 `CLIENT_ORIGIN`。

## 生产部署 · Fly.io（当前目标）

旧 VPS / SSH 流程已弃用；线上改用 Fly.io。仓库已含 `fly.toml` 与适配后的 `Dockerfile`（`PORT` / `HOST=0.0.0.0`，健康检查 `GET /health`）。房间状态在内存中，**请保持单机**：`min_machines_running = 1`，`fly scale count 1`。

### 中文

1. 安装 [flyctl](https://fly.io/docs/hands-on/install-flyctl/)，登录：`fly auth login`
2. 应用名优先 `splendor-server`；若已被占用则用 `firingj-splendor-server`（同时改 `fly.toml` 里的 `app`）
3. 首次创建并部署（二选一）：

```bash
# A) 已有 fly.toml：先建应用再部署
fly apps create splendor-server
# 若提示名称占用：
# fly apps create firingj-splendor-server
# 并把 fly.toml 的 app 改成 firingj-splendor-server

fly secrets set AI_ENGINE=jev OPENROUTER_API_KEY=你的OpenRouter密钥
# 可选：额外 CORS 来源（*.fly.dev 已默认放行）
# fly secrets set CLIENT_ORIGIN=https://your-client.fly.dev

fly deploy
```

```bash
# B) 交互式 launch（会读取本仓库 fly.toml；建议 --ha=false 保持单机）
fly launch --name splendor-server --ha=false --copy-config
# 按提示设置 secrets 后：
fly deploy
```

4. 之后每次发版：`fly deploy`
5. Socket.IO / WebSocket：Fly HTTP service 默认支持升级，路径仍为 `/socket.io`。客户端连 `https://<app>.fly.dev`（或自定义域名）。
6. 查看：`fly status` · `fly logs` · `fly secrets list`

### English

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/) and run `fly auth login`.
2. Preferred app name: `splendor-server`. If taken, use `firingj-splendor-server` and update `app` in `fly.toml`.
3. First-time create + deploy:

```bash
fly apps create splendor-server
# or: fly apps create firingj-splendor-server  (then set app= in fly.toml)

fly secrets set AI_ENGINE=jev OPENROUTER_API_KEY=your_openrouter_key
# optional extra CORS origins (*.fly.dev already allowed):
# fly secrets set CLIENT_ORIGIN=https://your-client.fly.dev

fly deploy
```

Alternative: `fly launch --name splendor-server --ha=false --copy-config` then `fly deploy`.

4. Later releases: `fly deploy` only.
5. WebSockets / Socket.IO work on Fly’s HTTP service (upgrade enabled by default); path remains `/socket.io`.
6. Never commit API keys — use `fly secrets set` only.

| Variable | Production (Fly) |
|---|---|
| `AI_ENGINE` | Set to `jev` via secrets when using Jev. |
| `OPENROUTER_API_KEY` | Required for `jev` / `shadow`. `fly secrets set` only — never in git. |
| `CLIENT_ORIGIN` | Optional comma-separated extra browser origins. |
| `PORT` / `HOST` | Set in `fly.toml` / image (`3001`, `0.0.0.0`). |

没有密钥时进程会回退到启发式 AI，服务仍能启动。

### 遗留：VPS / GitHub Actions（已弃用）

`.github/workflows/deploy.yml` 仍是旧的 SSH → VPS Compose 流程，迁移完成后可关掉该 workflow。线上客户端生产域仍为 `https://www.splendor.uno`（自定义域名可在 Fly 上绑定）。

请求地址是 `POST https://openrouter.ai/api/alpha/decisions`。Choice 的 `criteria` 必须是「选项 → 说明」的对象；把选项摊成和 `type` 平级的字段会返回 HTTP 400。

AI 广播的 `gameStateUpdate` 会多带一个可选的 `decisionMeta`。一次决策最多两次 Choice，默认超时约 2.5 秒。字段同时保留旧名字和客户端面板要读的名字：`actionKey` / `chosenOptionId`、`probs`（概率映射）/ `options`（`{ id, label, probability }`，按概率从高到低）、`model` / `modelId`、`actionType`、`chosenOptionLabel`、`latencyMs`、`source`（`jev` | `heuristic` | `forced`）、可选的 `fallbackReason`。

```bash
pnpm test
pnpm build
```
