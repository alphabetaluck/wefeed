# WeFeed

凯哥的信息流 —— 将每天读过的文章以 Markdown 格式保存，自动构建为静态站点并部署到 Cloudflare Pages。

- 线上地址：[feed.kai.ge](https://feed.kai.ge)
- Twitter：[@AlphaBetaLuck](https://x.com/AlphaBetaLuck)

## 功能

- 以信息流卡片形式展示文章摘要，支持点击标题查看详情页
- 支持按日期筛选
- 文章列表按文件修改时间排序，新增内容自动排在最前
- 新增文章后自动 git push，触发 Cloudflare Pages 构建静态站点
- 服务开机自启（systemd）

## 目录结构

```
wefeed/
├── articles/          # 文章内容（Markdown 文件）
│   └── 2026-04-17/
│       └── 文章标题.md
├── web/
│   ├── server.js      # Hono 本地预览服务器
│   ├── build.js       # 静态构建脚本，输出到 dist/
│   ├── index.html     # 本地预览前端
│   ├── watcher.js     # 文件监听，防抖 5 分钟后自动 git push
│   └── package.json
├── wrangler.toml      # Cloudflare Pages 配置
├── .gitignore
└── README.md
```

## 文章格式

每篇文章是一个 `.md` 文件，放在 `articles/` 根目录或 `YYYY-MM-DD/` 日期子目录下。

文件须包含 YAML front matter：

```yaml
---
title: 文章标题
url: https://原文链接
date: 2026-04-17
source: 来源名称
author: 作者名
tags:
  - AI
  - 技术
---

正文摘要内容（Markdown 格式）...
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 是 | 文章标题 |
| `url` | 否 | 原文链接 |
| `date` | 否 | 日期，放在日期子目录下时可省略 |
| `source` | 否 | 来源/媒体名称 |
| `author` | 否 | 作者名 |
| `tags` | 否 | 标签数组 |

## 本地预览

```bash
cd web
npm install
node server.js
# 访问 http://localhost:17777
```

## 系统服务

两个 systemd 服务，开机自动启动：

| 服务 | 说明 |
|------|------|
| `wefeed-server` | 本地预览服务器，端口 17777 |
| `wefeed-watcher` | 监听 articles/ 目录，5 分钟防抖后自动 git push |

```bash
# 查看状态
systemctl status wefeed-server wefeed-watcher

# 查看日志
journalctl -u wefeed-server -f
journalctl -u wefeed-watcher -f

# 重启
sudo systemctl restart wefeed-server
sudo systemctl restart wefeed-watcher
```

## 自动构建流程

```
新增/修改 articles/ 下的 .md 文件
        ↓
watcher 检测到变化，重置 5 分钟防抖计时器
        ↓
5 分钟内无新变化
        ↓
git add . → git commit → git push
        ↓
Cloudflare Pages 自动触发 node build.js
        ↓
生成 dist/ 静态文件并部署
```

## Cloudflare Pages 构建配置

| 配置项 | 值 |
|--------|-----|
| Build command | `cd web && npm install && node build.js` |
| Build output directory | `dist` |

## 技术栈

- **本地服务**：Node.js + [Hono](https://hono.dev/)
- **静态构建**：自定义 `build.js`（无框架依赖）
- **部署**：Cloudflare Pages
- **Markdown 解析**：gray-matter（front matter）+ 自定义正则渲染
- **字体**：Noto Serif SC / Noto Sans SC
