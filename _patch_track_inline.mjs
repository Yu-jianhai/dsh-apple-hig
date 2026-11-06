import fs from 'node:fs'
const f = 'E:/工作区/生成个插件/dsh-apple-hig/lib/client.js'
let s = fs.readFileSync(f, 'utf8')

/* 1) 找到可插入的位置：tabKey 之后 */
const anchor = `    function tabKey(el) {`
if (!s.includes(anchor)) throw new Error('MISS tabKey')

const block = `    /* ==== 轨道几何：走内联样式 ====
     * 走过的弯路：同样的声明写进注入的 <style>，padding/gap 生效、width 不生效
     * （宿主 .an3WzG_viewTabs 自带 min-width:0，flex 项又默认可收缩，实测轨道被压到
     * 190px，而 5 个标签要 284px，于是整排溢出、文字互压）。与其继续赌选择器特异性，
     * 直接把决定宽度的几项写到元素的 style 上：内联样式压过任何非 !important 规则。
     */
    const TRACK_STYLE = {
      width: 'max-content',
      'min-width': 'max-content',
      flex: '0 0 auto',
      'flex-wrap': 'nowrap',
      gap: '2px',
      padding: '3px',
      'border-radius': 'var(--dsw-radius-md)',
      'align-items': 'center',
      'align-self': 'flex-start',
      background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)',
      'box-shadow': 'inset 0 0 0 .5px var(--dsw-alias-border-l1)',
    }

    function syncTabTrack() {
      try {
        if (!prefs.chrome) return
        const el = document.querySelector('[data-conversation-tabs]')
        if (!el || !el.style) return
        for (const k of Object.keys(TRACK_STYLE)) {
          if (el.style.getPropertyValue(k) !== TRACK_STYLE[k]) el.style.setProperty(k, TRACK_STYLE[k])
        }
        if (el.style.display !== 'inline-flex') el.style.display = 'inline-flex'
      } catch (e) {}
    }

    function clearTabTrack() {
      try {
        const el = document.querySelector('[data-conversation-tabs]')
        if (!el || !el.style) return
        for (const k of Object.keys(TRACK_STYLE)) el.style.removeProperty(k)
        el.style.removeProperty('display')
      } catch (e) {}
    }

    function startTabTrack() {
      stopTabTrack()
      syncTabTrack()
      try {
        rt.trackTimer = setInterval(syncTabTrack, 1500)
      } catch (e) {}
    }

    function stopTabTrack() {
      try {
        if (rt.trackTimer) clearInterval(rt.trackTimer)
      } catch (e) {}
      rt.trackTimer = 0
      clearTabTrack()
    }

` + anchor

s = s.replace(anchor, block)

/* 2) 生命周期挂钩：applyPrefs 与 apply 里随 chrome 开关起停 */
const hookFrom = `      if (prefs.transition) startTransitionObserver()
      else stopTransitionObserver()`
if (!s.includes(hookFrom)) throw new Error('MISS prefs hook')
s = s.replace(hookFrom, hookFrom + `
      if (prefs.chrome) startTabTrack()
      else stopTabTrack()`)

const applyFrom = `      if (prefs.probe) probeRender()
      if (prefs.tabDedupe) startTabDedupe()`
if (!s.includes(applyFrom)) throw new Error('MISS apply hook')
s = s.replace(applyFrom, `      if (prefs.chrome) startTabTrack()
      if (prefs.probe) probeRender()
      if (prefs.tabDedupe) startTabDedupe()`)

/* 3) teardown 里清干净 */
const teardownFrom = `        stopDragLayer()`
if (!s.includes(teardownFrom)) throw new Error('MISS teardown')
s = s.replace(teardownFrom, `        stopTabTrack()
        stopDragLayer()`)

s = s.replace("const VERSION = '0.8.12'", "const VERSION = '0.8.13'")
fs.writeFileSync(f, s, 'utf8')
fs.writeFileSync(
  'E:/工作区/生成个插件/dsh-apple-hig/package.json',
  fs.readFileSync('E:/工作区/生成个插件/dsh-apple-hig/package.json', 'utf8').replace('"version": "0.8.12"', '"version": "0.8.13"'),
  'utf8',
)
console.log('ok')
