import fs from 'node:fs'

const file = 'E:/工作区/生成个插件/dsh-apple-hig/test/drag-fixture.html'
let s = fs.readFileSync(file, 'utf8')

// 1) 把「写结果」抽成函数，并留出 500ms 给清理定时器
const oldTail = `  } catch (e) { results.push('FAIL 抛异常: ' + e.message + ' @' + (e.stack||'').split(String.fromCharCode(10))[1]) }
  out.textContent = results.join('\\n') + '\\n\\nlog: ' + (log.join(' | ') || '-')
  document.title = results.some((r) => r.startsWith('FAIL')) ? 'FAIL' : 'ALL PASS'
  window.__fixture = { results }`

const newTail = `  // 连续两次拖拽：第二次在第一次的 280ms 清理窗口内开始。
  // 旧实现里第一次的清理被代次守卫跳过，灰块与行位移会留在页面上（用户录屏里的空框）。
  fire('dragstart', rs[1], rect(rs[1]).top + 20)
  fire('dragover', rs[3], rect(rs[3]).top + 10)
  fire('drop', rs[3], rect(rs[3]).top + 10)
  fire('dragstart', rs[0], rect(rs[0]).top + 20)
  fire('dragover', rs[2], rect(rs[2]).top + 10)
  fire('drop', rs[2], rect(rs[2]).top + 10)
  } catch (e) { results.push('FAIL 抛异常: ' + e.message + ' @' + (e.stack||'').split(String.fromCharCode(10))[1]) }

  const finish = () => {
    try {
      ok(document.querySelectorAll('.ahig-drag-ph').length === 0, '连续拖拽后灰块已清理', 'left=' + document.querySelectorAll('.ahig-drag-ph').length)
      const dirty = rows().filter((r) => r.style.transform)
      ok(dirty.length === 0, '连续拖拽后行位移已清理', 'left=' + dirty.length)
      const stuck = rows().filter((r) => r.hasAttribute('data-ahig-dragging'))
      ok(stuck.length === 0, '连续拖拽后行不再标记为被拖起', 'left=' + stuck.length)
    } catch (e) { results.push('FAIL 清理断言抛异常: ' + e.message) }
    out.textContent = results.join('\\n') + '\\n\\nlog: ' + (log.join(' | ') || '-')
    document.title = results.some((r) => r.startsWith('FAIL')) ? 'FAIL' : 'ALL PASS'
    window.__fixture = { results }
  }
  // 清理定时器是 DRAG_SNAP_MS + 40 = 280ms；夹具里等 500ms 再判。
  setTimeout(finish, 500)`

if (!s.includes(oldTail)) throw new Error('MISS tail')
s = s.split(oldTail).join(newTail)
fs.writeFileSync(file, s, 'utf8')
console.log('ok')
