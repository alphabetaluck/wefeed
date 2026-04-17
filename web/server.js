const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const app = new Hono();

// 文章目录：优先读环境变量，默认指向同级的 articles/
const ARTICLES_ROOT = process.env.ARTICLES_DIR
  ? path.resolve(process.env.ARTICLES_DIR)
  : path.join(__dirname, '../articles');

function formatDate(raw) {
  if (!raw) return '';
  // gray-matter 把 YYYY-MM-DD 解析为 Date 对象
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

function getArticles() {
  if (!fs.existsSync(ARTICLES_ROOT)) {
    console.warn(`[warn] articles dir not found: ${ARTICLES_ROOT}`);
    return [];
  }

  const result = [];

  const entries = fs.readdirSync(ARTICLES_ROOT);

  // 辅助：解析单个 md 文件，fallbackDate 用于无日期子目录场景
  function parseFile(filePath, fallbackDate) {
    try {
      const { data, content } = matter(fs.readFileSync(filePath, 'utf-8'));
      if (!data.title) return null;
      return {
        title: data.title,
        url: data.url || '',
        date: formatDate(data.date) || fallbackDate || '',
        source: data.source || '',
        author: data.author || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        content: content.trim(),
      };
    } catch (e) {
      console.error(`[error] ${filePath}:`, e.message);
      return null;
    }
  }

  for (const entry of entries) {
    const entryPath = path.join(ARTICLES_ROOT, entry);
    const stat = fs.statSync(entryPath);

    if (stat.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry)) {
      // 日期子目录
      for (const file of fs.readdirSync(entryPath)) {
        if (!file.endsWith('.md')) continue;
        const art = parseFile(path.join(entryPath, file), entry);
        if (art) result.push(art);
      }
    } else if (!stat.isDirectory() && entry.endsWith('.md')) {
      // 根目录下的 md 文件
      const art = parseFile(entryPath, '');
      if (art) result.push(art);
    }
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}

app.get('/', (c) => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.html(html);
});

app.get('/api/articles', (c) => {
  return c.json(getArticles());
});

const PORT = process.env.PORT || 17777;

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Articles dir: ${ARTICLES_ROOT}`);
});
