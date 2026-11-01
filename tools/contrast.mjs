/**
 * contrast.mjs —— DSH × Apple HIG 插件的验收脚本（第 1 项：对比度）
 *
 * 数据源：`_recon/palette.json`（由 parse3.mjs 从
 * `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 内嵌 CSS 解析出来的 token 表）。
 * 本脚本把插件的覆盖值叠到 token 表上，逐项算出改前/改后的 WCAG 对比度，
 * 与 WCAG 2.1 的 4.5:1（正文）/ 3:1（大字与图形）对照。
 *
 * 用法：node tools/contrast.mjs [--palette <path>]
 * 退出码：0 = 全部项达标；1 = 有项未达标（用于 CI / 手工验收）。
 *
 * 注意：palette.json 里的值是 light / dark 两套 + statics；var() 链需要解析。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const here = path.dirname(fileURLToPath(import.meta.url))
const palettePath = (() => {
  const i = args.indexOf('--palette')
  if (i > -1 && args[i + 1]) return path.resolve(args[i + 1])
  // 1) 随包发布的基线快照（仓库里就有，clone 下来即可跑）
  const bundled = path.join(here, 'palette.json')
  if (fs.existsSync(bundled)) return bundled
  // 2) 本机重新解析出来的最新快照（改了 DSH 版本后用它校准）
  return path.resolve(process.cwd(), '../_recon/palette.json')
})()
if (!fs.existsSync(palettePath)) {
  console.error('找不到 token 基线：' + palettePath)
  console.error('用 --palette <path> 指定，或先跑 _recon/parse3.mjs 生成。')
  process.exit(2)
}

const palette = JSON.parse(fs.readFileSync(palettePath, 'utf8'))

/* ------------------------------------------------------------------ 颜色工具 */

function hexToRgb(hex) {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6) // 丢弃 alpha：对比度按不透明底算
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function relLum({ r, g, b }) {
  const f = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const l1 = relLum(hexToRgb(a))
  const l2 = relLum(hexToRgb(b))
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** 把带 var() 的值解析成最终颜色；解析不出来返回 null。 */
function resolve(value, scheme, seen = new Set()) {
  if (typeof value !== 'string') return null
  const v = value.trim()
  const m = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*(.+))?\)$/.exec(v)
  if (!m) return v.startsWith('#') ? v : null
  const name = m[1]
  if (seen.has(name + scheme)) return null
  seen.add(name + scheme)
  const perScheme = palette[scheme] ?? {}
  const statics = palette.statics ?? {}
  const next = perScheme[name] ?? statics[name] ?? (m[2] ? m[2] : undefined)
  return next === undefined ? null : resolve(next, scheme, seen)
}

/* ------------------------------------------------------------------ 检查表 */

/**
 * 每项：token 名 + 前景/背景 + 门槛 + 插件覆盖（未覆盖则前后一致）。
 * 覆盖值必须与 lib/client.js 里的 OVERRIDES 保持一致 —— 那里是唯一实现，
 * 这里是它的验收投影；两处不一致时以本脚本输出为准去找差异。
 */
const OVERRIDES = {
  '--dsw-alias-label-caption': {
    light: '#6d727a', // 原 #adb2b8 → 2.13:1，WCAG 正文不合格
  },
  '--dsw-alias-label-tertiary': {
    light: '#696e76', // 原 #81858c → 3.71:1，WCAG 正文不合格
  },
  '--dsw-focus-ring-color': {
    light: 'var(--dsw-alias-state-business-primary)',
    dark: 'var(--dsw-alias-state-business-primary)',
  },
}

const CHECKS = [
  { fg: '--dsw-alias-label-primary', bg: '--dsw-alias-bg-base', min: 4.5, label: '正文主色' },
  { fg: '--dsw-alias-label-secondary', bg: '--dsw-alias-bg-base', min: 4.5, label: '正文次色' },
  { fg: '--dsw-alias-label-tertiary', bg: '--dsw-alias-bg-base', min: 4.5, label: '三级文字' },
  { fg: '--dsw-alias-label-caption', bg: '--dsw-alias-bg-base', min: 4.5, label: '说明文字' },
  { fg: '--dsw-alias-label-primary', bg: '--dsw-alias-bg-layer-1', min: 4.5, label: '正文/层1' },
  { fg: '--dsw-alias-label-secondary', bg: '--dsw-alias-bg-layer-2', min: 4.5, label: '次色/层2' },
  { fg: '--dsw-focus-ring-color', bg: '--dsw-alias-bg-base', min: 3, label: '焦点环（图形 3:1）' },
  {
    fg: '--dsw-alias-state-business-primary',
    bg: '--dsw-alias-bg-base',
    min: 3,
    label: '品牌强调色（图形 3:1）',
  },
]

function withOverrides(scheme) {
  const perScheme = { ...(palette[scheme] ?? {}) }
  for (const [name, pair] of Object.entries(OVERRIDES)) {
    if (pair[scheme]) perScheme[name] = pair[scheme]
  }
  return perScheme
}

function valueOf(name, scheme, table) {
  const raw = table[name] ?? palette.statics?.[name]
  return resolve(raw ?? null, scheme)
}

let failed = 0
for (const scheme of ['light', 'dark']) {
  const before = palette[scheme] ?? {}
  const after = withOverrides(scheme)
  console.log(`\n=== ${scheme} ===`)
  console.log('项'.padEnd(20), '改前'.padEnd(10), '改后'.padEnd(10), '门槛', '判定')
  for (const c of CHECKS) {
    const fgBefore = valueOf(c.fg, scheme, before)
    const bgVal = valueOf(c.bg, scheme, after)
    const fgAfter = valueOf(c.fg, scheme, after)
    const rBefore = fgBefore && bgVal ? contrast(fgBefore, bgVal) : NaN
    const rAfter = fgAfter && bgVal ? contrast(fgAfter, bgVal) : NaN
    const ok = Number.isFinite(rAfter) && rAfter >= c.min
    if (!ok) failed++
    const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a')
    console.log(
      c.label.padEnd(20),
      fmt(rBefore).padEnd(10),
      fmt(rAfter).padEnd(10),
      String(c.min).padEnd(4),
      ok ? 'OK' : 'FAIL',
    )
  }
}

console.log(`\n结论：${failed === 0 ? '全部达标' : failed + ' 项未达标'}（数据源 ${palettePath}）`)
process.exit(failed === 0 ? 0 : 1)
