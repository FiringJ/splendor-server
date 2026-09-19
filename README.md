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

## 生产部署

线上客户端访问 `https://www.splendor.uno`。`.github/workflows/deploy.yml` 在推送到 `main`，以及手动 `workflow_dispatch` 时部署。仓库根目录就是服务端，工作流不能再按 `splendor-server/**` 过滤路径，否则推送到 `main` 不会触发部署。

部署仍走原来的 SSH 流程：Actions 构建镜像，`scp` 到 VPS 的 `/root/splendor-server/image.tar`，再由远程脚本 `docker load` 后执行 `docker-compose up -d`。

生产 Compose 已经支持 `AI_ENGINE` 和 `OPENROUTER_API_KEY`。VPS 必须把这两项放在 `/root/splendor-server/.env`（或等价的 compose 环境）里，Compose 才会替换进容器。不要把真实密钥提交到仓库。

| 变量 | 生产 |
|---|---|
| `AI_ENGINE` | 要用 Jev 时设为 `jev`。`.env` 里没有这项时，Compose 默认是 `heuristic`。 |
| `OPENROUTER_API_KEY` | `jev` / `shadow` 必需。只放在 VPS 的 `.env`，或 GitHub Actions secret `OPENROUTER_API_KEY` 里。 |

部署脚本只在 secret 存在时改远程 `.env`：

- 若 GitHub Actions 配置了 secret `OPENROUTER_API_KEY`，部署会把它写入 `/root/splendor-server/.env`，并设置 `AI_ENGINE=jev`。日志不打印密钥。
- 若没有这个 secret，脚本不会编造密钥，也不会改 `AI_ENGINE`。镜像照常发布，未设置时 Compose 默认仍是 `heuristic`。部署日志会留下这一步，需要在 VPS 上补配置后重建容器：

```bash
cd /root/splendor-server
# 编辑 .env：
#   AI_ENGINE=jev
#   OPENROUTER_API_KEY=<OpenRouter 密钥>
docker-compose up -d --force-recreate
```

没有密钥时进程会回退到启发式 AI，服务仍能启动。

请求地址是 `POST https://openrouter.ai/api/alpha/decisions`。Choice 的 `criteria` 必须是「选项 → 说明」的对象；把选项摊成和 `type` 平级的字段会返回 HTTP 400。

AI 广播的 `gameStateUpdate` 会多带一个可选的 `decisionMeta`。一次决策最多两次 Choice，默认超时约 2.5 秒。字段同时保留旧名字和客户端面板要读的名字：`actionKey` / `chosenOptionId`、`probs`（概率映射）/ `options`（`{ id, label, probability }`，按概率从高到低）、`model` / `modelId`、`actionType`、`chosenOptionLabel`、`latencyMs`、`source`（`jev` | `heuristic` | `forced`）、可选的 `fallbackReason`。

```bash
pnpm test
pnpm build
```
