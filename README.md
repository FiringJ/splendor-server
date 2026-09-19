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

请求地址是 `POST https://openrouter.ai/api/alpha/decisions`。Choice 的 `criteria` 必须是「选项 → 说明」的对象；把选项摊成和 `type` 平级的字段会返回 HTTP 400。

AI 广播的 `gameStateUpdate` 会多带一个可选的 `decisionMeta`：`actionKey`、`probs`、`model`、`latencyMs`、`source`（`jev` | `heuristic` | `forced`）。客户端可以先忽略它。一次决策最多两次 Choice，默认超时约 2.5 秒。

```bash
pnpm test
pnpm build
```
