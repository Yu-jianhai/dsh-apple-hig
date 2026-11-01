#!/usr/bin/env node
/**
 * install.mjs —— 把 dsh-apple-hig 挂到 DSH desktop profile 上（或卸下来）。
 *
 * 为什么不用 `dsh plugin add`：本机没有可用的 dsh CLI（PATH 与 npm 全局都没有），
 * 而本 profile 里已有的三个工作区插件（dsh-sidebar-layout / dsh-session-progress /
 * dsh-web-auth-failed）都是同一种装法 —— profile 的 package.json 里写
 * `"dsh-apple-hig": "link:E:/工作区/生成个插件/dsh-apple-hig"` + 加进
 * `dsh.profile.bundles`，再在 profile 的 node_modules 下建一个同名 junction。
 * 本脚本复刻这三步，且每一步都可回滚。
 *
 * 用法（默认 dry-run，不写任何文件）：
 *   node install.mjs              # 只打印计划
 *   node install.mjs --apply      # 真正执行
 *   node install.mjs --apply --uninstall   # 卸载
 *   node install.mjs --profile "~/.dsh/profiles/desktop"
 *
 * 执行完必须**完全退出并重启 DSH Desktop**（hmr 在 cordis.patch.yml 里被 disabled，
 * 改插件不会热更新）。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ID = 'dsh-apple-hig'
const here = path.dirname(fileURLToPath(import.meta.url))
const pkgDir = here // install.mjs 就在包根目录

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const uninstall = argv.includes('--uninstall')
const profileArgIndex = argv.indexOf('--profile')
const profileDir =
  profileArgIndex >= 0 && argv[profileArgIndex + 1]
    ? argv[profileArgIndex + 1]
    : path.join(os.homedir(), '.dsh', 'profiles', 'desktop')

const profilePkgPath = path.join(profileDir, 'package.json')
const linkDir = path.join(profileDir, 'node_modules', PKG_ID)
const linkTarget = pkgDir

const say = (s) => console.log(s)
const plan = []
const act = (description, fn) => plan.push({ description, fn })

/* ------------------------------------------------------------------ 检查 */

function fail(message) {
  console.error('\n✗ ' + message)
  process.exit(1)
}

if (!fs.existsSync(profilePkgPath)) fail('找不到 profile 的 package.json：' + profilePkgPath)
if (!fs.existsSync(path.join(pkgDir, 'package.json'))) fail('插件目录不完整：' + pkgDir)

const rawPkg = fs.readFileSync(profilePkgPath, 'utf8')
let profilePkg
try {
  profilePkg = JSON.parse(rawPkg)
} catch (error) {
  fail('profile 的 package.json 不是合法 JSON，先修好再装：' + error.message)
}
const bundles = (profilePkg.dsh && profilePkg.dsh.profile && profilePkg.dsh.profile.bundles) || []
const deps = profilePkg.dependencies || {}
const hasDep = Object.prototype.hasOwnProperty.call(deps, PKG_ID)
const hasBundle = bundles.includes(PKG_ID)
const hasLink = fs.existsSync(linkDir)

say('profile : ' + profileDir)
say('源码    : ' + pkgDir)
say('模式    : ' + (apply ? '执行' : 'dry-run（不写文件，加 --apply 才执行）') + (uninstall ? ' + 卸载' : ''))
say('')

/* ------------------------------------------------------------------ 卸载 */

if (uninstall) {
  say('待办：')
  say('  ' + (hasBundle ? '· 从 dsh.profile.bundles 移除 ' + PKG_ID : '· bundles 里本就没有 ' + PKG_ID))
  say('  ' + (hasDep ? '· 从 dependencies 移除 ' + PKG_ID : '· dependencies 里本就没有 ' + PKG_ID))
  say('  ' + (hasLink ? '· 删除 junction node_modules\\' + PKG_ID : '· junction 不存在'))

  if (!apply) {
    say('\n（dry-run）确认无误后加 --apply。')
    process.exit(0)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = profilePkgPath + '.bak-' + stamp
  fs.copyFileSync(profilePkgPath, backup)
  say('\n已备份 package.json → ' + backup)

  delete profilePkg.dependencies[PKG_ID]
  if (profilePkg.dsh && profilePkg.dsh.profile) {
    profilePkg.dsh.profile.bundles = bundles.filter((b) => b !== PKG_ID)
  }
  fs.writeFileSync(profilePkgPath, JSON.stringify(profilePkg, null, 2) + '\n', 'utf8')
  if (hasLink) fs.rmSync(linkDir, { force: true })

  say('已卸载。重启 DSH Desktop 后生效。')
  say('还原：把 ' + path.basename(backup) + ' 覆盖回 package.json，再建 junction。')
  process.exit(0)
}

/* ------------------------------------------------------------------ 安装 */

say('待办：')
say(
  '  ' +
    (hasDep
      ? '· dependencies 已有 ' + PKG_ID + '（跳过）'
      : '· dependencies 追加 "' + PKG_ID + '": "link:' + linkTarget.replace(/\\/g, '/') + '"'),
)
say(
  '  ' +
    (hasBundle
      ? '· dsh.profile.bundles 已有 ' + PKG_ID + '（跳过）'
      : '· dsh.profile.bundles 追加 "' + PKG_ID + '"'),
)
say(
  '  ' +
    (hasLink
      ? '· junction 已存在，校验指向（目标：' + linkTarget + '）'
      : '· 新建 junction node_modules\\' + PKG_ID + ' → ' + linkTarget),
)
say('  · 备份 profile package.json（时间戳 .bak）')

if (!apply) {
  say('\n（dry-run）确认无误后加 --apply。')
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = profilePkgPath + '.bak-' + stamp
fs.copyFileSync(profilePkgPath, backup)
say('\n已备份 package.json → ' + backup)

profilePkg.dependencies = { ...deps }
if (!hasDep) profilePkg.dependencies[PKG_ID] = 'link:' + linkTarget.replace(/\\/g, '/')
if (!hasBundle) {
  profilePkg.dsh = profilePkg.dsh || {}
  profilePkg.dsh.profile = profilePkg.dsh.profile || {}
  profilePkg.dsh.profile.bundles = [...bundles, PKG_ID]
}
fs.writeFileSync(profilePkgPath, JSON.stringify(profilePkg, null, 2) + '\n', 'utf8')

// 读回自证：JSON 能解析、两个键都在
const check = JSON.parse(fs.readFileSync(profilePkgPath, 'utf8'))
if (!check.dependencies[PKG_ID] || !check.dsh.profile.bundles.includes(PKG_ID)) {
  fail('写回后自检失败，请用备份还原：' + backup)
}
say('package.json 已更新并通过读回自检')

if (hasLink) {
  const now = fs.realpathSync(linkDir)
  const want = fs.realpathSync(linkTarget)
  say(now === want ? 'junction 指向正确' : 'junction 指向 ' + now + '（期望 ' + want + '），请手工修正')
} else {
  fs.mkdirSync(path.dirname(linkDir), { recursive: true })
  fs.symlinkSync(linkTarget, linkDir, 'junction')
  say('junction 已建立：' + linkDir)
}

say('\n下一步：**完全退出 DSH Desktop 再启动**（hmr 关闭，改插件不热更新）。')
say('启动后：设置 → 插件 → 应出现「' + PKG_ID + '」；侧栏/对话页设置里应有「Apple 规范」一节。')
say('回滚：node install.mjs --apply --uninstall')
