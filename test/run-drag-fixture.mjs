#!/usr/bin/env node
/**
 * run-drag-fixture.mjs —— 用真实 bundle 跑一遍拖拽几何（无头浏览器）
 *
 * 为什么要有它：拖拽层连着三次「改了跟没改一样」，都是**几何/分组**算错，
 * 而 boot-smoke 是纯替身、量不到矩形。夹具里按宿主真实结构复刻了
 * 「会话行被 HoverCard 的 span 包一层」「renderSlot 产出 display:contents 锚点」
 * 这两个坑，再用真实 DragEvent 驱动，直接断言灰块跳到哪一格、行有没有让位。
 *
 * 用法：node test/run-drag-fixture.mjs
 * 找不到浏览器时退出码 2（不算失败，只是没验）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// 第二个参数可选：跑别的夹具（如 test/tab-fixture.html），输出格式一致
const fixture = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'drag-fixture.html')

const candidates = [
  process.env.AHIG_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const browser = candidates.find((p) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
})

if (!browser) {
  console.log('没找到 Edge/Chrome，跳过夹具（设置 AHIG_BROWSER 指向浏览器可执行文件即可）')
  process.exit(2)
}

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahig-fixture-'))
let dom = ''
try {
  dom = execFileSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDir}`,
      '--virtual-time-budget=15000',
      '--dump-dom',
      pathToFileURL(fixture).href,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 },
  )
} catch (error) {
  console.log('浏览器执行失败：' + error.message)
  process.exit(2)
} finally {
  try {
    fs.rmSync(userDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom)
if (!m) {
  console.log('没拿到夹具输出（页面没跑起来？）')
  process.exit(1)
}
const text = m[1]
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .trim()
const lines = text.split('\n').filter((l) => /^(PASS|FAIL)/.test(l))
if (!lines.length) {
  console.log('夹具没有任何断言：\n' + text)
  process.exit(1)
}
for (const line of lines) console.log('  ' + line)
const failed = lines.filter((l) => l.startsWith('FAIL'))
console.log(failed.length ? `\n${failed.length} 项失败` : `\n全部通过（${lines.length} 项）`)
process.exit(failed.length ? 1 : 0)
