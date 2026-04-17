#!/usr/bin/env node

/**
 * build.js
 * 将 articles/ 目录下的 Markdown 文件构建为静态 HTML，输出到 dist/
 *
 * 输出结构：
 *   dist/index.html          文章列表页
 *   dist/article/[slug].html 每篇文章独立页
 */

const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { execSync } = require('child_process')

const ARTICLES_ROOT = path.resolve(__dirname, '../articles')
const DIST_DIR = path.resolve(__dirname, '../dist')
const REPO_ROOT = path.resolve(__dirname, '..')

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function formatDate(raw) {
  if (!raw) return ''
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  return String(raw).slice(0, 10)
}

function slugify(str) {
  // Use raw title (with Chinese chars) as slug so CF Pages can match directory
  // names directly after URL-decoding the request path.
  return str.trim().replace(/\s+/g, '-')
}

function log(msg) {
  console.log(`[build] ${msg}`)
}

// 获取文件的 git 首次提交时间戳（秒），不在 git 仓库或未提交则降级用 mtime
function getGitCtime(filePath) {
  try {
    const rel = path.relative(REPO_ROOT, filePath)
    const out = execSync(
      `git log --diff-filter=A --follow --format="%ct" -- "${rel}"`,
      { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'ignore'] }
    ).toString().trim()
    const ts = parseInt(out.split('\n').pop(), 10)
    if (!isNaN(ts)) return ts * 1000
  } catch (_) {}
  return fs.statSync(filePath).mtimeMs
}

// ─── 读取文章 ────────────────────────────────────────────────────────────────

function getArticles() {
  const result = []

  function parseFile(filePath, fallbackDate) {
    try {
      const { data, content } = matter(fs.readFileSync(filePath, 'utf-8'))
      if (!data.title) return null
      return {
        title: data.title,
        url: data.url || '',
        date: formatDate(data.date) || fallbackDate || '',
        source: data.source || '',
        author: data.author || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        content: content.trim(),
        slug: slugify(data.title),
        ctime: getGitCtime(filePath),
      }
    } catch (e) {
      console.error(`[error] ${filePath}:`, e.message)
      return null
    }
  }

  for (const entry of fs.readdirSync(ARTICLES_ROOT)) {
    const entryPath = path.join(ARTICLES_ROOT, entry)
    const stat = fs.statSync(entryPath)

    if (stat.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry)) {
      for (const file of fs.readdirSync(entryPath)) {
        if (!file.endsWith('.md')) continue
        const art = parseFile(path.join(entryPath, file), entry)
        if (art) result.push(art)
      }
    } else if (!stat.isDirectory() && entry.endsWith('.md')) {
      const art = parseFile(entryPath, '')
      if (art) result.push(art)
    }
  }

  // 先按 date 降序，同一天内再按 git 首次提交时间降序（最新提交排最前）
  return result.sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return b.ctime - a.ctime
  })
}

// ─── Markdown 渲染（与 index.html 前端保持一致）────────────────────────────

function parseMd(text) {
  if (!text) return ''
  return text
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[\*-] (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
}

// ─── HTML 模板 ───────────────────────────────────────────────────────────────

const CSS = `
  :root {
    --parchment: #f5f4ed;
    --ivory: #faf9f5;
    --white: #ffffff;
    --warm-sand: #e8e6dc;
    --dark-surface: #30302e;
    --deep-dark: #141413;
    --anthropic-near-black: #141413;
    --charcoal-warm: #4d4c48;
    --olive-gray: #5e5d59;
    --stone-gray: #87867f;
    --warm-silver: #b0aea5;
    --border-cream: #f0eee6;
    --border-warm: #e8e6dc;
    --terracotta: #c96442;
    --coral: #d97757;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Noto Sans SC", Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: var(--anthropic-near-black);
    background: var(--parchment);
  }
  .container { max-width: 800px; margin: 0 auto; padding: 0 24px; }
  header {
    position: sticky; top: 0;
    background: var(--parchment);
    border-bottom: 1px solid var(--border-cream);
    padding: 16px 0; z-index: 100;
  }
  .header-content { display: flex; align-items: center; justify-content: space-between; }
  .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .header-links { display: flex; align-items: center; gap: 8px; }
  .header-link {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 13px; color: var(--stone-gray);
    text-decoration: none; padding: 6px 10px;
    border: 1px solid var(--border-warm); border-radius: 8px;
    background: var(--warm-sand); transition: all 0.15s ease;
  }
  .header-link:hover { background: var(--white); color: var(--anthropic-near-black); box-shadow: 0 0 0 1px var(--border-warm); }
  .logo {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 24px; font-weight: 500;
    color: var(--anthropic-near-black);
    letter-spacing: -0.02em;
    text-decoration: none;
  }
  .date-filter { display: flex; gap: 8px; flex-wrap: wrap; }
  .date-filter a {
    font-family: "Noto Sans SC", Arial, sans-serif;
    font-size: 14px; padding: 6px 12px;
    border: 1px solid var(--border-warm);
    border-radius: 8px; background: var(--warm-sand);
    color: var(--charcoal-warm);
    text-decoration: none;
    transition: all 0.15s ease;
  }
  .date-filter a:hover { background: var(--white); box-shadow: 0 0 0 1px var(--border-warm); }
  .date-filter a.active { background: var(--anthropic-near-black); color: var(--warm-silver); border-color: var(--dark-surface); }
  main { padding: 40px 0 80px; }
  .feed-header { margin-bottom: 40px; }
  .feed-title {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 36px; font-weight: 500;
    line-height: 1.2; color: var(--anthropic-near-black); margin-bottom: 12px;
  }
  .feed-subtitle { font-size: 17px; color: var(--olive-gray); }
  .feed-item {
    background: var(--ivory);
    border: 1px solid var(--border-cream);
    border-radius: 16px; padding: 24px; margin-bottom: 24px;
    transition: all 0.2s ease;
  }
  .feed-item:hover { box-shadow: 0 4px 24px rgba(0,0,0,0.05); }
  .feed-source {
    font-size: 12px; font-weight: 500;
    letter-spacing: 0.12px; text-transform: uppercase;
    color: var(--stone-gray); margin-bottom: 8px;
  }
  .feed-item-title {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 20px; font-weight: 500;
    line-height: 1.3; color: var(--anthropic-near-black); margin-bottom: 12px;
  }
  .feed-item-title a { color: inherit; text-decoration: none; }
  .feed-item-title a:hover { color: var(--terracotta); }
  .feed-source-link {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 14px; color: var(--terracotta);
    text-decoration: none; margin-bottom: 12px;
  }
  .feed-source-link:hover { color: var(--coral); }
  .feed-source-link::after { content: "↗"; font-size: 12px; }
  .feed-summary { font-size: 16px; line-height: 1.7; color: var(--olive-gray); }
  .feed-summary p { margin-bottom: 12px; }
  .feed-summary p:last-child { margin-bottom: 0; }
  .feed-summary h2, .feed-summary h3, .feed-summary h4 {
    font-family: "Noto Serif SC", Georgia, serif;
    font-weight: 500; margin: 16px 0 8px;
    color: var(--anthropic-near-black);
  }
  .feed-summary h2 { font-size: 20px; }
  .feed-summary h3 { font-size: 18px; }
  .feed-summary h4 { font-size: 16px; }
  .feed-summary strong { color: var(--anthropic-near-black); font-weight: 500; }
  .feed-summary code {
    font-family: "SF Mono", monospace; font-size: 14px;
    background: var(--warm-sand); padding: 2px 6px;
    border-radius: 4px; color: var(--terracotta);
  }
  .feed-summary a { color: var(--terracotta); text-decoration: none; }
  .feed-summary a:hover { text-decoration: underline; }
  .feed-summary blockquote {
    border-left: 3px solid var(--terracotta);
    padding-left: 12px; margin: 12px 0;
    color: var(--stone-gray); font-style: italic;
  }
  .feed-summary ul { margin: 8px 0; padding-left: 20px; }
  .feed-summary li { margin: 4px 0; }
  .feed-meta {
    display: flex; gap: 16px; flex-wrap: wrap;
    margin-top: 16px; padding-top: 16px;
    border-top: 1px solid var(--border-cream);
  }
  .feed-tag { font-size: 12px; color: var(--stone-gray); }
  .feed-author { font-size: 12px; color: var(--stone-gray); }
  .feed-date { font-size: 12px; color: var(--stone-gray); }
  .section-divider { width: 100%; height: 1px; background: var(--border-warm); margin: 48px 0; }
  .back-link {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 14px; color: var(--stone-gray);
    text-decoration: none; margin-bottom: 32px;
  }
  .back-link:hover { color: var(--anthropic-near-black); }
  .article-header { margin-bottom: 32px; }
  .article-title {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 32px; font-weight: 500;
    line-height: 1.3; color: var(--anthropic-near-black); margin-bottom: 16px;
  }
  .article-body {
    background: var(--ivory);
    border: 1px solid var(--border-cream);
    border-radius: 16px; padding: 32px;
    font-size: 16px; line-height: 1.8; color: var(--olive-gray);
  }
  footer { border-top: 1px solid var(--border-cream); padding: 24px 0; }
  .footer-text { font-size: 13px; color: var(--stone-gray); }
  @media (max-width: 640px) {
    .feed-title { font-size: 28px; }
    .feed-item { padding: 20px; border-radius: 12px; }
    .feed-item-title { font-size: 18px; }
    .header-content { flex-direction: column; gap: 12px; }
    .logo { font-size: 20px; }
    .article-title { font-size: 24px; }
    .article-body { padding: 20px; }
  }
`

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500&family=Noto+Sans+SC:wght@400;500&display=swap" rel="stylesheet">`

const GITHUB_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>`

const TWITTER_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`

function footer() {
  return `
  <footer>
    <div class="container">
      <span class="footer-text">凯哥的信息流 · 每天读过文章的摘要整理</span>
    </div>
  </footer>`
}

function headerLinks(dateFilterHtml = '') {
  return `
      <div class="header-top">
        <a href="/" class="logo">凯哥的信息流</a>
        <div class="header-links">
          <a href="https://x.com/AlphaBetaLuck" class="header-link" target="_blank" rel="noopener">
            ${TWITTER_SVG} Twitter
          </a>
          <a href="https://github.com/alphabetaluck/wefeed" class="header-link" target="_blank" rel="noopener">
            ${GITHUB_SVG} 开源
          </a>
        </div>
      </div>
      ${dateFilterHtml}`
}

// ─── 生成列表页 index.html ───────────────────────────────────────────────────

function buildIndex(articles) {
  const dates = [...new Set(articles.map(a => a.date))].sort().reverse()

  const dateFilterHtml = [
    `<a href="/" class="active">全部</a>`,
    ...dates.map(d => `<a href="/date/${d}/">${d}</a>`)
  ].join('\n          ')

  const dateFilter = `<div class="date-filter">${dateFilterHtml}</div>`

  let feedHtml = ''
  articles.forEach((item, i) => {
    if (i > 0 && item.date !== articles[i - 1].date) {
      feedHtml += '<div class="section-divider"></div>\n'
    }
    feedHtml += articleCard(item)
  })

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>凯哥的信息流</title>
  ${FONT_LINK}
  <style>${CSS}</style>
</head>
<body>
  <header>
    <div class="container">
      ${headerLinks(`<div class="date-filter">${dateFilterHtml}</div>`)}
    </div>
  </header>
  <main>
    <div class="container">
      <div class="feed-header">
        <h1 class="feed-title">今日阅读</h1>
        <p class="feed-subtitle">每天读过文章的摘要整理</p>
      </div>
      <div id="feedList">
        ${feedHtml}
      </div>
    </div>
  </main>
  ${footer()}
</body>
</html>`
}

// ─── 生成日期筛选页 /date/YYYY-MM-DD/index.html ──────────────────────────────

function buildDatePage(date, articles, allDates) {
  const filtered = articles.filter(a => a.date === date)

  const dateFilterHtml = [
    `<a href="/">全部</a>`,
    ...allDates.map(d => `<a href="/date/${d}/" ${d === date ? 'class="active"' : ''}>${d}</a>`)
  ].join('\n          ')

  const feedHtml = filtered.map(item => articleCard(item)).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${date} - 凯哥的信息流</title>
  ${FONT_LINK}
  <style>${CSS}</style>
</head>
<body>
  <header>
    <div class="container">
      ${headerLinks(`<div class="date-filter">${dateFilterHtml}</div>`)}
    </div>
  </header>
  <main>
    <div class="container">
      <div class="feed-header">
        <h1 class="feed-title">${date}</h1>
        <p class="feed-subtitle">共 ${filtered.length} 篇</p>
      </div>
      <div id="feedList">
        ${feedHtml}
      </div>
    </div>
  </main>
  ${footer()}
</body>
</html>`
}

// ─── 生成文章详情页 /article/[slug]/index.html ───────────────────────────────

function buildArticlePage(article) {
  const bodyHtml = parseMd(article.content)
  const tagsHtml = article.tags.map(t => `<span class="feed-tag">${t}</span>`).join('')
  const urlHtml = article.url
    ? `<a href="${article.url}" class="feed-source-link" target="_blank" rel="noopener">原文链接</a>`
    : ''
  const authorHtml = article.author
    ? `<span class="feed-author">✍ ${article.author}</span>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.title} - 凯哥的信息流</title>
  ${FONT_LINK}
  <style>${CSS}</style>
</head>
<body>
  <header>
    <div class="container">
      ${headerLinks('')}
    </div>
  </header>
  <main>
    <div class="container">
      <a href="/" class="back-link">← 返回列表</a>
      <div class="article-header">
        <div class="feed-source">${article.source || '未知来源'}</div>
        <h1 class="article-title">${article.title}</h1>
        ${urlHtml}
        <div class="feed-meta">
          ${authorHtml}
          ${tagsHtml}
          <span class="feed-date">${article.date}</span>
        </div>
      </div>
      <div class="article-body feed-summary">
        <p>${bodyHtml}</p>
      </div>
    </div>
  </main>
  ${footer()}
</body>
</html>`
}

// ─── 文章卡片（列表页复用）───────────────────────────────────────────────────

function articleCard(item) {
  const bodyHtml = parseMd(item.content)
  const tagsHtml = item.tags.map(t => `<span class="feed-tag">${t}</span>`).join('')
  const urlHtml = item.url
    ? `<a href="${item.url}" class="feed-source-link" target="_blank" rel="noopener">原文链接</a>`
    : ''
  const authorHtml = item.author
    ? `<span class="feed-author">✍ ${item.author}</span>`
    : ''

  return `
  <article class="feed-item">
    <div class="feed-source">${item.source || '未知来源'}</div>
    <h2 class="feed-item-title">
      <a href="/article/${item.slug}/">${item.title}</a>
    </h2>
    ${urlHtml}
    <div class="feed-summary"><p>${bodyHtml}</p></div>
    <div class="feed-meta">
      ${authorHtml}
      ${tagsHtml}
      <span class="feed-date">${item.date}</span>
    </div>
  </article>`
}

// ─── 主构建流程 ──────────────────────────────────────────────────────────────

function build() {
  log('开始构建...')
  log(`articles 目录: ${ARTICLES_ROOT}`)
  log(`输出目录: ${DIST_DIR}`)

  // 清理并重建 dist/
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true })
  }
  fs.mkdirSync(DIST_DIR, { recursive: true })
  fs.mkdirSync(path.join(DIST_DIR, 'article'), { recursive: true })
  fs.mkdirSync(path.join(DIST_DIR, 'date'), { recursive: true })

  const articles = getArticles()
  log(`读取到 ${articles.length} 篇文章`)

  // 生成 index.html
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildIndex(articles), 'utf-8')
  log('生成 index.html')

  // 生成日期页
  const dates = [...new Set(articles.map(a => a.date))].sort().reverse()
  for (const date of dates) {
    const dir = path.join(DIST_DIR, 'date', date)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), buildDatePage(date, articles, dates), 'utf-8')
    log(`生成 date/${date}/index.html`)
  }

  // 生成文章详情页
  for (const article of articles) {
    const dir = path.join(DIST_DIR, 'article', article.slug)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), buildArticlePage(article), 'utf-8')
    log(`生成 article/${article.slug}/index.html`)
  }

  log(`\n构建完成，共生成 ${1 + dates.length + articles.length} 个 HTML 文件`)
}

build()
