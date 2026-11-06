import fs from 'node:fs'

const F = 'E:/工作区/生成个插件/dsh-apple-hig/lib/client.js'
let s = fs.readFileSync(F, 'utf8')

/* ---------- 1) 常量 ---------- */
const oldConsts = s.slice(s.indexOf('    /* 尺寸按 macOS 分段控件'), s.indexOf("    const TABS_ON = 'data-ahig-tabs'"))
if (!oldConsts) throw new Error('MISS consts')
const newConsts = `    /* 规格直接复刻 DSH 自己的分段控件
     * （packages/client/ui-primitives/src/SegmentedTabs.module.css）：
     *   md：轨道 inset 4px / radius-lg；标签高 34 / padding 0 12 / 14px·20px
     *       选中块 radius-md + 0.5px border-l3 + bg-layer-3，transform 180ms ease 滑动
     *       未选 400 次级色，选中 600 主色
     *   sm：inset 2px / 高 30 / 选中 500（轨道圆角 = radius-md + inset）
     * 用到宿主自己的令牌，亮暗两套自动成立，不写死任何颜色。
     */
    const SEG_MD = { inset: 4, h: 34, font: 14, weight: 600, radius: 'var(--dsw-radius-lg)' }
    const SEG_SM = { inset: 2, h: 30, font: 13, weight: 500, radius: 'calc(var(--dsw-radius-md) + 2px)' }
    const SEG_PAD = 12
    const SEG_MIN = 60
    const TABS_TRACK_PROPS = [
      'display', 'align-items', 'position', 'padding', 'border-radius', 'background',
      'width', 'min-width', 'max-width', 'flex', 'flex-wrap', 'gap', 'align-self', 'isolation',
      '--ahig-seg-n', '--ahig-seg-i', '--ahig-seg-inset',
    ]
    const TABS_BTN_PROPS = [
      'display', 'align-items', 'justify-content', 'box-sizing', 'height', 'min-height',
      'width', 'min-width', 'padding', 'border-radius', 'font-size', 'line-height',
      'font-weight', 'color', 'background', 'flex', 'white-space', 'transition', 'position', 'z-index',
    ]
`
s = s.replace(oldConsts, newConsts)

/* ---------- 2) 量宽 + 画 ---------- */
const startPaint = s.indexOf('    function tabSegWidth(btns) {')
const endPaint = s.indexOf('    function syncTabs() {')
if (startPaint < 0 || endPaint < 0) throw new Error('MISS paint range')
const newPaint = `    /** 等宽分段：取「最宽文本 + 两侧 12px」，下限 60px。 */
    function tabSegWidth(btns, spec) {
      let max = 0
      for (const b of btns) max = Math.max(max, tabTextWidth(b))
      return Math.max(SEG_MIN, Math.ceil(max) + SEG_PAD * 2)
    }

    function tabsNeed(btns, spec) {
      return tabSegWidth(btns, spec) * btns.length + spec.inset * 2
    }

    /** 这一行（tablist 的父元素）在扣掉兄弟元素后还剩多宽。 */
    function tabsRoom(list) {
      const host = list && list.parentElement
      if (!host || typeof host.getBoundingClientRect !== 'function') return 0
      const box = host.getBoundingClientRect()
      if (!box || !box.width) return 0
      let used = 16
      const kids = host.children ? Array.from(host.children) : []
      for (const sib of kids) {
        if (sib === list) continue
        const r = typeof sib.getBoundingClientRect === 'function' ? sib.getBoundingClientRect() : null
        if (r && r.width) used += r.width + 8
      }
      return Math.max(0, box.width - used)
    }

    /** 同名标签加序号（HIG：同级选项要可区分；这里只加视觉标记与 tooltip，不改文案）。 */
    function markDuplicates(btns) {
      const groups = new Map()
      for (const b of btns) {
        const key = (b.textContent || '').replace(/\\s+/g, '')
        if (!key) continue
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(b)
      }
      for (const [key, list] of groups) {
        if (list.length < 2) continue
        list.forEach((b, i) => {
          try {
            b.setAttribute('data-ahig-dup', String(i + 1))
            const hint = key === '上下文' ? '上下文（来源 ' + (i === 0 ? 'dsh-context' : 'billion-context') + '）' : key + '（第 ' + (i + 1) + ' 个）'
            if (!b.getAttribute('title')) b.setAttribute('title', hint)
          } catch {}
        })
      }
    }

    function clearDuplicates(btns) {
      for (const b of btns || []) {
        try {
          b.removeAttribute('data-ahig-dup')
          if ((b.getAttribute('title') || '').indexOf('来源 ') >= 0) b.removeAttribute('title')
          else if ((b.getAttribute('title') || '').indexOf('（第 ') >= 0) b.removeAttribute('title')
        } catch {}
      }
    }

    function paintTabs(list, btns, spec) {
      const segW = tabSegWidth(btns, spec)
      const total = segW * btns.length + spec.inset * 2
      const selected = Math.max(0, btns.findIndex((b) => b.getAttribute('aria-selected') === 'true'))
      const st = list && list.style
      if (st) {
        st.setProperty('display', 'inline-flex')
        st.setProperty('align-items', 'center')
        st.setProperty('position', 'relative')
        st.setProperty('isolation', 'isolate')
        st.setProperty('gap', '0px')
        st.setProperty('padding', spec.inset + 'px')
        st.setProperty('align-self', 'center')
        st.setProperty('flex', '0 0 auto')
        st.setProperty('flex-wrap', 'nowrap')
        st.setProperty('border-radius', spec.radius)
        st.setProperty('background', 'var(--dsw-alias-bg-module-platform)')
        st.setProperty('width', total + 'px')
        st.setProperty('min-width', total + 'px')
        st.setProperty('max-width', 'none')
        st.setProperty('--ahig-seg-n', String(btns.length))
        st.setProperty('--ahig-seg-i', String(selected))
        st.setProperty('--ahig-seg-inset', spec.inset + 'px')
      }
      for (const b of btns) {
        const bs = b.style
        if (!bs) continue
        bs.setProperty('display', 'inline-flex')
        bs.setProperty('align-items', 'center')
        bs.setProperty('justify-content', 'center')
        bs.setProperty('box-sizing', 'border-box')
        bs.setProperty('height', spec.h + 'px')
        bs.setProperty('min-height', spec.h + 'px')
        bs.setProperty('width', segW + 'px')
        bs.setProperty('min-width', segW + 'px')
        bs.setProperty('padding', '0 ' + SEG_PAD + 'px')
        bs.setProperty('flex', '0 0 auto')
        bs.setProperty('white-space', 'nowrap')
        bs.setProperty('border-radius', 'var(--dsw-radius-md)')
        bs.setProperty('background', 'transparent')
        bs.setProperty('font-size', spec.font + 'px')
        bs.setProperty('line-height', '20px')
        bs.setProperty('color', 'var(--dsw-alias-label-secondary)')
        bs.setProperty('transition', 'color 180ms ease')
        bs.setProperty('position', 'relative')
        bs.setProperty('z-index', '1')
      }
      markDuplicates(btns)
      if (list && list.setAttribute) {
        list.setAttribute(TABS_ON, '1')
        list.setAttribute('data-ahig-tabs-size', spec === SEG_SM ? 'sm' : 'md')
      }
    }

    function unpaintTabs(list, btns) {
      if (list && list.removeAttribute) {
        list.removeAttribute(TABS_ON)
        list.removeAttribute('data-ahig-tabs-size')
      }
      if (list && list.style) for (const k of TABS_TRACK_PROPS) list.style.removeProperty(k)
      for (const b of btns || []) {
        if (!b.style) continue
        for (const k of TABS_BTN_PROPS) b.style.removeProperty(k)
      }
      clearDuplicates(btns)
    }

`
s = s.slice(0, startPaint) + newPaint + s.slice(endPaint)

/* ---------- 3) syncTabs：md → sm → 退回 ---------- */
const oldSync = s.slice(s.indexOf('    function syncTabs() {'), s.indexOf('    function startTabs() {'))
const newSync = `    function syncTabs() {
      try {
        if (typeof document === 'undefined') return
        const list = tabsList()
        if (!list) return
        const btns = tabsBtns(list)
        if (!prefs.chrome || btns.length < 2) {
          unpaintTabs(list, btns)
          return
        }
        const room = tabsRoom(list)
        const mdNeed = tabsNeed(btns, SEG_MD)
        const smNeed = tabsNeed(btns, SEG_SM)
        /* 先量后画：md 放得下用 md，放不下退 sm，再放不下整条退回宿主下划线样式。 */
        if (room > 0 && mdNeed <= room - 8) paintTabs(list, btns, SEG_MD)
        else if (room > 0 && smNeed <= room - 8) paintTabs(list, btns, SEG_SM)
        else unpaintTabs(list, btns)
      } catch (e) {
        /* 静默降级：画不出来就保持宿主原样 */
      }
    }

`
if (!oldSync) throw new Error('MISS sync')
s = s.replace(oldSync, newSync)

/* ---------- 4) CSS 段 ---------- */
const cssStart = s.indexOf(`      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]::after{display:none}',`)
const cssEnd = s.indexOf(`      /* ==== L3 阅读宽度 ====`, cssStart)
if (cssStart < 0 || cssEnd < 0) throw new Error('MISS css block')
const newCss = `      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"]{position:relative;isolation:isolate}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"]::before{content:"";position:absolute;top:var(--ahig-seg-inset,4px);bottom:var(--ahig-seg-inset,4px);left:var(--ahig-seg-inset,4px);width:calc((100% - 2 * var(--ahig-seg-inset,4px)) / var(--ahig-seg-n,1));box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);transform:translateX(calc(var(--ahig-seg-i,0) * 100%));transition:transform 180ms ease;pointer-events:none;z-index:0}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]{background:transparent!important;color:var(--dsw-alias-label-secondary)!important;transition:color 180ms ease}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]::after{display:none!important}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]:hover{color:var(--dsw-alias-label-primary)!important}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"][aria-selected="true"]{color:var(--dsw-alias-label-primary)!important;font-weight:600}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"][data-ahig-tabs-size="sm"] > [role="tab"][aria-selected="true"]{font-weight:500}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"][data-ahig-dup]::after{content:attr(data-ahig-dup);display:inline-block!important;margin-left:3px;transform:translateY(-5px);font-size:9px;line-height:1;font-weight:500;color:var(--dsw-alias-label-tertiary);z-index:2}',
      '@media (prefers-reduced-motion:reduce){html[data-ahig-chrome="1"] [data-ahig-tabs="1"]::before{transition:none}}',

`
s = s.slice(0, cssStart) + newCss + s.slice(cssEnd)

s = s.replace("const VERSION = '0.9.1'", "const VERSION = '0.9.2'")
fs.writeFileSync(F, s, 'utf8')

const P = 'E:/工作区/生成个插件/dsh-apple-hig/package.json'
fs.writeFileSync(P, fs.readFileSync(P, 'utf8').replace('"version": "0.9.1"', '"version": "0.9.2"'), 'utf8')
console.log('ok')
