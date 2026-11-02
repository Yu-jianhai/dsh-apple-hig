/**
 * unit-drag-core.mjs —— 直接单测拖拽引擎的「纯核心」。
 *
 * 夹具（run-drag-fixture.mjs）验的是整条链路（真 DOM + 真事件），
 * 这里只喂数组、只断言数字：槽位怎么算、分组怎么切、位移怎么给。
 * 纯核心不读 document，所以这些断言不依赖渲染，也不会被动画时序干扰。
 *
 * 用法：node test/unit-drag-core.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.join(here, '../lib/client.js')

let failures = 0
const ok = (cond, label, extra) => {
  if (cond) console.log('  ok   ' + label)
  else {
    failures++
    console.log('  FAIL ' + label + (extra ? ' → ' + extra : ''))
  }
}
const eq = (got, want, label) => ok(got === want, label, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))

/* ------------------------------------------------------------------ 最小替身 */

const documentStub = {
  documentElement: { setAttribute: () => {}, removeAttribute: () => {}, getAttribute: () => null },
  head: { appendChild: () => {} },
  body: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute: () => {}, removeAttribute: () => {}, appendChild: () => {} }),
}
let loaded = null
const windowStub = { __ModuleLoader__: { load: (m) => (loaded = m) }, addEventListener: () => {} }
const store = new Map()
const localStorageStub = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }

globalThis.window = windowStub
globalThis.document = documentStub
globalThis.localStorage = localStorageStub
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32' }, configurable: true })

const ReactStub = { createElement: () => null, Component: class {}, useState: () => [undefined, () => {}], useEffect: () => {}, useSyncExternalStore: () => undefined }
new Function('window', 'document', 'localStorage', 'navigator', fs.readFileSync(bundle, 'utf8'))(
  windowStub,
  documentStub,
  localStorageStub,
  globalThis.navigator,
)
const mod = loaded.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error('unexpected require: ' + name)
})

const CORE = windowStub.dshAppleHig && windowStub.dshAppleHig.core
ok(!!CORE, '调试口暴露了 core（window.dshAppleHig.core）')
if (!CORE) process.exit(1)

/* ------------------------------------------------------------------ 造数据 */

/* 两组：A(0..3) 与 B(4..6)。组内行距 36、行高 34；两组之间隔 68（中间有组标题）。 */
const rows = [
  { key: 'a1', top: 100, height: 34, left: 12, width: 240 },
  { key: 'a2', top: 136, height: 34, left: 12, width: 240 },
  { key: 'a3', top: 172, height: 34, left: 12, width: 240 },
  { key: 'a4', top: 208, height: 34, left: 12, width: 240 },
  { key: 'b1', top: 310, height: 34, left: 12, width: 240 },
  { key: 'b2', top: 346, height: 34, left: 12, width: 240 },
  { key: 'b3', top: 382, height: 34, left: 12, width: 240 },
]

console.log('\nCORE.stepOf')
eq(CORE.stepOf(rows), 36, '步长取同组相邻间距（跨组的 78 被忽略）')
eq(CORE.stepOf([]), 0, '空数组返回 0')
eq(CORE.stepOf([{ top: 0, height: 34 }]), 0, '单行返回 0')

console.log('\nCORE.slotAt')
eq(CORE.slotAt(rows, 90), 0, '第一行上方 → 0')
eq(CORE.slotAt(rows, 110), 0, '第一行上半 → 0')
eq(CORE.slotAt(rows, 125), 1, '第一行下半 → 1')
eq(CORE.slotAt(rows, 1000), 7, '最后一行下方 → 行数（追加到末尾）')

console.log('\nCORE.groupRange')
const gA = CORE.groupRange(rows, 1)
eq(gA.first, 0, '无谓词时按竖向连续性：A 组首 = 0')
eq(gA.last, 3, '无谓词时按竖向连续性：A 组末 = 3')
const gB = CORE.groupRange(rows, 5, (r) => ['b1', 'b2', 'b3'].includes(r.key))
eq(gB.first, 4, '有谓词时按宿主分组：B 组首 = 4')
eq(gB.last, 6, '有谓词时按宿主分组：B 组末 = 6')

console.log('\nCORE.clampSlot')
eq(CORE.clampSlot(1, gB, rows.length), 4, '组二的行想落到组一 → 夹到组首 4')
eq(CORE.clampSlot(99, gB, rows.length), 7, '超出末行 → 夹到组末+1')
eq(CORE.clampSlot(5, gB, rows.length), 5, '组内原样通过')

console.log('\nCORE.slotTopIn')
eq(CORE.slotTopIn(rows, 4, 36, gB), 310, '组二第一格取该行顶部（不是上一组末尾）')
eq(CORE.slotTopIn(rows, 7, 36, gB), 418, '组末之后 = 末行底 + 间距补白')
eq(CORE.slotTopIn(rows, 0, 36, gB), 310, '小于组首 → 贴组首')

console.log('\nCORE.phRect')
const rect = CORE.phRect(rows, 0, 2, 36, gA)
eq(rect.top, 172, '灰块顶 = 槽位行顶')
eq(rect.left, 12, '灰块左 = 源行左')
eq(rect.width, 240, '灰块宽 = 源行宽')
eq(rect.height, 34, '灰块高 = 源行高')

console.log('\nCORE.boundsOf')
const b = CORE.boundsOf(rows, 28)
eq(b.left, 12, '左边界取所有行最小值')
eq(b.right, 252, '右边界取所有行最大值')
eq(b.top, 72, '上边界 = 首行顶 - edge')
eq(b.bottom, 416 + 28, '下边界 = 末行底 + edge')

console.log('\nCORE.shiftOf')
const src = 0
const step = 36
eq(CORE.shiftOf(0, src, 2, step), 0, '源行自己不动')
eq(CORE.shiftOf(1, src, 2, step), -36, '向下拖：中间的行走上一格（-step，屏幕向上）')
eq(CORE.shiftOf(2, src, 2, step), -36, '向下拖：目标行走上一格（-step）')
eq(CORE.shiftOf(3, src, 2, step), 0, '越过目标的行走 0')
eq(CORE.shiftOf(1, 2, 0, step), 36, '向上拖：中间的行走下一格（+step，屏幕向下）')
eq(CORE.shiftOf(2, 2, 0, step), 0, '向上拖：源行不动')

console.log('')
if (failures) {
  console.log('有 ' + failures + ' 项失败')
  process.exit(1)
}
console.log('全部通过')
