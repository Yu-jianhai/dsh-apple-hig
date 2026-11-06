import fs from 'node:fs'

const F = 'E:/工作区/生成个插件/dsh-apple-hig/test/boot-smoke.mjs'
let s = fs.readFileSync(F, 'utf8')

const oldBlock = `globalThis.window.dshAppleHig.set({ tabDedupe: false })
ok(observers.filter((o) => !o.disconnected).length === 1, '关掉标签去重后那份 observer 撤掉')
globalThis.window.dshAppleHig.set({ tabDedupe: true })
ok(observers.filter((o) => !o.disconnected).length === 2, '重新打开标签去重又挂上（且只有一份）')`

if (!s.includes(oldBlock)) throw new Error('MISS dedupe block')

const newBlock = `// 标签条：v0.9.0 起不再有 MutationObserver，改成「点一下就同步」的 capture 监听
const TAB_TYPES = ['click', 'resize']
ok(docListeners.filter((x) => TAB_TYPES.includes(x.type)).length === 2, '标签条挂了 click/resize 两个监听')
globalThis.window.dshAppleHig.set({ chrome: false })
ok(docListeners.filter((x) => TAB_TYPES.includes(x.type)).length === 0, '关掉顶栏档后标签条监听撤掉')
globalThis.window.dshAppleHig.set({ chrome: true })
ok(docListeners.filter((x) => TAB_TYPES.includes(x.type)).length === 2, '重新打开顶栏档又挂上（各一份）')`

s = s.replace(oldBlock, newBlock)
fs.writeFileSync(F, s, 'utf8')
console.log('ok')
