/**
 * boot-smoke.mjs —— 不起 DSH，用最小 DOM/React 替身把 `lib/client.js` 跑一遍。
 *
 * 验的是四件事（都在真实界面里会致命，但极难在一次截屏里看出来）：
 *   1. bundle 能被 `window.__ModuleLoader__.load` 接住、factory 正常返回；
 *   2. `apply(ctx)` 不抛错，且按默认偏好注册了预期的 token 层；
 *   3. 改偏好会**先回收旧层再建新层**（不留野层，这是 overrideTokens 的主要坑）；
 *   4. 卸载时 token 层的 disposer 全被调用、样式表与 <html> 属性被清干净。
 *
 * 用法：node test/boot-smoke.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.join(here, '../lib/client.js')

let failures = 0
const ok = (cond, label, extra) => {
  if (cond) {
    console.log('  ok   ' + label)
  } else {
    failures++
    console.log('  FAIL ' + label + (extra ? ' → ' + extra : ''))
  }
}

/* ------------------------------------------------------------------ 替身 */

const attrs = new Map()
const html = {
  setAttribute: (k, v) => attrs.set(k, String(v)),
  getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
  removeAttribute: (k) => attrs.delete(k),
  dataset: {},
}
const styleEls = []
const docListeners = []
const bodyEls = [] // v0.7.4 诊断浮层挂到 body，这里记下来
const documentStub = {
  documentElement: html,
  head: { appendChild: (el) => styleEls.push(el) },
  body: { appendChild: (el) => bodyEls.push(el) },
  /* v0.7.0 的拖拽层：只登记 capture 监听，断言「开开关挂上、关开关摘干净」 */
  addEventListener: (type, fn, capture) => docListeners.push({ type, fn, capture }),
  removeEventListener: (type, fn, capture) => {
    const i = docListeners.findIndex((x) => x.type === type && x.fn === fn && x.capture === capture)
    if (i >= 0) docListeners.splice(i, 1)
  },
  querySelector: () => null,
  createElement: () => {
    const el = {
      isConnected: true,
      attrs: new Map(),
      textContent: '',
      setAttribute(k, v) {
        this.attrs.set(k, String(v))
      },
      remove() {
        this.isConnected = false
      },
    }
    return el
  },
}

const store = new Map()
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
}

/* MutationObserver 替身：v0.6.0 的「切换会话进场动画」靠它触发，
 * 断言三件事：只监听 data-conversation-session、属性变化时真的打标、关开关与卸载都断开。 */
const observers = []
class MutationObserverStub {
  constructor(cb) {
    this.cb = cb
    this.disconnected = false
    this.target = null
    this.options = null
    observers.push(this)
  }
  observe(target, options) {
    this.target = target
    this.options = options
  }
  disconnect() {
    this.disconnected = true
  }
  takeRecords() {
    return []
  }
}
globalThis.MutationObserver = MutationObserverStub

function makeReactStub() {
  class Component {
    constructor(props) {
      this.props = props || {}
      this.state = {}
    }
    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  }
  return {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    Component,
  }
}

/* ------------------------------------------------------------------ 加载 */

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load: (mod) => {
      loaded = mod
    },
  },
  addEventListener: () => {},
}
globalThis.document = documentStub
globalThis.localStorage = localStorageStub
const navigatorStub = { platform: 'Win32' }
// Node 24 的 globalThis.navigator 是只读 getter，只能重新定义，不能赋值。
Object.defineProperty(globalThis, 'navigator', { value: navigatorStub, configurable: true })

const ReactStub = makeReactStub()
const requireStub = (name) => {
  if (name === 'react') return ReactStub
  throw new Error('unexpected require: ' + name)
}

new Function('window', 'document', 'localStorage', 'navigator', fs.readFileSync(bundle, 'utf8'))(
  globalThis.window,
  documentStub,
  localStorageStub,
  navigatorStub,
)

console.log('bundle 加载')
ok(loaded && loaded.id === 'dsh-apple-hig', 'window.__ModuleLoader__.load 收到 id')
ok(typeof loaded.factory === 'function', 'factory 是函数')

const mod = loaded.factory(requireStub)
ok(mod && typeof mod.apply === 'function', 'factory 返回 apply')
ok(Array.isArray(mod.inject) && mod.inject.includes('slots'), 'inject 含 slots')

/* ------------------------------------------------------------------ 应用 */

const overrideCalls = []
const disposed = []
const registered = []
const fakeTheme = {
  overrideTokens: (source, tokens) => {
    const index = overrideCalls.length
    overrideCalls.push({ source, tokens })
    return () => disposed.push(source)
  },
  getTheme: () => ({ active: 'dark', preference: 'dark', themes: ['light', 'dark'] }),
}
const fakeCtx = {
  theme: fakeTheme,
  slots: {
    register: (...args) => {
      registered.push(args[0])
      return () => {}
    },
    // Cordis 的 slots.inject 会跑 generator，把 yield 出来的 disposer 当 effect 收集。
    inject: (_slot, factory) => {
      for (const _disposer of factory()) {
        /* 收集即足够 */
      }
    },
  },
  effect: () => {},
}

console.log('\napply(ctx)')
let threw = null
try {
  mod.apply(fakeCtx)
} catch (error) {
  threw = error
}
ok(!threw, 'apply 不抛错', threw && threw.message)

const sources = overrideCalls.map((c) => c.source)
console.log('  layers:', sources.join(', '))
ok(sources.includes('apple-hig/focus-ring'), '默认启用了焦点环层')
ok(sources.includes('apple-hig/text-contrast'), '默认启用了文字对比度层')
ok(sources.includes('apple-hig/brand-font'), '默认启用了品牌字体层')
ok(sources.some((s) => s === 'apple-hig/font-native' || s === 'apple-hig/font-apple'), '字体预设层已建立')
ok(sources.includes('apple-hig/radius'), '默认启用了圆角梯度层（v0.2.0 看得见的那档）')
ok(sources.includes('apple-hig/rhythm'), '默认启用了间距节奏层（v0.2.0 看得见的那档）')
ok(sources.includes('apple-hig/measure'), '默认启用了阅读宽度层（v0.3.0）')
ok(sources.length === 7, '默认共 7 层', String(sources.length))
ok(!sources.some((s) => s.includes('squircle')), 'squircle 不产生 token 层（它是纯样式）')
ok(styleEls.length === 1, '注入了一个样式表', String(styleEls.length))
{
  const css = String(styleEls[0].textContent || '')
  ok(css.includes('[data-composer-dock]'), '样式表命中底部读数行真实容器（v0.4.0）')
  ok(css.includes('html[data-ahig-chips="1"]'), '样式表含控件行统一段（v0.4.0）')
  ok(
    css.includes('_triggerEffort') && !/line-height:1!important/.test(css),
    '模型位推理档位不被裁：有 _triggerEffort 规则且不再用 line-height:1（v0.6.1）',
  )
  ok(css.includes('.dsh-mem-pill-hit') && css.includes('.dslt-btn'), '控件行统一覆盖记忆/古籍两个第三方芯片')
  ok(
    css.includes('html[data-ahig-sidebar="1"] [data-slot="sidebar"]'),
    '样式表含侧栏段且限定在 sidebar 锚点内（v0.5.0）',
  )
  ok(
    css.includes('[class*="_time"]') && css.includes('[data-row-key]'),
    '侧栏段用类名本名 + data-row-key 钩子，不写死哈希类名',
  )
  ok(css.includes('html[data-ahig-transition="1"]'), '样式表含切换动画段（v0.6.0）')
  ok(css.includes('@keyframes ahig-enter'), '切换会话的进场关键帧存在')
  ok(css.includes(':not([data-dragging])'), '拖动分隔线时禁用侧栏过渡（否则列宽会拖着鼠标走）')
}
ok(attrs.get('data-ahig') === '1', '<html data-ahig="1">')
ok(attrs.get('data-ahig-statusbar') === '1', '状态栏开关默认开')
ok(attrs.get('data-ahig-material') === '1', '材质开关默认开')
ok(attrs.get('data-ahig-radius') === '1', '圆角开关默认开')
ok(attrs.get('data-ahig-rhythm') === '1', '节奏开关默认开')
ok(attrs.get('data-ahig-chrome') === '1', '顶栏开关默认开')
ok(attrs.get('data-ahig-measure') === '1', '阅读宽度开关默认开')
ok(attrs.get('data-ahig-chips') === '1', '控件行统一开关默认开（v0.4.0）')
ok(attrs.get('data-ahig-sidebar') === '1', '侧栏开关默认开（v0.5.0）')
ok(attrs.get('data-ahig-transition') === '1', '切换动画开关默认开（v0.6.0）')

// 切换动画的触发器：只挂一个 observer、只盯 data-conversation-session 一个属性
{
  const live = observers.filter((o) => !o.disconnected)
  ok(live.length === 1, '装了一个常驻 MutationObserver', String(live.length))
  const obs = live[0]
  ok(
    obs && Array.isArray(obs.options && obs.options.attributeFilter) &&
      obs.options.attributeFilter.length === 1 &&
      obs.options.attributeFilter[0] === 'data-conversation-session',
    '只监听 data-conversation-session（不监听 childList，避免流式输出时的常驻开销）',
  )
  ok(obs && obs.options && obs.options.subtree === true && obs.options.childList !== true, 'subtree 开、childList 关')
  // 模拟宿主切换会话：同一个节点只换属性值
  const body = {
    isConnected: true,
    attrs: new Map([['data-conversation-session', 's1'], ['data-conversation-content', '']]),
    get offsetWidth() {
      return 800
    },
    hasAttribute(k) {
      return this.attrs.has(k)
    },
    setAttribute(k, v) {
      this.attrs.set(k, String(v))
    },
    removeAttribute(k) {
      this.attrs.delete(k)
    },
  }
  if (obs) {
    obs.cb([
      { type: 'attributes', attributeName: 'data-conversation-session', target: body },
      { type: 'attributes', attributeName: 'data-conversation-session', target: { hasAttribute: () => false } },
    ])
  }
  ok(body.attrs.get('data-ahig-enter') === '1', '会话 id 变化时给内容节点打了进场标记')
}

// 圆角：成对给 + 数值是 v0.2.0 选的梯度
const radiusLayer = overrideCalls.find((c) => c.source === 'apple-hig/radius')
ok(!!radiusLayer, '有圆角层')
ok(radiusLayer && radiusLayer.tokens['--dsw-radius-panel'].dark === '22px', '面板圆角 28 → 22px')
ok(radiusLayer && radiusLayer.tokens['--dsw-radius-xs'].light === '6px', '小圆角 4 → 6px')
const rhythmLayer = overrideCalls.find((c) => c.source === 'apple-hig/rhythm')
ok(rhythmLayer && rhythmLayer.tokens['--dsh-chat-flow-gap'].light === '10px', '对话流行距 6 → 10px')
const measureLayer = overrideCalls.find((c) => c.source === 'apple-hig/measure')
ok(
  measureLayer && measureLayer.tokens['--dsh-chat-content-width'].light.includes('780px'),
  '正文宽度 920 → 780px',
)
ok(
  measureLayer && measureLayer.tokens['--dsh-composer-card-max-width'].dark.includes('780px'),
  '输入卡宽度 952 → 780px（与正文同宽）',
)
ok(registered.length === 1 && registered[0].name === 'settings.section', '注册了设置分区')

// v0.7.0 拖拽层：默认开、四个 capture 监听都在
const dragTypes = docListeners.map((x) => x.type)
for (const t of ['dragstart', 'dragover', 'drop', 'dragend']) {
  ok(dragTypes.includes(t), '挂了 ' + t + ' 的 capture 监听')
}
ok(attrs.get('data-ahig-drag') === '1', '拖拽开关默认开')
ok(
  docListeners.some((x) => x.type === 'pointerdown'),
  'v0.7.4 探针挂了 pointerdown（用来区分「没按到行」和「按了不起拖拽」）',
)
ok(globalThis.window.dshAppleHig.get().probe === true, '诊断浮层默认开')
ok(
  bodyEls.some((el) => el.id === 'ahig-probe'),
  '诊断浮层挂到了 body',
)
const probeEl = bodyEls.find((el) => el.id === 'ahig-probe')
ok(
  probeEl && String(probeEl.textContent).includes('AHIG 拖拽探针'),
  '诊断浮层有标题（说明代码真的跑到这里）',
)
const cssText = String(styleEls[0].textContent || '')
ok(cssText.includes('.ahig-drag-card'), '样式表里有浮卡')
ok(cssText.includes('.ahig-drag-ph'), '样式表里有灰块')
ok(cssText.includes('data-ahig-ph="dashed"'), '灰块有三种形态之一（虚线空槽）')
ok(cssText.includes('data-ahig-dragging'), '被拿起的行会藏起来')
ok(cssText.includes('_dropBefore'), '宿主落点线在我们拖拽时隐藏')

// token 形状：必须成对给 light/dark（裸字符串会 throw）
const focus = overrideCalls.find((c) => c.source === 'apple-hig/focus-ring')
const pair = focus && focus.tokens['--dsw-focus-ring-color']
ok(pair && pair.light === pair.dark && pair.light.length > 0, '焦点环 token 成对且非空')

const contrast = overrideCalls.find((c) => c.source === 'apple-hig/text-contrast')
ok(
  contrast && contrast.tokens['--dsw-alias-label-tertiary'].dark.startsWith('var('),
  '深色档写回原值（不是省略）',
)

/* ------------------------------------------------------------------ 改偏好 */

console.log('\n切换字体预设 + 关状态栏')
const before = overrideCalls.length
globalThis.window.dshAppleHig.set({ fontPreset: 'off', statusBar: false, radius: false })
ok(disposed.length === before, '改偏好先回收了全部旧层', disposed.length + '/' + before)
ok(attrs.get('data-ahig-statusbar') === '0', '状态栏开关已关')
ok(attrs.get('data-ahig-radius') === '0', '圆角开关已关')
const afterSources = overrideCalls.slice(before).map((c) => c.source)
ok(!afterSources.some((s) => s.startsWith('apple-hig/font-')), 'off 预设不再建字体层')
ok(!afterSources.includes('apple-hig/radius'), '关掉圆角后不再建该层')

console.log('\n关切换动画 → 监听器应随之撤掉')

// 拖拽层：关掉开关要把四个 capture 监听摘干净，且默认值是实块 + 轻回弹
console.log('\n关拖拽 → capture 监听应随之撤掉')
const DRAG_TYPES = ['dragstart', 'dragover', 'drop', 'dragend']
const beforeDrag = docListeners.filter((x) => DRAG_TYPES.includes(x.type)).length
ok(beforeDrag === 4, '开着的拖拽层有 4 个 capture 监听')
globalThis.window.dshAppleHig.set({ drag: false })
ok(docListeners.filter((x) => DRAG_TYPES.includes(x.type)).length === 0, '关掉拖拽后监听全撤')
ok(attrs.get('data-ahig-drag') === '0', '关掉后属性为 0')
const dragPrefs = globalThis.window.dshAppleHig.get()
ok(dragPrefs.dragStyle === 'solid', '灰块默认实块')
ok(dragPrefs.dragBounce === true, '吸附默认轻回弹')
globalThis.window.dshAppleHig.set({ drag: true })

// 探针关掉要自己摘掉，不留常驻节点
globalThis.window.dshAppleHig.set({ probe: false })
ok(!bodyEls.some((el) => el.id === 'ahig-probe' && el.isConnected), '关掉诊断浮层后节点已移除')
globalThis.window.dshAppleHig.set({ probe: true })

globalThis.window.dshAppleHig.set({ transition: false })
ok(attrs.get('data-ahig-transition') === '0', '切换动画开关已关')
ok(observers.every((o) => o.disconnected), '关掉开关后不再留常驻监听')
globalThis.window.dshAppleHig.set({ transition: true })
ok(observers.filter((o) => !o.disconnected).length === 1, '重新打开后又挂上（且只有一份）')

console.log('\n偏好落盘')
const raw = localStorageStub.getItem('dsh-apple-hig:v1')
ok(raw && JSON.parse(raw).fontPreset === 'off', 'localStorage 写入了新偏好')

/* ------------------------------------------------------------------ 卸载 */

console.log('\nteardown()')
// apply 里注册的 cleanup 通过 ctx.effect 收集；这里直接找 bundle 暴露的 reset 之外没有
// 公开 teardown，改用「重新 apply 一次 + 检查属性」之外的路：调用 set 后再看状态即可。
// 真正的卸载由宿主触发 ctx.effect 返回的 disposer，boot-smoke 里用一个可捕获 effect 的 ctx 复验。
const cleanups = []
mod.apply({
  theme: fakeTheme,
  slots: { register: () => () => {}, inject: () => {} },
  effect: (fn) => {
    cleanups.push(fn)
  },
})
ok(cleanups.length >= 1, 'apply 注册了 cleanup（ctx.effect）')
const cleanup = cleanups[cleanups.length - 1]()
ok(typeof cleanup === 'function', 'cleanup 返回了 disposer')
const disposableBefore = disposed.length
cleanup()
ok(disposed.length > disposableBefore, '卸载调用了 token 层 disposer')
ok(!attrs.has('data-ahig'), '卸载清掉了 <html> 属性')
ok(styleEls.every((el) => !el.isConnected), '卸载移除了样式表')

console.log('\n' + (failures === 0 ? '全部通过' : failures + ' 项失败'))
process.exit(failures === 0 ? 0 : 1)
