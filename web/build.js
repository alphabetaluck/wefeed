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
const crypto = require('crypto')
const matter = require('gray-matter')
const { execSync } = require('child_process')

const ARTICLES_ROOT = path.resolve(__dirname, '../articles')
const DIST_DIR = path.resolve(__dirname, '../dist')
const REPO_ROOT = path.resolve(__dirname, '..')
const PAGE_SIZE = 15
const SITE_BASE = 'https://feed.kai.ge'

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function formatDate(raw) {
  if (!raw) return ''
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  return String(raw).slice(0, 10)
}

// 生成纯 ASCII 短 hash slug（8 字符 hex），避免中文路径在 CF Workers 上 404
function slugify(str) {
  return crypto.createHash('md5').update(str.trim()).digest('hex').slice(0, 8)
}

// tag 名 → 纯 ASCII slug
function tagSlug(tag) {
  // 纯 ASCII tag 直接用原名（小写化、空格转连字符）
  if (/^[\x20-\x7e]+$/.test(tag)) {
    return tag.trim().toLowerCase().replace(/\s+/g, '-')
  }
  return crypto.createHash('md5').update(tag.trim()).digest('hex').slice(0, 8)
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
      const ctime = getGitCtime(filePath)
      // date 始终取所在目录名（即 articles/YYYY-MM-DD/），目录名即归档日期
      return {
        title: data.title,
        url: data.url || '',
        date: fallbackDate || new Date(ctime).toISOString().slice(0, 10),
        source: data.source || '',
        author: data.author || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        content: content.trim().replace(/^"""\n?/, '').replace(/\n?"""$/, '').trim(),
        slug: slugify(data.title),
        ctime,
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

  // 行内替换
  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  }

  const lines = text.split('\n')
  const out = []
  let ulBuf = []   // 无序列表缓冲
  let olBuf = []   // 有序列表缓冲

  function flushUl() {
    if (ulBuf.length) {
      out.push('<ul>' + ulBuf.map(l => `<li>${l}</li>`).join('') + '</ul>')
      ulBuf = []
    }
  }
  function flushOl() {
    if (olBuf.length) {
      out.push('<ol>' + olBuf.map(l => `<li>${l}</li>`).join('') + '</ol>')
      olBuf = []
    }
  }

  for (const raw of lines) {
    const line = raw

    // 标题
    const h3 = line.match(/^### (.+)$/)
    const h2 = line.match(/^## (.+)$/)
    const h1 = line.match(/^# (.+)$/)
    if (h3 || h2 || h1) {
      flushUl(); flushOl()
      const level = h3 ? 4 : h2 ? 3 : 2
      const content = h3 ? h3[1] : h2 ? h2[1] : h1[1]
      out.push(`<h${level}>${inline(content)}</h${level}>`)
      continue
    }

    // blockquote
    const bq = line.match(/^> (.+)$/)
    if (bq) {
      flushUl(); flushOl()
      out.push(`<blockquote>${inline(bq[1])}</blockquote>`)
      continue
    }

    // 无序列表
    const ul = line.match(/^[\*\-] (.+)$/)
    if (ul) {
      flushOl()
      ulBuf.push(inline(ul[1]))
      continue
    }

    // 有序列表
    const ol = line.match(/^(\d+)\. (.+)$/)
    if (ol) {
      flushUl()
      olBuf.push(inline(ol[2]))
      continue
    }

    // 空行：结束列表，段落分隔
    if (line.trim() === '') {
      flushUl(); flushOl()
      out.push('')   // 空行标记段落边界
      continue
    }

    // 普通段落行
    flushUl(); flushOl()
    out.push(inline(line))
  }

  flushUl(); flushOl()

  // 将连续非空行合并为 <p>，空行分隔段落
  const chunks = out.join('\n').split(/\n{2,}/)
  return chunks.map(chunk => {
    chunk = chunk.trim()
    if (!chunk) return ''
    // 已经是块级标签则直接输出
    if (/^<(h[2-4]|ul|ol|blockquote)/.test(chunk)) return chunk
    // 普通文本包 <p>，过滤掉段落内的空行
    const inner = chunk.split('\n').filter(l => l.trim()).join('<br>')
    return `<p>${inner}</p>`
  }).filter(Boolean).join('\n')
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
  .date-filter { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
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
  .date-filter .date-hidden { display: none; }
  .date-filter.expanded .date-hidden { display: inline-flex; }
  .date-toggle {
    font-size: 13px; padding: 6px 10px;
    border: 1px dashed var(--border-warm);
    border-radius: 8px; background: transparent;
    color: var(--stone-gray); cursor: pointer;
    transition: all 0.15s ease; white-space: nowrap;
    font-family: "Noto Sans SC", Arial, sans-serif;
  }
  .date-toggle:hover { background: var(--white); color: var(--charcoal-warm); }
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
    line-height: 1.3; color: var(--anthropic-near-black); margin-bottom: 8px;
  }
  .feed-item-title a { color: inherit; text-decoration: none; }
  .feed-item-title a:hover { color: var(--terracotta); }
  .feed-source-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 13px; color: var(--terracotta);
    text-decoration: none;
  }
  .feed-source-link:hover { color: var(--coral); }
  .feed-source-link::after { content: "↗"; font-size: 11px; }
  .feed-summary { font-size: 15px; line-height: 1.7; color: var(--olive-gray); margin-top: 14px; }
  .feed-summary p { margin-bottom: 10px; }
  .feed-summary p:last-child { margin-bottom: 0; }
  .feed-summary h2, .feed-summary h3, .feed-summary h4 {
    font-family: "Noto Serif SC", Georgia, serif;
    font-weight: 500; margin: 20px 0 4px;
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
  .feed-summary ul, .feed-summary ol { margin: 8px 0 8px 1.8em; padding: 0; list-style-position: outside; }
  .feed-summary li { margin: 4px 0; padding-left: 4px; }
  .article-body {
    background: var(--ivory);
    border: 1px solid var(--border-cream);
    border-radius: 16px; padding: 32px;
    font-size: 16px; line-height: 1.8; color: var(--olive-gray);
  }
  .article-body p { margin-bottom: 10px; }
  .article-body p:last-child { margin-bottom: 0; }
  .article-body h2, .article-body h3, .article-body h4 {
    font-family: "Noto Serif SC", Georgia, serif;
    font-weight: 500; margin: 20px 0 4px;
    color: var(--anthropic-near-black);
  }
  .article-body h2 { font-size: 22px; }
  .article-body h3 { font-size: 19px; }
  .article-body h4 { font-size: 17px; }
  .article-body strong { color: var(--anthropic-near-black); font-weight: 500; }
  .article-body ul, .article-body ol { margin: 8px 0 8px 1.8em; padding: 0; list-style-position: outside; }
  .article-body li { margin: 4px 0; padding-left: 4px; }
  .article-body blockquote {
    border-left: 3px solid var(--terracotta);
    padding-left: 12px; margin: 12px 0;
    color: var(--stone-gray); font-style: italic;
  }
  .article-body code {
    font-family: "SF Mono", monospace; font-size: 14px;
    background: var(--warm-sand); padding: 2px 6px;
    border-radius: 4px; color: var(--terracotta);
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
  .feed-tag {
    font-size: 12px; color: var(--stone-gray);
    background: var(--parchment); border: 1px solid var(--border-cream);
    border-radius: 4px; padding: 2px 8px;
    text-decoration: none; transition: all 0.15s ease;
  }
  .feed-tag:hover { background: var(--white); color: var(--anthropic-near-black); border-color: var(--border-warm); }
  .feed-author { font-size: 13px; color: var(--stone-gray); }
  .feed-date { font-size: 13px; color: var(--stone-gray); }
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
    line-height: 1.3; color: var(--anthropic-near-black); margin-bottom: 10px;
  }
  .article-meta-line {
    display: flex; align-items: center;
    gap: 8px; margin-bottom: 16px;
    font-size: 13px; color: var(--stone-gray);
  }
  .feed-source-author { color: var(--stone-gray); font-size: 13px; }
  .article-meta-line .feed-source-link { color: var(--terracotta); font-size: 13px; margin-bottom: 0; margin-left: auto; }
  .article-meta-line .feed-date { color: var(--stone-gray); font-size: 13px; margin-left: auto; }
  .feed-tags {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
    margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-cream);
  }
  .feed-tags .feed-date { margin-left: auto; font-size: 13px; color: var(--stone-gray); }
  .article-body {
    background: var(--ivory);
    border: 1px solid var(--border-cream);
    border-radius: 16px; padding: 32px;
    font-size: 16px; line-height: 1.8; color: var(--olive-gray);
  }
  footer { border-top: 1px solid var(--border-cream); padding: 24px 0; }
  .footer-text { font-size: 13px; color: var(--stone-gray); }
  .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 48px 0 24px; flex-wrap: wrap; }
  .pagination a, .pagination span {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 36px; height: 36px; padding: 0 10px;
    border-radius: 8px; font-size: 14px; font-family: var(--font-sans); text-decoration: none;
    border: 1px solid var(--border-warm); color: var(--olive-gray);
    transition: background 0.15s, color 0.15s;
  }
  .pagination a:hover { background: var(--parchment-mid); color: var(--ink-dark); }
  .pagination .current { background: var(--terracotta); color: #fff; border-color: var(--terracotta); font-weight: 500; }
  .pagination .disabled { opacity: 0.35; pointer-events: none; }
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
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500&family=Noto+Sans+SC:wght@400;500&display=swap" rel="stylesheet">
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-CJKTLET93E"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-CJKTLET93E');
  </script>`

const GITHUB_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>`

const TWITTER_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`

function footer() {
  return `
  <footer>
    <div class="container">
      <span class="footer-text">古法信息流 · 每天读过文章的摘要整理</span>
    </div>
  </footer>`
}

function headerLinks(dateFilterHtml = '') {
  return `
      <div class="header-top">
        <a href="/" class="logo">古法信息流</a>
        <div class="header-links">
          <a href="/tags/" class="header-link">标签</a>
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

// ─── 生成列表页（支持分页）────────────────────────────────────────────────────

function paginationHtml(pageNum, totalPages) {
  if (totalPages <= 1) return ''
  const prev = pageNum > 1
    ? `<a href="${pageNum === 2 ? '/' : `/page/${pageNum - 1}/`}">← 上一页</a>`
    : `<span class="disabled">← 上一页</span>`
  const next = pageNum < totalPages
    ? `<a href="/page/${pageNum + 1}/">下一页 →</a>`
    : `<span class="disabled">下一页 →</span>`

  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === pageNum) {
      pages.push(`<span class="current">${i}</span>`)
    } else {
      const href = i === 1 ? '/' : `/page/${i}/`
      pages.push(`<a href="${href}">${i}</a>`)
    }
  }
  return `<div class="pagination">${prev}${pages.join('')}${next}</div>`
}

const DATE_FOLD = 5  // 默认展示的日期数量

function dateFilterWidget(allDates, activeDate = null, isAll = false) {
  const allLink = `<a href="/" ${isAll ? 'class="active"' : ''}>全部</a>`
  const dateLinks = allDates.map((d, i) => {
    const cls = [d === activeDate ? 'active' : '', i >= DATE_FOLD ? 'date-hidden' : ''].filter(Boolean).join(' ')
    return `<a href="/date/${d}/" ${cls ? `class="${cls}"` : ''}>${d}</a>`
  })
  const needToggle = allDates.length > DATE_FOLD
  const toggleBtn = needToggle
    ? `<button class="date-toggle" onclick="(function(b){var f=b.closest('.date-filter');f.classList.toggle('expanded');b.textContent=f.classList.contains('expanded')?'收起':'更多 ↓'})(this)">更多 ↓</button>`
    : ''
  return `<div class="date-filter">${allLink}\n${dateLinks.join('\n')}${needToggle ? '\n' + toggleBtn : ''}</div>`
}

function buildListPage(pageArticles, allDates, pageNum, totalPages) {
  const dateFilter = dateFilterWidget(allDates, null, true)

  let feedHtml = ''
  pageArticles.forEach((item, i) => {
    if (i > 0 && item.date !== pageArticles[i - 1].date) {
      feedHtml += '<div class="section-divider"></div>\n'
    }
    feedHtml += articleCard(item)
  })

  const title = pageNum === 1 ? '古法信息流' : `第 ${pageNum} 页 - 古法信息流`

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${FONT_LINK}
  <style>${CSS}</style>
</head>
<body>
  <header>
    <div class="container">
      ${headerLinks(dateFilter)}
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
      ${paginationHtml(pageNum, totalPages)}
    </div>
  </main>
  ${footer()}
</body>
</html>`
}

// ─── 生成日期筛选页 /date/YYYY-MM-DD/index.html ──────────────────────────────

function buildDatePage(date, articles, allDates) {
  const filtered = articles.filter(a => a.date === date)
  const dateFilter = dateFilterWidget(allDates, date, false)
  const feedHtml = filtered.map(item => articleCard(item)).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${date} - 古法信息流</title>
  ${FONT_LINK}
  <style>${CSS}</style>
</head>
<body>
  <header>
    <div class="container">
      ${headerLinks(dateFilter)}
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
  const tagsHtml = article.tags.map(t => `<a href="/tag/${tagSlug(t)}/" class="feed-tag">${t}</a>`).join('')
  const urlHtml = article.url
    ? `<a href="${article.url}" class="feed-source-link" target="_blank" rel="noopener">原文链接</a>`
    : ''
  const sourceAuthor = [article.source, article.author].filter(Boolean).join(' - ')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.title} - 古法信息流</title>
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
        <h1 class="article-title">${article.title}</h1>
        <div class="article-meta-line">
          ${sourceAuthor ? `<span class="feed-source-author">${sourceAuthor}</span>` : ''}
          ${urlHtml}
        </div>
        <div class="feed-tags">${tagsHtml}<span class="feed-date">${article.date}</span></div>
      </div>
      <div class="article-body feed-summary">
        ${bodyHtml}
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
  const tagsHtml = item.tags.map(t => `<a href="/tag/${tagSlug(t)}/" class="feed-tag">${t}</a>`).join('')
  const urlHtml = item.url
    ? `<a href="${item.url}" class="feed-source-link" target="_blank" rel="noopener">原文链接</a>`
    : ''
  const sourceAuthor = [item.source, item.author].filter(Boolean).join(' - ')

  return `
  <article class="feed-item">
    <h2 class="feed-item-title">
      <a href="/article/${item.slug}/">${item.title}</a>
    </h2>
    <div class="article-meta-line">
      ${sourceAuthor ? `<span class="feed-source-author">${sourceAuthor}</span>` : ''}
      ${urlHtml}
    </div>
    <div class="feed-summary">${bodyHtml}</div>
    <div class="feed-tags">${tagsHtml}<span class="feed-date">${item.date}</span></div>
  </article>`
}

// ─── 标签汇总页 /tags/index.html ─────────────────────────────────────────────

function buildTagsIndex(tagMap) {
  const sorted = Object.entries(tagMap).sort((a, b) => b[1].length - a[1].length)
  const tagsHtml = sorted.map(([tag, arts]) =>
    `<a href="/tag/${tagSlug(tag)}/" class="tag-item">
      <span class="tag-name">${tag}</span>
      <span class="tag-count">${arts.length}</span>
    </a>`
  ).join('\n    ')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>标签 - 古法信息流</title>
  ${FONT_LINK}
  <style>${CSS}
  .tags-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 32px; }
  .tag-item { display: flex; align-items: center; gap: 6px; text-decoration: none;
    padding: 6px 14px; border: 1px solid var(--border-warm); border-radius: 8px;
    background: var(--ivory); color: var(--charcoal-warm); font-size: 14px;
    transition: all 0.15s ease; }
  .tag-item:hover { background: var(--white); box-shadow: 0 0 0 1px var(--border-warm); color: var(--anthropic-near-black); }
  .tag-count { font-size: 12px; color: var(--stone-gray); background: var(--parchment);
    border-radius: 10px; padding: 1px 7px; }
  </style>
</head>
<body>
  <header><div class="container">${headerLinks()}</div></header>
  <main>
    <div class="container">
      <h1 style="font-family:'Noto Serif SC',serif;font-size:28px;font-weight:500;margin-bottom:8px;">标签</h1>
      <p style="color:var(--stone-gray);font-size:14px;">共 ${sorted.length} 个标签</p>
      <div class="tags-grid">${tagsHtml}</div>
    </div>
  </main>
  ${footer()}
</body>
</html>`
}

// ─── 标签文章页 /tag/[tag]/index.html ────────────────────────────────────────

function buildTagPage(tag, articles) {
  const feedHtml = articles.map(item => articleCard(item)).join('\n')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tag} - 古法信息流</title>
  ${FONT_LINK}
  <style>${CSS}</style>
</head>
<body>
  <header><div class="container">${headerLinks()}</div></header>
  <main>
    <div class="container">
      <a href="/tags/" class="back-link">← 所有标签</a>
      <h1 style="font-family:'Noto Serif SC',serif;font-size:28px;font-weight:500;margin-bottom:24px;"># ${tag}</h1>
      ${feedHtml}
    </div>
  </main>
  ${footer()}
</body>
</html>`
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
  fs.mkdirSync(path.join(DIST_DIR, 'tags'), { recursive: true })
  fs.mkdirSync(path.join(DIST_DIR, 'tag'), { recursive: true })

  const articles = getArticles()
  log(`读取到 ${articles.length} 篇文章`)

  const dates = [...new Set(articles.map(a => a.date))].sort().reverse()
  const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE))

  // 生成分页列表页
  fs.mkdirSync(path.join(DIST_DIR, 'page'), { recursive: true })
  for (let p = 1; p <= totalPages; p++) {
    const pageArticles = articles.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
    const html = buildListPage(pageArticles, dates, p, totalPages)
    if (p === 1) {
      fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf-8')
      log('生成 index.html')
    } else {
      const dir = path.join(DIST_DIR, 'page', String(p))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
      log(`生成 page/${p}/index.html`)
    }
  }

  // 生成日期页
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

  // 生成标签页
  const tagMap = {}
  for (const article of articles) {
    for (const tag of article.tags) {
      if (!tagMap[tag]) tagMap[tag] = []
      tagMap[tag].push(article)
    }
  }
  fs.writeFileSync(path.join(DIST_DIR, 'tags', 'index.html'), buildTagsIndex(tagMap), 'utf-8')
  log('生成 tags/index.html')
  for (const [tag, tagArticles] of Object.entries(tagMap)) {
    const dir = path.join(DIST_DIR, 'tag', tagSlug(tag))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), buildTagPage(tag, tagArticles), 'utf-8')
    log(`生成 tag/${tagSlug(tag)}/index.html (${tag})`)
  }

  // 生成 404 页
  const notFoundHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>页面不存在 - 古法信息流</title>
  ${FONT_LINK}
  <style>${CSS}</style>
</head>
<body>
  <header><div class="container">${headerLinks()}</div></header>
  <main>
    <div class="container" style="padding-top:80px;text-align:center;">
      <p style="font-size:64px;margin-bottom:16px;">404</p>
      <p style="color:var(--stone-gray);margin-bottom:32px;">页面不存在</p>
      <a href="/" style="color:var(--terracotta);text-decoration:none;">← 返回首页</a>
    </div>
  </main>
  ${footer()}
</body>
</html>`
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), notFoundHtml, 'utf-8')
  log('生成 404.html')

  // 生成 sitemap.xml
  const today = new Date().toISOString().slice(0, 10)
  const sitemapUrls = []

  // 首页
  sitemapUrls.push({ loc: '/', lastmod: today, priority: '1.0', changefreq: 'daily' })

  // 分页列表页
  for (let p = 2; p <= totalPages; p++) {
    sitemapUrls.push({ loc: `/page/${p}/`, lastmod: today, priority: '0.8', changefreq: 'daily' })
  }

  // 文章详情页
  for (const article of articles) {
    sitemapUrls.push({ loc: `/article/${article.slug}/`, lastmod: article.date || today, priority: '0.9', changefreq: 'never' })
  }

  // 日期页
  for (const date of dates) {
    sitemapUrls.push({ loc: `/date/${date}/`, lastmod: date, priority: '0.6', changefreq: 'never' })
  }

  // 标签汇总页
  sitemapUrls.push({ loc: '/tags/', lastmod: today, priority: '0.7', changefreq: 'weekly' })

  // 各标签页
  for (const tag of Object.keys(tagMap)) {
    sitemapUrls.push({ loc: `/tag/${tagSlug(tag)}/`, lastmod: today, priority: '0.6', changefreq: 'weekly' })
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${SITE_BASE}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf-8')
  log('生成 sitemap.xml')

  log(`\n构建完成，共生成 ${totalPages + dates.length + articles.length + 1 + Object.keys(tagMap).length} 个 HTML 文件`)
}

build()
