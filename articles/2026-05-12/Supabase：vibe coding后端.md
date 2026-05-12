---
title: "Supabase：vibe coding后端"
date: "2026-05-12"
url: "https://mp.weixin.qq.com/s/N-g5W-gh_4HomEJcpOhgrw"
source: "wechat"
author: "Patrick"
tags: ["AI编程", "Supabase", "Postgres", "vibe coding", "agent"]
---

这篇文章把 Supabase 描述成“vibe coding 时代默认后端”的代表产品，核心理由是它同时踩中了两个大趋势：一是 Postgres 已经成为 AI/agent 时代最自然的数据库心智模型，二是 coding agent 正在成为新的主流开发入口。文章认为，随着 Claude Code、Codex、Cursor、Windsurf 等工具普及，后端选型越来越不是人类开发者亲自拍板，而是由 agent 在生成代码时自动倾向于成熟、易用、可直接落地的服务，而 Supabase 正好位于这一交叉点上。

文章回顾了 Supabase 的产品定位：它从一开始就是围绕 Postgres 打包 Auth、Storage、Realtime、Edge Functions、Vector 等能力的一站式后端，早期卖点是“开源版 Firebase”和“更简单的一站式 Postgres”。在 AI 时代，这种定位被进一步放大，因为大量模型预训练语料都包含了 Postgres 的官方文档、Stack Overflow、GitHub 示例，导致 agent 在数据库选择上天然更偏向 Postgres；而 Supabase 又是这个生态里最容易直接开箱使用的实现之一。

文章特别强调 Supabase 的分发优势。它不仅被 Lovable、Bolt、Figma 等 vibe coding 平台作为默认后端集成，还逐渐成为各类 coding agent 的推荐后端。作者认为，这不是单纯靠商务合作，而是 Supabase 在社区声量、示例密度、文档完整度、品牌认知上都很强，agent 在“先生成一个能跑的系统”时往往会优先想到它。

在增长与商业化方面，文章给出了一组非常乐观的数据：Supabase 在 2024 年 GA 后进入快速增长，2025 年后又受益于 AI 编程工具爆发，累计用户数和 ARR 都明显上升。文章还提到公司正在推进大额融资，并把 Supabase 视为资本市场中最具代表性的 AI 编程基础设施公司之一。

更重要的是，文章判断 Supabase 的路线图已经从“让人类开发者更容易用 Postgres”转向“让 agent 拥有更强的 Postgres capability”。对应地，Supabase 近年的动作开始偏向底层能力改造：收购 OrioleDB、推进 Multigres、构建更适合 agent 工作流的产品形态，以及推出面向 agent 的轻量化方案，如 PGlite、BKND / Supabase Lite。作者认为，agent 时代里人类友好型 dashboard 的护城河会递减，但底层 capability、可扩展性和默认推荐地位会越来越重要。

文章还分析了 Supabase 的扩展性布局。它承认原生 Postgres 在高负载场景下会遇到写入吞吐、VACUUM 维护、表膨胀、单机容量等限制，因此 Supabase 正在通过 OrioleDB 和 Multigres 两条路径做突破：前者偏向改造存储引擎、降低维护成本；后者偏向把 Vitess 式的水平扩展能力移植到 Postgres 生态，同时尽量不破坏 Auth、Storage 等配套能力。这说明 Supabase 不只是“好用的托管数据库”，而是在试图成为下一代 AI 原生后端平台。

整体来看，这篇文章的观点很明确：Supabase 之所以值得关注，不是因为它只是一个数据库或 BaaS，而是因为它正站在“AI coding + Postgres 标准化 + agent 自动选型”三股力量的交汇点上。它既是 vibe coding 的默认后端，也是 agentic engineering 时代最可能继续吃到红利的基础设施公司之一。