#!/usr/bin/env node

/**
 * watcher.js
 * 监听 articles/ 目录变化，防抖 5 分钟后自动 git add/commit/push
 *
 * 用法：node watcher.js [articles目录路径]
 * 默认监听：../articles
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const DEBOUNCE_MS = 5 * 60 * 1000 // 5 分钟
const ARTICLES_DIR = path.resolve(process.argv[2] || path.join(__dirname, '../articles'))
const REPO_ROOT = path.resolve(__dirname, '..')

// 确认目录存在
if (!fs.existsSync(ARTICLES_DIR)) {
  console.error(`[watcher] articles 目录不存在: ${ARTICLES_DIR}`)
  process.exit(1)
}

let debounceTimer = null
let pendingFiles = new Set()

function log(msg) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false })
  console.log(`[${ts}] ${msg}`)
}

function gitPush() {
  const files = [...pendingFiles]
  pendingFiles.clear()

  log(`检测到变化的文件:\n  ${files.join('\n  ')}`)
  log('开始执行 git add / commit / push ...')

  try {
    // 检查是否有可提交的内容
    const status = execSync('git status --porcelain', { cwd: REPO_ROOT }).toString().trim()
    if (!status) {
      log('没有需要提交的变更，跳过 push')
      return
    }

    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    execSync('git add .', { cwd: REPO_ROOT, stdio: 'inherit' })
    execSync(`git commit -m "auto: update articles ${now}"`, { cwd: REPO_ROOT, stdio: 'inherit' })
    execSync('git push', { cwd: REPO_ROOT, stdio: 'inherit' })
    log('push 成功，Cloudflare Pages 将自动触发构建')
  } catch (err) {
    console.error('[watcher] git 操作失败:', err.message)
  }
}

function schedulePush(filePath) {
  pendingFiles.add(filePath)

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    log(`文件变化，重置防抖计时器（5 分钟）: ${path.relative(REPO_ROOT, filePath)}`)
  } else {
    log(`检测到文件变化，5 分钟内无新变化将自动 push: ${path.relative(REPO_ROOT, filePath)}`)
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null
    gitPush()
  }, DEBOUNCE_MS)
}

// 递归监听目录（原生 fs.watch recursive 在 Linux 上需要 Node 22+，这里手动递归）
function watchDir(dir) {
  fs.watch(dir, (eventType, filename) => {
    if (!filename) return
    const fullPath = path.join(dir, filename)
    // 忽略隐藏文件和临时文件
    if (filename.startsWith('.') || filename.endsWith('~') || filename.endsWith('.swp')) return
    schedulePush(fullPath)
  })

  // 监听已有子目录
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        watchDir(path.join(dir, entry.name))
      }
    }
  } catch (_) {}
}

// 监听新建子目录（fs.watch 不能自动监听新建目录内的内容）
fs.watch(ARTICLES_DIR, (eventType, filename) => {
  if (!filename || eventType !== 'rename') return
  const fullPath = path.join(ARTICLES_DIR, filename)
  try {
    if (fs.statSync(fullPath).isDirectory()) {
      log(`发现新子目录，开始监听: ${filename}`)
      watchDir(fullPath)
    }
  } catch (_) {}
})

watchDir(ARTICLES_DIR)

log(`watcher 已启动`)
log(`  监听目录: ${ARTICLES_DIR}`)
log(`  防抖时间: 5 分钟`)
log(`  仓库根目录: ${REPO_ROOT}`)
log('等待文件变化...')

// 保持进程运行
process.on('SIGINT', () => {
  log('收到 SIGINT，退出 watcher')
  if (debounceTimer) {
    log('警告：还有待 push 的变更未提交')
  }
  process.exit(0)
})
