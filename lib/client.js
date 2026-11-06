/**
 * dsh-apple-hig —— 按 Apple 人机界面规范（HIG）校正 DSH 界面（客户端半边）
 *
 * 为什么是这个形态
 * ----------------
 * DSH 的界面类名是构建期哈希（如 `mP3x-q_bottomRow`），版本一变就失效；
 * 官方也没有给「重排界面」的 API。所以本插件只走两条被实测验证过的通道：
 *
 *   1. `theme.overrideTokens(source, tokens)` —— 设计 token 层。
 *      `validateOverrides` 不做白名单校验（只要求 light/dark 成对），因此
 *      任意 `--dsw-*` / `--dsh-*` 变量都能覆盖；按 source 叠层，卸载时由
 *      disposer 整层回收，属于「改完即回滚」的通道。
 *   2. 结构属性钩子 + 自注入样式表 —— 覆盖 token 表达不了的东西。
 *      宿主自己就在用这些属性做样式（证据见每条规则上的注释），不是我们编的：
 *      `[data-shell-bottom]`、`[data-shell-overlay]`、`[data-composer-card]`、
 *      `[data-conversation-tabs]`，以及每个 slot 渲染出的
 *      `<div data-slot="…">` 锚点（`ANCHOR_STYLE = { display: "contents" }`，
 *      所以锚点本身不产生盒子，样式必须打在它的父级或子级上）。
 *
 * 每一项都对应一条 HIG 结论或一条实测缺陷，逐项可关、默认只开「低风险且
 * 有客观判据」的那些（见 README 的「依据表」）。找不到结构时静默降级：
 * 最坏情况等于没装，不会抛错、不会改动节点。
 */

window.__ModuleLoader__.load({
  id: 'dsh-apple-hig',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState } = React

    const VERSION = '0.10.2'
    const PACKAGE_ID = 'dsh-apple-hig'
    const STORE_KEY = 'dsh-apple-hig:v1'
    /** token 层的 source 前缀：同一 source 重入会整层替换，卸载时由 disposer 回收。 */
    const SOURCE = 'apple-hig'
    const STYLE_ATTR = 'data-plugin-css'
    const SETTINGS_SLOT = 'settings.section'
    const SETTINGS_ID = 'apple-hig'
    const SETTINGS_LABEL = 'Apple 规范'

    // #region 字体族预设
    // ---------------------------------------------------------------------
    // DSH 默认字体族（`--dsh-font-family-text-default`）是 Apple-first 的栈，
    // 但在 Windows 上 `-apple-system` / `BlinkMacSystemFont` 不生效，实际落到
    // Segoe UI + 微软雅黑。两个预设的差别只在「先试谁」，都保留完整 CJK 回退。
    // 用户若在「设置 → 外观」里自己选过字体，`--dsh-font-family-text` 会先命中，
    // 本插件不去抢（只改 default 兜底值）。
    // ---------------------------------------------------------------------
    const FONT_DEFAULT =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    const FONT_NATIVE =
      '"Segoe UI Variable Text", "Segoe UI", system-ui, "Microsoft YaHei UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
    const FONT_APPLE =
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'

    const FONT_PRESETS = [
      { id: 'native', label: '平台原生（Windows）', hint: 'Segoe UI Variable Text 优先，最接近 SF 的本地替代' },
      { id: 'apple', label: 'Apple 栈', hint: 'SF Pro / -apple-system 优先，非 Apple 平台回退到系统字体' },
      { id: 'off', label: '不改字体', hint: '保持 DSH 自带的字体栈' },
    ]
    // #endregion

    // #region 偏好
    // ---------------------------------------------------------------------
    // 只落一个 localStorage 键；任何字段坏掉都退回默认值，绝不整体崩。
    // ---------------------------------------------------------------------
    const platformIsDarwin = () => {
      try {
        const el = document.documentElement
        return el.getAttribute('data-platform') === 'darwin' || /Mac/i.test(navigator.platform || '')
      } catch {
        return false
      }
    }

    const defaults = () => ({
      /** 焦点环：DSH 的 --dsw-focus-ring-color 是 transparent，键盘焦点不可见。 */
      focusRing: true,
      /** 浅色模式三级文字/说明文字对比度不足 4.5:1（实测 3.71 / 2.13）。 */
      textContrast: true,
      /** 品牌字体 Montserrat 带一档 Light，违反 HIG「避免 Light 及以下字重」。 */
      brandFont: true,
      /** 字体族预设：native / apple / off */
      fontPreset: platformIsDarwin() ? 'apple' : 'native',
      /** 底部状态栏降存在感（HIG：不要把关键信息放在窗口最底部）。 */
      statusBar: true,
      /** 跟随系统「减少动态效果」。 */
      reducedMotion: true,
      /** 连续圆角（squircle）：只有支持 corner-shape 的引擎才生效，默认关。 */
      squircle: false,

      // ---- L2：材质与形状层（v0.2.0 起默认开，这是「看得见」的那一档）----
      /**
       * 控件材质：把 composer 输入卡做成「浮在内容之上的一层」——
       * 半透明 + backdrop-filter + 抬升阴影 + 0.5px 描边，内容滚动时能透出。
       * 依据 HIG Layout「区分控件与内容：用材质把控件浮起来」。
       */
      material: true,
      /**
       * 圆角梯度：xs/sm/md/lg/xl/panel 由 4/8/12/16/20/28 调到 6/9/13/17/21/22。
       * 依据 HIG 连续圆角：小控件略圆、大面板收一点，避免「胶囊感」。
       */
      radius: true,
      /**
       * 间距节奏：对话流默认行距 6→10px、输入卡内间距 12→14px、侧栏内边距 12→14px。
       * 依据 HIG Layout「用负空间分组、给内容留呼吸」。
       */
      rhythm: true,

      // ---- L3：布局层（v0.3.0）----
      /**
       * 顶栏紧凑 + 视图标签分段控件：宿主的「标题行 + 标签行」堆到 ≈92px，
       * HIG 的 macOS toolbar 约 52pt、同级视图切换用 segmented control。
       */
      chrome: true,
      /**
       * 阅读宽度：正文与输入卡同宽对齐，单栏收紧到舒适行宽。
       * 依据 HIG Layout「内容与控件对齐」「单栏阅读宽度」。
       */
      measure: true,
      /**
       * 控件行统一（composer 芯片行）：同一行里「完全权限 / 古籍 / 记忆·智能 / 专家 /
       * 模型 / +」来自四个不同来源，各自 28px·24px·纯文字三套几何。统一盒型，保留状态色。
       */
      chips: true,
      /**
       * 侧栏：行高统一、时间戳从 10px 提到 11px、行内动作按钮命中区 16→24px、
       * 选中态与悬停分开、用量卡分隔线 1px→0.5px 并统一等宽数字。
       */
      sidebar: true,
      /**
       * 切换动画：侧栏收起/展开走 grid-template-columns 过渡；
       * 点侧栏里的会话换主区内容时，只改 [data-conversation-session] 属性值、
       * 不换节点，CSS 感知不到，所以那一下由 MutationObserver 补一个进场动画。
       */
      transition: true,
      /**
       * 会话树拖拽：只做「源行淡出 + 拖影阴影」的装饰。
       * 拖影、落点线、顺序提交全在宿主（dsh-client-ui-workspace bundle），我们一律不接管。
       */
      drag: true,
      /**
       * 拖拽浮卡（v0.10.1，默认关）：把宿主的位图拖影换成 1×1 透明图，
       * 由我们自己贴一张 fixed 卡片跟手。默认关——它要多接管一步 setDragImage
       * （在宿主之后覆盖），属于实验层；关掉即回到「宿主拖影 + 圆角阴影」的表现。
       */
      dragCard: false,
      /**
       * 标签条去重：默认关闭。
       * 曾经默认开启，用来隐藏「同文案」的重复标签；但实测两个「上下文」分别是
       * dsh-context 的 context（order 20）与 billion-context 的 bili-context（order 30）——
       * 是两个插件各自合法的视图，按文案隐藏会把后者的入口整个吃掉。
       * 保留开关，只给「确实同一插件重复注册」的极端情况用。
       */
    })

    let prefs = defaults()
    const listeners = new Set()

    function sanitize(raw) {
      const base = defaults()
      if (!raw || typeof raw !== 'object') return base
      const out = { ...base }
      for (const key of [
        'focusRing',
        'textContrast',
        'brandFont',
        'statusBar',
        'reducedMotion',
        'squircle',
        'material',
        'radius',
        'rhythm',
        'chrome',
        'measure',
        'chips',
        'sidebar',
        'transition',
        'drag',
        'dragCard',
      ]) {
        if (typeof raw[key] === 'boolean') out[key] = raw[key]
      }
      if (FONT_PRESETS.some((p) => p.id === raw.fontPreset)) out.fontPreset = raw.fontPreset
      return out
    }

    function load() {
      try {
        const text = localStorage.getItem(STORE_KEY)
        return sanitize(text ? JSON.parse(text) : null)
      } catch {
        return defaults()
      }
    }

    function save(next) {
      prefs = next
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next))
      } catch {
        /* 存不进去也不影响本次会话 */
      }
      for (const fn of listeners) {
        try {
          fn(next)
        } catch (error) {
          log('listener 失败', error)
        }
      }
      applyPrefs()
    }

    function patch(next) {
      save(sanitize({ ...prefs, ...next }))
    }

    function usePrefs() {
      const [, bump] = useState(0)
      useEffect(() => {
        const fn = () => bump((v) => v + 1)
        listeners.add(fn)
        return () => listeners.delete(fn)
      }, [])
      return prefs
    }
    // #endregion

    // #region 日志
    const log = (...args) => {
      try {
        if (localStorage.getItem(PACKAGE_ID + ':debug') === '1') console.log('[' + PACKAGE_ID + ']', ...args)
      } catch {
        /* ignore */
      }
    }
    const warn = (...args) => {
      try {
        console.warn('[' + PACKAGE_ID + ']', ...args)
      } catch {
        /* ignore */
      }
    }
    // #endregion

    // #region token 覆盖
    // ---------------------------------------------------------------------
    // 每项一组 token = 一个独立的 source 层。关一项就只回收那一层，
    // 不会把别项的覆盖一起带走（overrideTokens 的 disposer 只回收自己那层）。
    //
    // 被改的每一项都必须成对给 light/dark；「另一档保持不变」时显式写回原值，
    // 而不是省略 —— 省略会被 validateOverrides 判成形状不合法（裸字符串直接 throw）。
    // ---------------------------------------------------------------------
    const BRAND_FALLBACK = 'var(--dsw-font-family-text-default)'
    const FOCUS_COLOR = 'var(--dsw-alias-state-business-primary)'

    function tokenGroups(p) {
      const groups = []

      if (p.focusRing) {
        groups.push([
          'focus-ring',
          {
            // 基座 CSS：outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color)
            // 而 --dsw-focus-ring-color 被定义成 transparent，导致 5 处 fallback 永不生效。
            '--dsw-focus-ring-color': { light: FOCUS_COLOR, dark: FOCUS_COLOR },
            // 2px → 3px：Apple 的焦点环是「看得见但不刺眼」的一圈，宽度跟着加一档。
            '--dsw-focus-ring-width': { light: '3px', dark: '3px' },
          },
        ])
      }

      if (p.textContrast) {
        groups.push([
          'text-contrast',
          {
            // 浅色：#81858c 3.71:1、#adb2b8 2.13:1（对 #fff），均低于 WCAG 正文 4.5:1。
            // 换成 #696e76 (5.13) / #6d727a (4.84)，并保持「tertiary 比 caption 更深」的原层级。
            // 深色档本来就达标（8.54 / 4.92），原样写回。
            '--dsw-alias-label-tertiary': {
              light: '#696e76',
              dark: 'var(--dsw-static-neutral-bluish-400)',
            },
            '--dsw-alias-label-caption': {
              light: '#6d727a',
              dark: 'var(--dsw-static-neutral-bluish-600)',
            },
          },
        ])
      }

      if (p.brandFont) {
        groups.push([
          'brand-font',
          {
            // 原值 "Montserrat", var(--dsh-font-family-text-default)，
            // 带 regular/medium/light 三档 woff2。去掉 Montserrat：
            // 少一个字体族（HIG: minimize the number of typefaces），
            // 同时消除 Light 字重的使用面（HIG: avoid light font weights）。
            '--dsw-font-family-brand': { light: BRAND_FALLBACK, dark: BRAND_FALLBACK },
          },
        ])
      }

      // ---- L2 圆角梯度 ----
      // 原值：xs 4 / sm 8 / md 12 / lg 16 / xl 20 / panel 28（parse3.mjs 实测）。
      // 这一层是「全应用可见」的：按钮、菜单行、标签、输入卡片、弹层都读这几个 token。
      // 只调尺寸，不动颜色，所以 light/dark 同值（token 仍须成对给，形状校验如此）。
      if (p.radius) {
        const R = {
          '--dsw-radius-xs': '6px',
          '--dsw-radius-sm': '9px',
          '--dsw-radius-md': '13px',
          '--dsw-radius-lg': '17px',
          '--dsw-radius-xl': '21px',
          '--dsw-radius-panel': '22px',
        }
        const paired = {}
        for (const [name, value] of Object.entries(R)) paired[name] = { light: value, dark: value }
        groups.push(['radius', paired])
      }

      // ---- 顶栏分段控件的「选中块」底色 ----
      // 宿主把轨道写成 bg-module-platform、选中块写成 bg-layer-3。深色主题下这两个
      // 令牌同值（都是 bluish-800 #353638），于是选中块与轨道**完全同色**，只剩一圈
      // 0.5px 描边——真机上看起来就是个空心框。这里按主题给一档真正的抬升：
      // 浅色用 layer-3（白，天然比灰轨道亮），深色用轨道色 + 8% 白。
      groups.push([
        'segmented-pill',
        {
          '--dsw-ahig-seg-pill': {
            light: 'var(--dsw-alias-bg-layer-3)',
            dark: 'color-mix(in srgb, var(--dsw-alias-bg-module-platform), #ffffff 8%)',
          },
        },
      ])

      // ---- L2 间距节奏（能安全改的那几个）----
      // 注意：--dsh-composer-stack-gap / --dsh-composer-dock-inset / --dsh-sidebar-inline-padding
      // 都是组件在「自己身上」声明的（如 .an3WzG_composerStack{--dsh-composer-stack-gap:6px}），
      // 祖先/根上的覆盖会被元素自身的声明压住 —— 改它们必须走 CSS 层（见 rhythm 那段），
      // 这里只放真正在 :root 层生效的变量。
      if (p.rhythm) {
        groups.push([
          'rhythm',
          {
            // 对话流默认行距：宿主根上是 6px，部分子项另写 12/16px 特例。
            // 抬默认值不写 !important，特例继续赢（见 CSS 里的注释）。
            '--dsh-chat-flow-gap': { light: '10px', dark: '10px' },
          },
        ])
      }

      // ---- L3 阅读宽度（token 层）----
      // 宿主原值：正文 min(calc(100% - 32px), 920px)、输入卡 min(calc(100% - 16px), 952px)。
      // 两者不同宽 → 正文与输入卡左右边缘对不齐（HIG Layout：内容与控件对齐）。
      // 统一到 780px 一列，最窄留白 40px。
      if (p.measure) {
        groups.push([
          'measure',
          {
            '--dsh-chat-content-width': {
              light: 'min(calc(100% - 40px), 780px)',
              dark: 'min(calc(100% - 40px), 780px)',
            },
            '--dsh-composer-card-max-width': {
              light: 'min(calc(100% - 40px), 780px)',
              dark: 'min(calc(100% - 40px), 780px)',
            },
          },
        ])
      }

      if (p.fontPreset === 'native') {
        groups.push([
          'font-native',
          { '--dsh-font-family-text-default': { light: FONT_NATIVE, dark: FONT_NATIVE } },
        ])
      } else if (p.fontPreset === 'apple') {
        groups.push([
          'font-apple',
          { '--dsh-font-family-text-default': { light: FONT_APPLE, dark: FONT_APPLE } },
        ])
      }

      return groups
    }

    function applyTokenLayers() {
      const disposers = rt.tokenDisposers
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch (error) {
          warn('回收 token 层失败', error)
        }
      }
      const theme = rt.theme
      if (!theme || typeof theme.overrideTokens !== 'function') {
        warn('theme.overrideTokens 不可用，token 层未应用（样式层仍生效）')
        return
      }
      const groups = tokenGroups(prefs)
      for (const [name, tokens] of groups) {
        try {
          disposers.push(theme.overrideTokens(SOURCE + '/' + name, tokens))
        } catch (error) {
          warn('覆盖 ' + name + ' 失败', error)
        }
      }
      rt.appliedLayers = groups.map(([name]) => name)
      log('token 层', rt.appliedLayers)
    }
    // #endregion

    // #region 样式表
    // ---------------------------------------------------------------------
    // 只做 token 表达不了的三件事，全部由 <html> 上的属性开关控制：
    //   data-ahig-statusbar / data-ahig-motion / data-ahig-squircle
    //   data-ahig-material / data-ahig-rhythm / data-ahig-chrome / data-ahig-measure
    //   data-ahig-chips
    // 关掉即等于该段规则不存在，不需要重注入。
    // ---------------------------------------------------------------------
    const CSS = [
      /* ==== 底部读数行（用户说的「状态栏」）====
       * 位置取证：宿主 layout 的 <div class="…bottomRow" data-shell-bottom>
       * 只渲染 shell.bottom 这一个槽，而 desktop profile 里没有任何插件注册
       * shell.bottom（全盘 grep 只有 layout 自己出现过这个字面量）——那一行是空的。
       * 屏幕最下面那条「3 轮 305 步 · 195 tok/s ｜费用明细｜41M tok · 缓存命中 99%｜
       * 本会话 ¥2.0956… ｜◔17%」实际是 [data-composer-dock]：
       * InputBar.module.css 的 .dock{justify-content:center;gap:12px;padding-top:4px}，
       * 里面装着 conversation.composer.dock 槽（dsh-cost-meter 的 .cm-btn.cm-stat-entry
       * 与 .cm-session-cost）+ 宿主自己的 ContextMeter。
       * 三个来源各写一套字号/颜色/盒型，所以统一成一套读数排版：
       * 12px / 20px 行高 / label-secondary / tabular-nums / 10px 间隔。
       */
      'html[data-ahig-statusbar="1"] [data-composer-dock]{',
      '  gap:10px;',
      '  padding:6px 2px 0;',
      '  font-size:12px;',
      '  line-height:20px;',
      '  color:var(--dsw-alias-label-secondary);',
      '  font-variant-numeric:tabular-nums;',
      '}',
      /* 宿主自己的统计药丸（StatsPills：字号是 13px-1px、颜色 label-tertiary、
       * padding 1px 8px、radius-sm）。只把字号与颜色拉到统一档，盒子不动。 */
      'html[data-ahig-statusbar="1"] [data-composer-dock] [data-composer-stat]{',
      '  font-size:12px;line-height:20px;',
      '}',
      'html[data-ahig-statusbar="1"] [data-composer-dock] [data-composer-stat] :is(button,span){',
      '  color:var(--dsw-alias-label-secondary);',
      '  font-size:12px;',
      '}',
      /* 「费用明细」原本是一颗有底色的灰药丸，与左边无底的统计文字不是一套语言。
       * 改成同一种幽灵按钮：无底、20px 高、radius-sm、hover 才出淡底。 */
      'html[data-ahig-statusbar="1"] [data-composer-dock] .cm-btn{',
      '  height:20px!important;min-height:20px!important;',
      '  padding:0 8px!important;',
      '  border:0!important;border-radius:var(--dsw-radius-sm)!important;',
      '  background:transparent!important;',
      '  color:var(--dsw-alias-label-secondary)!important;',
      '  font:inherit!important;font-size:12px!important;line-height:20px!important;',
      '}',
      'html[data-ahig-statusbar="1"] [data-composer-dock] .cm-btn:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover)!important;',
      '  color:var(--dsw-alias-label-primary)!important;',
      '}',
      /* 会话费用那串（金额 + 命中率 + 输入/缓存/输出）原来挤成 11px 一坨：
       * 统一 12px，金额用次级色、明细用三级色，靠颜色分主次而不是靠字号堆。 */
      'html[data-ahig-statusbar="1"] [data-composer-dock] .cm-session-cost{',
      '  font-size:12px!important;line-height:20px!important;',
      '}',
      'html[data-ahig-statusbar="1"] [data-composer-dock] .cm-session-amount{',
      '  color:var(--dsw-alias-label-secondary)!important;',
      '  font-variant-numeric:tabular-nums;',
      '}',
      'html[data-ahig-statusbar="1"] [data-composer-dock] .cm-session-detail{',
      '  color:var(--dsw-alias-label-tertiary)!important;',
      '}',
      /* 兜底：若某个 profile 真的把内容塞进了 shell.bottom，这一行也按同一套排版走 */
      'html[data-ahig-statusbar="1"] [data-shell-bottom]{',
      '  background:transparent!important;',
      '  opacity:.8;',
      '  transition:opacity .18s ease;',
      '  font-variant-numeric:tabular-nums;',
      '}',
      'html[data-ahig-statusbar="1"] [data-shell-bottom]:hover,',
      'html[data-ahig-statusbar="1"] [data-shell-bottom]:focus-within{opacity:1}',

      /* ==== L2 材质：区分控件与内容（HIG Layout / Materials）====
       * 只动 composer 输入卡：它是唯一「浮在可滚动内容之上」的控件，
       * 半透明 + 模糊才有东西可透。侧栏背后是纯窗口底色，模糊等于白烧 GPU，
       * 所以侧栏只加一条 0.5px 分界，不加 backdrop-filter。
       * 阴影直接复用宿主的 --dsw-elevation-prominent，不另造数值。
       */
      'html[data-ahig-material="1"] [data-composer-card]{',
      '  background: color-mix(in srgb, var(--dsw-specific-input-major) 88%, transparent) !important;',
      '  -webkit-backdrop-filter: blur(24px) saturate(180%);',
      '  backdrop-filter: blur(24px) saturate(180%);',
      /* 注意：--dsw-elevation-prominent 本身就含 elevation-stroke（0 0 0 .5px 描边），
       * 卡片自己又把 --dsw-elevation-stroke-color 绑到 border-l2，
       * 所以这里不再另外叠描边，避免两条 0.5px 线叠在一起。 */
      '  box-shadow: var(--dsw-elevation-prominent) !important;',
      '  transition: box-shadow .18s ease, background-color .18s ease;',
      '}',
      'html[data-ahig-material="1"] [data-composer-card]:focus-within{',
      '  box-shadow: var(--dsw-elevation-prominent), 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent) !important;',
      '}',

      /* 侧栏分界：宿主 centerCol 是 border-left:none，侧栏与主区之间本来没有线。
       * HIG：分组靠负空间/容器/分隔线 —— 补一条 0.5px 半透明线就够，不动留白。 */
      'html[data-ahig-material="1"] [data-slot="sidebar"] > div{',
      '  box-shadow: inset -.5px 0 0 var(--dsw-alias-border-l2);',
      '}',

      /* 状态栏细线：代替整块底色（与 statusbar 那档的「低存在感」配套） */
      'html[data-ahig-material="1"] [data-shell-bottom]{',
      '  box-shadow: inset 0 .5px 0 var(--dsw-alias-border-l1);',
      '}',

      /* ==== L2 间距节奏 ====
       * 对话流行距：宿主是 margin-top:var(--dsh-chat-flow-gap,6px)，变量按「组」在
       * 子元素上另声明 12px/16px 特例。这里只抬默认值、不写 !important，
       * 让宿主的特例继续赢（否则会把「一轮对话内部/轮与轮之间」的层级压平）。
       */
      'html[data-ahig-rhythm="1"] [data-slot="conversation.chat.flow"]{--dsh-chat-flow-gap:10px}',
      /* 输入卡内间距 12→14、顶部 8→10 */
      'html[data-ahig-rhythm="1"] [data-composer-card]{gap:14px;padding-top:10px}',
      /* 侧栏内边距 12→14：只改变量，padding 与 topStrip 的负 margin 都读它，
       * 一起跟着变，不会错位。 */
      'html[data-ahig-rhythm="1"] [data-slot="sidebar"] > div{--dsh-sidebar-inline-padding:14px}',

      /* ==== L3 布局层：顶栏紧凑 + 分段控件式视图标签 ====
       * 宿主结构（dsh-client-ui-conversation 源码实证）：
       *   <div class="…header">              ← .an3WzG_header{min-height:76px;padding:10px 28px 0 20px}
       *     <div class="…headerRow"> … [data-conversation-header-corner] … </div>
       *     <div class="…tabs">              ← margin-top:10px;padding-left:8px
       *       <div role="tablist" data-conversation-tabs>   ← 这一层有稳定属性钩子
       *         <button role="tab" aria-selected="true|false" class="…tab">
       *                                            ← 下划线式：:after 2px 主色条
       * HIG：macOS 里同级视图切换用 segmented control / toolbar 高度约 52pt，
       * 而宿主把「标题行 + 标签行」堆到 min-height 76px + 标签 42px ≈ 92px。
       */
      /* 顶栏压缩：只压最外层容器（:has 限定「含 tablist 的那个 header」，
       * 不会误伤卡片头部 .F07MqG_header 之类同名类）。 */
      'html[data-ahig-chrome="1"] div:has(> div > [data-conversation-tabs]){',
      '  min-height:62px;',
      '  padding-top:8px;',
      '}',
      /* 上下留白对称：宿主 .an3WzG_tabs 给的是 margin-top:10px + padding-bottom:10px，
       * 但顶栏整体已压到 62px，这里统一成「上 6 / 下 6」，轨道不会上紧下松。 */
      /* ==== 视图标签：分段控件的「状态样式」====
       * 几何（宽高、内边距、圆角、轨道底色）由 JS 写成元素的内联样式，
       * 只有伪元素下划线与选中态这些 CSS 独有的部分留在这里，
       * 且全部挂在 [data-ahig-tabs="1"] 上——只有 JS 决定「装得下」时才生效。
       */
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"]{position:relative;isolation:isolate}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"]::before{content:"";position:absolute;top:var(--ahig-seg-inset,4px);bottom:var(--ahig-seg-inset,4px);left:var(--ahig-seg-inset,4px);width:var(--ahig-seg-w,0px);box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-ahig-seg-pill,var(--dsw-alias-bg-layer-3));transform:translate3d(var(--ahig-seg-x,0px),0,0);transition:transform 180ms ease,width 180ms ease;will-change:transform,width;pointer-events:none;z-index:0}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]{background:transparent!important;color:var(--dsw-alias-label-secondary)!important;transition:color 180ms ease}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]::after{display:none!important}',
      // 宿主把标签包在 .tabLabel{display:block;max-width:88px} 里：块级 + 上限会让量宽恒等于 88，
      // 分段于是被撑到 112px（截图里轨道右侧多出一截空白）。改成 inline-block 才能量到真实文字宽。
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"] [class*="tabLabel"]{display:inline-block;max-width:none;overflow:visible;text-overflow:clip;white-space:nowrap}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]:hover{color:var(--dsw-alias-label-primary)!important}',
      // 分段控件里未选项是常规字重（宿主下划线版是 500）：重量差本身就是「选中」的信号，
      // 两者都粗会让整条看起来比实际更重（对照 mock 实测 400/600）。
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"]:not([aria-selected="true"]){font-weight:400!important}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"] > [role="tab"][aria-selected="true"]{color:var(--dsw-alias-label-primary)!important;font-weight:600}',
      'html[data-ahig-chrome="1"] [data-ahig-tabs="1"][data-ahig-tabs-size="sm"] > [role="tab"][aria-selected="true"]{font-weight:500}',
      // 同名标签只留 title 提示（「上下文（来源 billion-context）」），不再画角标数字：
      // 角标会顶在标签上方、与分段控件抢视觉层，mock 里也没有它。
      '@media (prefers-reduced-motion:reduce){html[data-ahig-chrome="1"] [data-ahig-tabs="1"]::before{transition:none}}',

      /* ==== L3 阅读宽度 ====
       * 正文与输入卡同宽对齐（HIG Layout：内容与控件对齐、单栏控制在舒适行宽内）。
       * 两个变量都在 :root 层生效，所以走 token 层（measure 组），这里只把
       * composer 卡与正文对齐时需要的左右留白补上。
       */
      'html[data-ahig-measure="1"] [data-composer-card]{margin-inline:auto}',

      /* ==== 控件行统一（composer 芯片行）====
       * 一行里四种来源、四种盒型（全部来自各自源码，非推测）：
       *   「古籍」   dsh-literature-agents 的 .dslt-btn：高 28px、1px 实线、radius 8、
       *              字号 12px、opacity .72
       *   「记忆·智能」dsh-prime-memory 的 .dsh-mem-pill-hit：视觉高 24px、无底无边，
       *              开启时走 border-image 流光
       *   「专家」   @michengai/dsh-agency-agents 的 .aag-btn-wrap > button：
       *              纯文字 13px、padding 0 8、无描边
       *   「完全权限」「模型」宿主自己的槽（conversation.input.permission / .model）
       * HIG：同类职责的控件共用一套几何与字重，差别只体现在状态色上。
       * 因此这里只统一「盒子 + 字体 + 间距」，不碰各自的强调色 ——
       * 强调色表达的是状态（古籍开着、记忆流光、权限等级），统一掉反而丢信息。
       */
      'html[data-ahig-chips="1"] [data-composer-card] :is(',
      '  [data-slot="conversation.input.permission"] button,',
      '  [data-slot="conversation.input.model"] button,',
      '  [data-slot="conversation.input.right"] button,',
      '  .dslt-btn,',
      '  .aag-btn-wrap button,',
      '  .dsh-mem-pill-hit',
      '){',
      '  box-sizing:border-box!important;',
      '  height:26px!important;min-height:26px!important;',
      '  padding:0 9px!important;',
      '  border-radius:var(--dsw-radius-sm)!important;',
      '  font-size:12px!important;font-weight:500!important;line-height:18px!important;',
      '  gap:5px!important;',
      '  display:inline-flex!important;align-items:center!important;justify-content:center;',
      '  white-space:nowrap;',
      '}',
      /* 模型位里的推理档位（「High」「Auto」这类）是宿主 ModelSelect 的一个子 span：
       * ._9r0rkG_triggerEffort{overflow:hidden;text-overflow:ellipsis;flex-shrink:1000}。
       * 它自己开 overflow:hidden，行高一旦小于字面高度，「g」的下伸部就被行盒裁掉
       * （用户实测：High 被切）。所以这一段：①行高给足 18px；②不参与收缩——
       * 模型名过长时先省略模型名，档位保持完整可读。 */
      'html[data-ahig-chips="1"] [data-slot="conversation.input.model"] [class*="_triggerEffort"]{',
      '  flex-shrink:0;',
      '  line-height:18px;',
      '  padding-bottom:1px;',
      '}',
      /* 古籍：1px 实线比邻居重，降到 0.5px；opacity .72 让它比邻居淡一档，归 1
       * （HIG Accessibility：要降存在感不该靠压低文字不透明度） */
      'html[data-ahig-chips="1"] [data-composer-card] .dslt-btn{',
      '  opacity:1!important;border-width:.5px!important;',
      '}',
      /* 专家：原本是纯文字，补一条 0.5px 淡描边，与左边两颗有框的芯片同一套语法 */
      'html[data-ahig-chips="1"] [data-composer-card] .aag-btn-wrap button{',
      '  border:.5px solid var(--dsw-alias-border-l1);',
      '  background:transparent;',
      '  color:var(--dsw-alias-label-secondary);',
      '}',
      /* 「+」：宿主的命令入口。aria-haspopup="listbox" 是它唯一不随哈希类名漂移的钩子 */
      'html[data-ahig-chips="1"] [data-composer-card] button[aria-haspopup="listbox"]{',
      '  height:26px!important;min-height:26px!important;',
      '  width:26px!important;padding:0!important;',
      '  border-radius:var(--dsw-radius-sm)!important;',
      '}',

      /* ==== 侧栏 ====
       * 选择器纪律：DOM 上只有两种稳定钩子 —— [data-slot="sidebar"] 锚点、行上的
       * [data-row-key="session:<id>" | "workspace:<key>"]。类名是 Vite 的
       * `<hash>_<localName>` 形式，所以这里一律用 [class*="_localName"] 匹配「本名」，
       * 宿主升级换了哈希前缀也不会失效。
       *
       * 基线（读自 dsh-client-ui-workspace / -sidebar 的 CSS）：
       *   会话行 .sessionRow{height:32px}、文件夹行 .projectRow{height:34px}、
       *   顶部导航 .panelRow{min-height:36px}、分组头 .sectionHeader{height:36px}
       *   → 同一块侧栏里四档行高，眼睛要重新对一次基线。
       *   HIG Layout：同一列表内行高一致；分组之间用留白分开，不用改行高来分组。
       *   时间戳 .time{color:label-tertiary;font-size:10px;line-height:16px}
       *   → 全侧栏最小的字，也是更新频率最高的信息。
       *   行内动作 .iconButton{width:16px;height:16px} → 命中区 16px。
       *   选中 .selected{background:interactive-bg-hover} 与 hover 同色 → 选中不可辨。
       */
      /* 1. 行高：会话/文件夹 34px，顶部导航 34px（原 36）——一套基线 */
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] :is([class*="_sessionRow"],[class*="_projectRow"]){',
      '  height:34px;min-height:34px;',
      '}',
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] [class*="panelRow"]{',
      '  min-height:34px;padding-top:6px;padding-bottom:6px;',
      '}',
      /* 2. 时间戳：10px → 11px（仍是全侧栏最小一级，但不再是「注释级」），数字等宽不跳 */
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] [class*="_time"]{',
      '  font-size:11px;line-height:16px;',
      '  font-variant-numeric:tabular-nums;',
      '  letter-spacing:0;',
      '}',
      /* 3. 行内动作按钮：16×16 → 24×24 命中区（图标仍是 16，不放大字形）。
       *    行上的 .rowActions 原本写死 height:20px，跟着放到 24 才不会把按钮裁掉。 */
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] [data-row-key] [class*="iconButton"]{',
      '  width:24px;height:24px;border-radius:var(--dsw-radius-sm);',
      '}',
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] [data-row-key] [class*="rowActions"]{',
      '  height:24px;',
      '}',
      /* 4. 选中态与悬停分开：选中 = 主色 9% 底 + 0.5px 内描边；悬停保持宿主那层淡底 */
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] [data-row-key][class*="selected"]{',
      '  background:color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);',
      '  box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2);',
      '}',
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] [data-row-key][class*="selected"]:hover{',
      '  background:color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);',
      '}',
      /* 5. 侧栏用量卡（dsh-cost-meter 的 .cm-*，这几个类名没被哈希，可以直接用）：
       *    顶部那道分隔线是 1px，宿主其余分界线都是 .5px → 对齐；
       *    金额与 token 统一等宽数字，扫读时不会左右跳。 */
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] .cm-bbox{border-top-width:.5px;padding-top:10px}',
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] :is(.cm-footer-stack,.cm-bbox,.cm-bal-line,.cm-foot,.cm-today-values){',
      '  font-variant-numeric:tabular-nums;',
      '}',
      'html[data-ahig-sidebar="1"] [data-slot="sidebar"] .cm-today-values > [data-cm-today]{',
      '  font-size:12px;line-height:18px;',
      '}',

      /* ==== 切换动画（HIG Motion：有目的、简短、可关）====
       * 1) 侧栏收起/展开：宿主把三列宽度写成 frame 上的内联 grid-template-columns，
       *    并自带一条 `.frame[data-animating]{transition:grid-template-columns
       *    var(--ds-transition-duration-slow) var(--ds-ease-in-out)}` —— 即 0.3s 的
       *    通用 ease-in-out，起步和收尾一样快，中段显得「发木」。
       *    frame 没有常驻 data 属性，用 :has(> [data-shell-bottom]) 定位它（bottomRow
       *    是 frame 的直接子元素）；拖动分隔线时（[data-dragging]）必须禁用过渡，
       *    否则列宽会拖着鼠标走。
       * 2) 切换会话：主区内容不换节点、只改 [data-conversation-session] 的值，
       *    CSS 无法感知 —— 由下面的 MutationObserver 打一次 data-ahig-enter 再放动画。
       */
      'html[data-ahig-transition="1"] div:has(> [data-shell-bottom])[data-animating]:not([data-dragging]){',
      '  transition:grid-template-columns .34s cubic-bezier(.32,.72,0,1);',
      '}',
      'html[data-ahig-transition="1"] [data-conversation-content][data-ahig-enter="1"] > [data-conversation-scroll],',
      'html[data-ahig-transition="1"] [data-conversation-content][data-ahig-enter="1"] > [data-composer-seat]{',
      '  animation:ahig-enter .22s cubic-bezier(.32,.72,0,1) both;',
      '}',
      '@keyframes ahig-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',


      // ==== 会话树拖拽（v0.10.0：只装饰，不接管）====
      // 拖影、落点线、顺序提交都在宿主的 workspace bundle 里；这里只给
      // 「源行」与「宿主生成的拖影克隆体」上色，不改任何几何。
      // 压暗只在「源行」上生效：属性是在 dragstart 的下一帧才打的，那时宿主已经把
      // 整行克隆交给 setDragImage 了（useRowDragPreview：cloneNode(true) → body.append → setDragImage），
      // 所以拖影快照里不含这个属性，不会把拖影一起压暗。
      'html[data-ahig-drag="1"] [data-ahig-src="1"]{opacity:.45;transition:opacity 120ms ease}',
      '@media (prefers-reduced-motion:reduce){html[data-ahig-drag="1"] [data-ahig-src="1"]{transition:none}}',
      // 宿主拖影是行的位图快照（useRowDragPreview 克隆后 setDragImage），
      // 圆角与阴影必须画在克隆体上，才会被一起快照带走。
      '[class*="_dragPreview"]{border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-panel,0 8px 24px #00000040);overflow:hidden}',
      // v0.10.1 浮卡（默认关）：拖影换成透明图后，真正跟手的是这张卡。
      // 尺寸由 JS 按源行 rect 写死，内容是一份去掉交互的克隆，所以内部一律 100%。
      '.ahig-float-card{position:fixed;top:0;left:0;z-index:2147483000;box-sizing:border-box;pointer-events:none;',
      '  overflow:hidden;border-radius:calc(var(--dsw-radius-md) + 2px);',
      '  background:var(--dsw-alias-bg-layer-2,#232324);',
      '  box-shadow:var(--dsw-elevation-panel,0 10px 28px #00000070);will-change:transform}',
      '.ahig-float-card>*{width:100%!important;height:100%!important;margin:0!important;box-sizing:border-box}',
      // v0.10.2 落点提示：宿主的 dropBefore / dropAfter 类决定落点，我们只把它画成
      // 「一个槽 + 一条线」。槽是行将要占的位置（开一个等高的缺口），线是插入边界。
      // 位移一律走 170ms 的减速曲线，不跟手抖；减少动态效果时全部关掉过渡。
      '.ahig-drag-layer{position:fixed;inset:0;z-index:2147482000;pointer-events:none;contain:layout style}',
      '.ahig-drop-slot{position:absolute;box-sizing:border-box;border-radius:var(--dsw-radius-sm,9px);',
      '  background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4176e6) 12%, transparent);',
      '  border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary,#4176e6) 42%, transparent);',
      '  opacity:0;transform:translateY(2px);',
      '  transition:top .17s cubic-bezier(.32,.72,0,1),left .17s cubic-bezier(.32,.72,0,1),',
      '    width .17s cubic-bezier(.32,.72,0,1),height .17s cubic-bezier(.32,.72,0,1),',
      '    opacity .14s ease,transform .18s cubic-bezier(.32,.72,0,1)}',
      '.ahig-drop-slot[data-live="1"]{opacity:1;transform:none}',
      '.ahig-drop-line{position:absolute;height:2px;border-radius:1px;',
      '  background:var(--dsw-alias-state-business-primary,#4176e6);',
      '  box-shadow:0 0 0 6px color-mix(in srgb, var(--dsw-alias-state-business-primary,#4176e6) 10%, transparent);',
      '  opacity:0;transition:top .17s cubic-bezier(.32,.72,0,1),left .17s cubic-bezier(.32,.72,0,1),',
      '    width .17s cubic-bezier(.32,.72,0,1),opacity .14s ease}',
      '.ahig-drop-line[data-live="1"]{opacity:1}',
      '@media (prefers-reduced-motion:reduce){.ahig-drop-slot,.ahig-drop-line{transition:none}}',
      // 我们画上落点后，宿主那条 ::before/::after 渐变线就重复了；只在本插件确实在画
      // （html[data-ahig-drop="1"]）时淡掉它，画不出来时宿主的线原样还在。
      'html[data-ahig-drop="1"] [class*="_dropBefore"]::before,html[data-ahig-drop="1"] [class*="_dropAfter"]::after{opacity:0;transition:opacity .12s ease}',
      /* ==== 跟随系统「减少动态效果」（HIG Motion）====
       * 基座 CSS 全文只有 1 处 prefers-reduced-motion，覆盖不到 tabs 指示器、
       * 侧栏过渡等。这里只压时长，不改 iteration-count，避免把转圈类动画冻住。
       */
      '@media (prefers-reduced-motion:reduce){',
      '  html[data-ahig-motion="1"] *,',
      '  html[data-ahig-motion="1"] *::before,',
      '  html[data-ahig-motion="1"] *::after{',
      '    animation-duration:.01ms!important;',
      '    transition-duration:.01ms!important;',
      '    scroll-behavior:auto!important;',
      '  }',
      '}',

      /* 连续圆角（squircle）
       * DSH 自己的 CSS 里已有 @supports (corner-shape:superellipse(1.5)) 分支，
       * 说明宿主留了这个钩子；这里只对「圆角矩形控件」生效，不影响圆形/图片。
       * 不支持 corner-shape 的引擎整段无效。
       */
      '@supports (corner-shape:superellipse(1.2)){',
      '  html[data-ahig-squircle="1"] button,',
      '  html[data-ahig-squircle="1"] [role="button"]{corner-shape:superellipse(1.2)}',
      '}',
    ].join('\n')

    function installStyle() {
      if (rt.styleEl && rt.styleEl.isConnected) return
      const el = document.createElement('style')
      el.setAttribute(STYLE_ATTR, PACKAGE_ID)
      el.textContent = CSS
      document.head.appendChild(el)
      rt.styleEl = el
    }

    // ==== 会话区拖拽重排（只做表现层）====
    // ---------------------------------------------------------------------
    // 宿主（dsh-client-ui-workspace）自己就实现了 HTML5 拖拽换序：
    //   行上 draggable，dragstart 里 setData("text/plain", id)，
    //   dragover 用行上下半决定 before/after，drop 后走 sessionDragOrder →
    //   setSessionOrder（全仓唯一写入方，客户端服务里没有换序 API）。
    // 所以这里**只画东西，不改顺序**：拿起来的是我们自己画的浮卡，原位置换成
    // 灰块，其余行让位；松手时把浮卡吸附到落点，真正的提交仍由宿主的 drop 完成。
    //
    // ---------------------------------------------------------------------
    // 会话树拖拽：装饰层（v0.10.0）
    //
    // 宿主（dsh-client-ui-workspace bundle）已经把拖拽做完整了：
    //   · 拖影      useRowDragPreview(...) 克隆整行后 setDragImage（:2540 / :2586）
    //   · 落点标记  行上 dropBefore / dropAfter 类 + ::before/::after 渐变线（:2561）
    //   · 提交      commitSessionDrag → sessionDragOrder → setSessionOrder（:3253）
    // 所以这里一律**不接管提交**：不 preventDefault、不碰 text/plain、不隐藏源行
    // （visibility:hidden 会直接中止 Chromium 的原生拖拽）。
    // 默认只做两件纯装饰：给源行打一个属性让它淡出；宿主生成的拖影上补圆角与阴影。
    // 打开「浮卡」后（默认关）才多接管一步 setDragImage：把宿主的位图拖影换成
    // 1×1 透明图，另画一张 fixed 卡片跟手 —— 次序见 dragStartCard 的注释。
    // ---------------------------------------------------------------------
    const DRAG_ROW_SEL = '[data-row-key^="session:"]'
    const DRAG_SRC_ATTR = 'data-ahig-src'
    const DRAG_MARK_SEL = '[class*="_dropBefore"],[class*="_dropAfter"]'
    const DRAG_PREVIEW_SEL = '[class*="_dragPreview"]'

    function dragRowOf(node) {
      return node && node.closest ? node.closest(DRAG_ROW_SEL) : null
    }

    function dragOverRow() {
      const el = document.querySelector(DRAG_MARK_SEL)
      return el && el.getAttribute ? el : null
    }

    /** 只读快照：给 dshAppleHig.drag()、设置页与 beacon 用，不写任何状态。 */
    function dragSnapshot() {
      const src = rt.dragSrc
      const over = dragOverRow()
      return {
        active: !!(src && src.isConnected),
        source: src ? src.getAttribute('data-row-key') || '' : '',
        over: over ? over.getAttribute('data-row-key') || '' : '',
        marker: over ? (/dropAfter/.test(String(over.className)) ? 'after' : 'before') : '',
        previews: document.querySelectorAll(DRAG_PREVIEW_SEL).length,
        dimmed: !!(src && src.hasAttribute(DRAG_SRC_ATTR)),
        mode: rt.dragCard ? 'card' : src ? 'decor' : '',
        landing: rt.dragLanding || '',
        slot: rt.dragSlot
          ? (function () {
              const r = rt.dragSlot.getBoundingClientRect()
              return [r.left, r.top, r.width, r.height].map(Math.round).join(',')
            })()
          : '',
        card: !!(rt.dragCard && rt.dragCard.isConnected),
        order: (function () {
          const out = []
          for (const el of document.querySelectorAll(DRAG_ROW_SEL)) {
            out.push(el.getAttribute('data-row-key') || '')
          }
          return out
        })(),
      }
    }

    function dragClear() {
      const src = rt.dragSrc
      if (src && src.removeAttribute) src.removeAttribute(DRAG_SRC_ATTR)
      rt.dragSrc = null
    }

    // ---- 浮卡（V2，默认关）---------------------------------------------
    const TRANSPARENT_GIF =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

    /** setDragImage 用的透明占位：必须已渲染（不能 display:none），否则这张图不出来 */
    function dragTransparent() {
      if (rt.dragGhost && rt.dragGhost.isConnected) return rt.dragGhost
      const img = document.createElement('img')
      img.setAttribute('alt', '')
      img.setAttribute('aria-hidden', 'true')
      img.src = TRANSPARENT_GIF
      img.style.cssText =
        'position:fixed;top:-16px;left:-16px;width:1px;height:1px;pointer-events:none;opacity:.01'
      document.body.appendChild(img)
      rt.dragGhost = img
      return img
    }

    /** 把源行克隆成一张 fixed 卡片：去掉交互与身份属性，尺寸/字体沿用源行 */
    function dragBuildCard(row, e) {
      dragCardClear()
      if (!row || !row.cloneNode) return null
      const rect = row.getBoundingClientRect()
      const cs = getComputedStyle(row)
      const card = document.createElement('div')
      card.className = 'ahig-float-card'
      card.setAttribute('aria-hidden', 'true')
      card.setAttribute('data-ahig-card', 'live')
      card.style.width = Math.max(1, Math.round(rect.width)) + 'px'
      card.style.height = Math.max(1, Math.round(rect.height)) + 'px'
      card.style.font = cs.font
      card.style.color = cs.color
      const clone = row.cloneNode(true)
      clone.removeAttribute('data-row-key')
      clone.removeAttribute(DRAG_SRC_ATTR)
      clone.removeAttribute('draggable')
      const focusables = clone.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex], [contenteditable]',
      )
      for (const el of focusables) el.setAttribute('tabindex', '-1')
      card.appendChild(clone)
      rt.dragCardOffset =
        e && typeof e.clientX === 'number'
          ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
          : { x: 0, y: 0 }
      rt.dragCard = card
      document.body.appendChild(card)
      dragMoveCard(e)
      return card
    }

    function dragMoveCard(e) {
      const card = rt.dragCard
      if (!card || !e || typeof e.clientX !== 'number') return
      const off = rt.dragCardOffset || { x: 0, y: 0 }
      card.style.transform =
        'translate3d(' + Math.round(e.clientX - off.x) + 'px,' + Math.round(e.clientY - off.y) + 'px,0)'
    }

    function dragCardClear() {
      const card = rt.dragCard
      if (card && card.parentNode) card.parentNode.removeChild(card)
      rt.dragCard = null
      rt.dragCardOffset = null
    }

    /**
     * 冒泡阶段的 dragstart：宿主的 React onDragStart 挂在根容器上（行的祖先），
     * 它先跑完并 setDragImage(克隆体)。同一次 dragstart 里后一次调用生效，
     * 所以在这里再 setDragImage(透明图) 就能把宿主那张位图拖影顶掉。
     * capture 阶段不行 —— 那时宿主还没设，会被它随后覆盖。
     */
    function dragStartCard(e) {
      if (!prefs.dragCard) return
      const row = dragRowOf(e.target)
      if (!row) return
      const dt = e.dataTransfer
      if (!dt || typeof dt.setDragImage !== 'function') return
      try {
        dt.setDragImage(dragTransparent(), 0, 0)
      } catch (err) {
        return
      }
      dragBuildCard(row, e)
      rt.dragMode = 'card'
    }

    /** 落点层（fixed，整屏），只在拖拽期间存在 */
    function dragLayer() {
      let layer = rt.dragSlotLayer
      if (layer && layer.isConnected) return layer
      layer = document.createElement('div')
      layer.className = 'ahig-drag-layer'
      layer.setAttribute('aria-hidden', 'true')
      document.body.appendChild(layer)
      rt.dragSlotLayer = layer
      return layer
    }

    function dragDropEls() {
      const layer = dragLayer()
      if (!rt.dragSlot) {
        const slot = document.createElement('div')
        slot.className = 'ahig-drop-slot'
        const line = document.createElement('div')
        line.className = 'ahig-drop-line'
        layer.appendChild(slot)
        layer.appendChild(line)
        rt.dragSlot = slot
        rt.dragLine = line
      }
      return { slot: rt.dragSlot, line: rt.dragLine }
    }

    function dragHideDrop() {
      const { slot, line } = rt.dragSlot ? dragDropEls() : {}
      if (slot) slot.removeAttribute('data-live')
      if (line) line.removeAttribute('data-live')
      document.documentElement.removeAttribute('data-ahig-drop')
      rt.dragLanding = ''
    }

    /**
     * 落点提示的唯一依据是宿主自己的判定：它在 dragover 里用 rowHalf(e) 给目标行挂
     * dropBefore / dropAfter（跨组时 by withinGroup 不给挂）。我们只读这两个类，
     * 所以画出来的位置与真正提交的位置必然一致，不存在「插件算一套、宿主算另一套」。
     */
    function dragPaintDrop() {
      const mark = dragOverRow()
      if (!mark || !rt.dragSrc) {
        dragHideDrop()
        return
      }
      const box = mark.getBoundingClientRect()
      if (!box.height) {
        dragHideDrop()
        return
      }
      const after = /dropAfter/.test(String(mark.className))
      const { slot, line } = dragDropEls()
      const h = Math.round(box.height)
      const edge = Math.round(after ? box.bottom : box.top)
      const left = Math.round(box.left)
      const width = Math.round(box.width)
      // 槽：以插入边界为中心开一个与行等高的缺口；线：压在边界上
      slot.style.top = edge - Math.round(h / 2) + 'px'
      slot.style.left = left + 'px'
      slot.style.width = width + 'px'
      slot.style.height = h + 'px'
      line.style.top = edge - 1 + 'px'
      line.style.left = left + 'px'
      line.style.width = width + 'px'
      if (!slot.hasAttribute('data-live')) {
        slot.setAttribute('data-live', '1')
        line.setAttribute('data-live', '1')
        document.documentElement.setAttribute('data-ahig-drop', '1')
      }
      const next = (after ? 'after:' : 'before:') + (mark.getAttribute('data-row-key') || '')
      rt.dragLanding = next
    }

    // 时序：我们挂在 document 的 capture 阶段，先于宿主的 React 处理器跑；
    // 也就是说这一刻读到的是**上一帧**的 dropBefore/dropAfter。于是分两步：
    //   1. 先按上一帧的标记画（保证跟手、不闪）
    //   2. 再排一个微任务，等宿主本次把类挂好后再画一次（落点因此永远与提交一致）
    // 用微任务而不是 rAF：事件派发结束就执行、不被后台窗口节流，也不会多等一帧。
    function dragOverCard(e) {
      dragPaintDrop()
      if (typeof queueMicrotask === 'function') queueMicrotask(dragPaintDrop)
      else setTimeout(dragPaintDrop, 0)
      if (!rt.dragCard) return
      dragMoveCard(e)
    }

    // 只认宿主真正发起的会话行拖拽：宿主没给 draggable（无权限 / 空白行 / 已归档）就没有这事件
    function dragStart(e) {
      const row = dragRowOf(e.target)
      if (!row) return
      dragClear()
      rt.dragSrc = row
      // 宿主在自己的 dragstart 里克隆整行交给 setDragImage；如果我们在那之前就把源行压暗，
      // 交出去的拖影会是一张变淡的快照。所以压暗推迟到下一帧（此时拖影已经取好）。
      const paint = function () {
        if (rt.dragSrc !== row) return
        if (!row.isConnected) return
        if (row.hasAttribute(DRAG_SRC_ATTR)) return
        row.setAttribute(DRAG_SRC_ATTR, '1')
      }
      // rAF 在后台窗口 / 节流的渲染进程里可能迟迟不跑（实测无头模式下 1s 才一两帧），
      // 所以再挂一个兜底定时器：谁先到谁画，paint 自己幂等。
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint)
      setTimeout(paint, 48)
    }

    function dragEnd() {
      dragClear()
      dragCardClear()
      dragHideDrop()
      const layer = rt.dragSlotLayer
      rt.dragSlotLayer = null
      rt.dragSlot = null
      rt.dragLine = null
      if (layer) {
        layer.style.transition = 'opacity .12s ease'
        layer.style.opacity = '0'
        setTimeout(function () {
          if (layer.parentNode) layer.parentNode.removeChild(layer)
        }, 140)
      }
      rt.dragMode = ''
    }

    function startDragDecor() {
      rt.dragCalls = (rt.dragCalls || []).concat('start').slice(-6)
      if (rt.dragBound) return
      rt.dragBound = true
      document.addEventListener('dragstart', dragStart, true)
      // 冒泡那一条必须晚于宿主的 onDragStart（React 在根容器上委托），见 dragStartCard
      document.addEventListener('dragstart', dragStartCard, false)
      document.addEventListener('dragover', dragOverCard, true)
      document.addEventListener('dragend', dragEnd, true)
      document.addEventListener('drop', dragEnd, true)
    }

    function stopDragDecor() {
      rt.dragCalls = (rt.dragCalls || []).concat('stop').slice(-6)
      if (!rt.dragBound) return
      rt.dragBound = false
      document.removeEventListener('dragstart', dragStart, true)
      document.removeEventListener('dragstart', dragStartCard, false)
      document.removeEventListener('dragover', dragOverCard, true)
      document.removeEventListener('dragend', dragEnd, true)
      document.removeEventListener('drop', dragEnd, true)
      dragClear()
      dragCardClear()
      rt.dragMode = ''
    }
    // #region 视图标签 → 分段控件（v0.9.0 重写）
    /* 与旧版的根本区别：**先量后画**。
     * 旧版无条件把 tablist 改成 inline-flex + max-content，一旦它所在的行装不下
     * （实测轨道被父级压到 190px，而 5 个标签要 284px），就变成整排溢出、文字互压。
     * 新版先算「标签自然宽度 + 内边距 + 间隙」与「这一行还能用多宽」，
     * 装得下才改；装不下就整条保持宿主原样 —— 宁可没有分段控件，也不要挤成一团。
     * 几何走内联样式（压过任何非 !important 规则），只有伪元素与状态样式留在 CSS。
     */
    const TABS_SEL = '[data-conversation-tabs]'
    const TABS_ON = 'data-ahig-tabs'
    /* 规格直接复刻 DSH 自己的分段控件
     * （packages/client/ui-primitives/src/SegmentedTabs.module.css）：
     *   md：轨道 inset 4px / radius-lg；标签高 34 / padding 0 12 / 14px·20px
     *       选中块 radius-md + 0.5px border-l3 + bg-layer-3，transform 180ms ease 滑动
     *       未选 400 次级色，选中 600 主色
     *   sm：inset 2px / 高 30 / 选中 500（轨道圆角 = radius-md + inset）
     * 全部借用宿主自己的令牌，亮暗两套自动成立，不写死任何颜色。
     */
    const SEG_MD = { inset: 4, h: 34, font: 14, weight: 600, radius: 'var(--dsw-radius-lg, 16px)' }
    const SEG_SM = { inset: 2, h: 30, font: 13, weight: 500, radius: 'calc(var(--dsw-radius-md) + 2px)' }
    const SEG_PAD = 12
    // 轨道下沿与顶栏分隔线的间隙。宿主的下划线式标签靠 .tab 自己的 padding-bottom:9px 撑出
    // 这段空白，换成分段控件后按钮只剩 34px、那段 padding 被清掉，轨道就贴在发丝线上。
    // 这里由 JS 直接写在 tablist 上：CSS 那条 `div:has(> div > [data-conversation-tabs])`
    // 依赖宿主 DOM 深度，宿主一改结构就静默失效（真机上 header 仍是 52px 就是证据）。
    const SEG_GAP = 10
    const TABS_TRACK_PROPS = [
      'display', 'align-items', 'position', 'padding', 'border-radius', 'background', 'box-sizing',
      'width', 'min-width', 'max-width', 'flex', 'flex-wrap', 'gap', 'align-self', 'isolation',
      'margin-bottom', '--ahig-seg-n', '--ahig-seg-i', '--ahig-seg-inset', '--ahig-seg-x', '--ahig-seg-w',
    ]
    const TABS_BTN_PROPS = [
      'display', 'align-items', 'justify-content', 'box-sizing', 'height', 'min-height',
      'width', 'min-width', 'padding', 'margin', 'border', 'border-radius', 'font-size', 'line-height',
      'font-weight', 'color', 'background', 'flex', 'white-space', 'transition', 'position', 'z-index',
    ]

    function tabsList() {
      try {
        const all = document.querySelectorAll(TABS_SEL)
        let best = null
        let bestScore = -1
        for (const el of Array.from(all)) {
          const btns = tabsBtns(el).length
          if (!btns) continue
          // 页面上可能有多个 [data-conversation-tabs]（右栏面板也会有一个）：
          // 优先「在会话区域里的那一个」，其次按钮多的那个。
          let score = btns
          if (el.closest && el.closest('[data-conversation-region]')) score += 100
          if (score > bestScore) {
            bestScore = score
            best = el
          }
        }
        return best
      } catch {
        return null
      }
    }

    /** 只认 tablist 的直接子按钮：宿主就是 [data-conversation-tabs] > button[role=tab]，
     *  用后代选择器会把别处（例如右栏面板）的 tab 也算进来。 */
    function tabsBtns(list) {
      const out = []
      const kids = list && list.children ? Array.from(list.children) : []
      for (const el of kids) {
        if (el && el.tagName === 'BUTTON' && el.getAttribute('role') === 'tab') out.push(el)
      }
      return out
    }

    // 量文字宽：宿主把标签包在 .xxx_tabLabel{display:block;max-width:88px} 里，
    // 块级元素的 Range 量出来是盒宽（88px）而不是文字宽，所以改成「离屏 span + 同一套字体」量。
    let probeSpan = null
    function tabTextWidth(btn, spec, weight) {
      const text = String(btn.textContent || '').replace(/\s+/g, ' ').trim()
      try {
        const cs = getComputedStyle(btn)
        if (typeof document.createElement === 'function' && document.body) {
          if (!probeSpan || !probeSpan.isConnected) {
            probeSpan = document.createElement('span')
            probeSpan.setAttribute('aria-hidden', 'true')
            probeSpan.style.cssText =
              'position:fixed;left:-9999px;top:-9999px;visibility:hidden;white-space:pre;pointer-events:none'
            document.body.appendChild(probeSpan)
          }
          probeSpan.style.fontFamily = cs.fontFamily
          probeSpan.style.fontSize = spec && spec.font ? spec.font + 'px' : cs.fontSize
          probeSpan.style.fontWeight = weight ? String(weight) : cs.fontWeight
          probeSpan.style.letterSpacing = cs.letterSpacing
          probeSpan.textContent = text
          const w = probeSpan.getBoundingClientRect().width
          if (w) return w
        }
      } catch {}
      try {
        if (typeof document.createRange === 'function') {
          const range = document.createRange()
          range.selectNodeContents(btn)
          const rect = range.getBoundingClientRect()
          if (rect && rect.width) return rect.width
        }
      } catch {}
      return text.length * 13
    }

    /** 每个标签的「自然宽度」＝ 目标字号下的文字宽 + 两侧 12px。
     *  注意必须按**目标字号**量：宿主 .tab 是 13px，分段控件是 14px；
     *  用当前 computedStyle 量会得到 13px 的宽度（少 3px/段），
     *  随后按钮按 14px 渲染就装不下文字——这正是「上下文」被压扁的原因。 */
    function tabNatWidth(b, spec) {
      const weight = b.getAttribute('aria-selected') === 'true' ? spec.weight : 400
      return tabTextWidth(b, spec, weight) + SEG_PAD * 2
    }

    function tabsNeed(btns, spec) {
      let sum = 0
      for (const b of btns) sum += tabNatWidth(b, spec)
      return Math.ceil(sum) + spec.inset * 2
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

    /** 同名标签加序号（HIG：同级选项要可区分；只加视觉标记与 tooltip，不改文案）。 */
    function markDuplicates(btns) {
      const groups = new Map()
      for (const b of btns) {
        const key = (b.textContent || '').replace(/\s+/g, '')
        if (!key) continue
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(b)
      }
      groups.forEach((list, key) => {
        if (list.length < 2) return
        list.forEach((b, i) => {
          try {
            b.setAttribute('data-ahig-dup', String(i + 1))
            const hint = key === '上下文'
              ? '上下文（来源 ' + (i === 0 ? 'dsh-context' : 'billion-context') + '）'
              : key + '（第 ' + (i + 1) + ' 个）'
            if (!b.getAttribute('title')) b.setAttribute('title', hint)
          } catch {}
        })
      })
    }

    function clearDuplicates(btns) {
      for (const b of btns || []) {
        try {
          b.removeAttribute('data-ahig-dup')
          const t = b.getAttribute('title') || ''
          if (t.indexOf('（来源 ') >= 0 || t.indexOf('（第 ') >= 0) b.removeAttribute('title')
        } catch {}
      }
    }

    function paintTabs(list, btns, spec) {
      const selected = Math.max(0, btns.findIndex((b) => b.getAttribute('aria-selected') === 'true'))
      const st = list && list.style
      if (st) {
        st.setProperty('display', 'inline-flex')
        st.setProperty('box-sizing', 'border-box')
        st.setProperty('align-items', 'center')
        st.setProperty('position', 'relative')
        st.setProperty('isolation', 'isolate')
        st.setProperty('gap', '0px')
        st.setProperty('padding', spec.inset + 'px')
        st.setProperty('align-self', 'center')
        st.setProperty('margin-bottom', SEG_GAP + 'px')
        st.setProperty('flex', '0 0 auto')
        st.setProperty('flex-wrap', 'nowrap')
        st.setProperty('border-radius', spec.radius)
        st.setProperty('background', 'var(--dsw-alias-bg-module-platform)')
        st.setProperty('width', 'max-content')
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
        // flex:1 1 0 + 轨道 max-content ＝「每段取自然宽的等分」，与宿主 SegmentedTabs
        // 和设计稿走的是同一条布局路径（写死像素宽会得到“最宽文字+24”，整条胖一圈）。
        bs.setProperty('width', 'auto')
        bs.setProperty('min-width', '0px')
        bs.setProperty('padding', '0 ' + SEG_PAD + 'px')
        // 宿主 .tab 为了扩大点击区写了 `margin:-10px -10px 0`（命中区左右各外扩 10px、
        // 上边还有 -10px）：不清掉的话每段的实际占位是「文字+24-20」、行高是「34-10」，
        // 于是轨道宽 188、高 32，标签互相压在一起——真机上就是这副样子。
        bs.setProperty('margin', '0px')
        bs.setProperty('border', '0px')
        bs.setProperty('flex', '1 1 0')
        bs.setProperty('white-space', 'nowrap')
        bs.setProperty('border-radius', 'var(--dsw-radius-md, 12px)')
        bs.setProperty('background', 'transparent')
        bs.setProperty('font-size', spec.font + 'px')
        bs.setProperty('line-height', '20px')
        bs.setProperty('color', 'var(--dsw-alias-label-secondary)')
        bs.setProperty('transition', 'color 180ms ease')
        bs.setProperty('position', 'relative')
        bs.setProperty('z-index', '1')
      }
      markDuplicates(btns)
      // 控件与文字绑定：轨道宽度与滑轨矩形都取实测值，而不是按 n 等分的算术值。
      // 宿主可能在下一帧替换按钮节点（React 重渲染），那时我们先前的内联宽度就没了，
      // 等分值会与真实按钮错位——这里量一次就能自愈。
      if (list && list.getBoundingClientRect && btns.length) {
        const lr = list.getBoundingClientRect()
        let sum = 0
        for (const b of btns) sum += b.getBoundingClientRect().width
        const total = Math.round(sum + spec.inset * 2)
        // 轨道宽就交给 max-content（= 各段之和 + 两侧 inset），这里只做一致性回读
        const sel = btns[Math.min(selected, btns.length - 1)]
        if (sel && sel.getBoundingClientRect) {
          const sr = sel.getBoundingClientRect()
          const x = Math.max(0, sr.left - lr.left - spec.inset)
          if (list.style) {
            list.style.setProperty('--ahig-seg-x', (Math.round(x * 100) / 100) + 'px')
            list.style.setProperty('--ahig-seg-w', (Math.round(sr.width * 100) / 100) + 'px')
          }
        }
        void total
      }
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

    function syncTabs() {
      try {
        if (typeof document === 'undefined') return
        const list = tabsList()
        if (!list) return
        const btns = tabsBtns(list)
        if (!prefs.chrome || btns.length < 2) {
          unpaintTabs(list, btns)
          return
        }
        // 列表在折叠/隐藏时所有矩形都是 0，这时算出来的段宽没有意义，
        // 直接画会把滑轨宽度写成 0（叠出「有轨道没滑轨 + 宿主下划线还在」的怪状态）。
        // 先跳过，下一帧再量。
        if (!list.getBoundingClientRect().width) {
          rt.tabsRetry = true
          return
        }
        const room = tabsRoom(list)
        /* 先量后画：md 放得下用 md，放不下退 sm，再放不下整条退回宿主下划线样式。 */
        if (room > 0 && tabsNeed(btns, SEG_MD) <= room - 8) paintTabs(list, btns, SEG_MD)
        else if (room > 0 && tabsNeed(btns, SEG_SM) <= room - 8) paintTabs(list, btns, SEG_SM)
        else unpaintTabs(list, btns)
      } catch (e) {
        /* 静默降级：画不出来就保持宿主原样 */
      }
    }

    function startTabs() {
      stopTabs()
      syncTabs()
      // 中文字体通常是后加载的：首帧用回退字体量出来的字宽偏小，字体就绪后要重算一次
      try {
        if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
          document.fonts.ready.then(() => syncTabs())
        }
      } catch {}
      try {
        rt.tabsTimer = setInterval(syncTabs, 900)
      } catch {}
      try {
        document.addEventListener('click', syncTabs, true)
        document.addEventListener('resize', syncTabs, true)
        rt.tabsBound = true
      } catch {}
    }

    function stopTabs() {
      try {
        if (rt.tabsTimer) clearInterval(rt.tabsTimer)
      } catch {}
      rt.tabsTimer = 0
      if (rt.tabsBound) {
        try {
          document.removeEventListener('click', syncTabs, true)
          document.removeEventListener('resize', syncTabs, true)
        } catch {}
        rt.tabsBound = false
      }
      const list = tabsList()
      if (list) unpaintTabs(list, tabsBtns(list))
    }
    // #endregion

    function syncAttrs() {
      const el = document.documentElement
      el.setAttribute('data-ahig', '1')
      el.setAttribute('data-ahig-statusbar', prefs.statusBar ? '1' : '0')
      el.setAttribute('data-ahig-motion', prefs.reducedMotion ? '1' : '0')
      el.setAttribute('data-ahig-squircle', prefs.squircle ? '1' : '0')
      el.setAttribute('data-ahig-material', prefs.material ? '1' : '0')
      el.setAttribute('data-ahig-radius', prefs.radius ? '1' : '0')
      el.setAttribute('data-ahig-rhythm', prefs.rhythm ? '1' : '0')
      el.setAttribute('data-ahig-chrome', prefs.chrome ? '1' : '0')
      el.setAttribute('data-ahig-measure', prefs.measure ? '1' : '0')
      el.setAttribute('data-ahig-chips', prefs.chips ? '1' : '0')
      el.setAttribute('data-ahig-sidebar', prefs.sidebar ? '1' : '0')
      el.setAttribute('data-ahig-transition', prefs.transition ? '1' : '0')
      el.setAttribute('data-ahig-drag', prefs.drag ? '1' : '0')
    }

    function applyPrefs() {
      syncAttrs()
      applyTokenLayers()
      // 触发器只在需要时才挂：关掉开关就连监听一起撤掉，不留常驻开销
      if (prefs.transition) startTransitionObserver()
      else stopTransitionObserver()
      if (prefs.drag) startDragDecor()
      else stopDragDecor()
      if (prefs.chrome) startTabs()
      else stopTabs()
    }
    // #endregion

    // #region 切换动画的触发器
    // ---------------------------------------------------------------------
    // 侧栏收起/展开纯 CSS 就够（frame 的 grid-template-columns 在变）。
    // 「点侧栏里的会话 → 主区换内容」不换 DOM 节点，只把 [data-conversation-session]
    // 的属性值换掉，CSS 选择器感知不到值变化，所以那一下需要 JS 打标。
    //
    // 只监听这一个属性（attributeFilter），不监听 childList：对话流式输出每帧都在
    // 增删文本节点，监听子树会变成常驻开销 —— 这台机器当初查过空闲 CPU 占用。
    // ---------------------------------------------------------------------
    const ENTER_ATTR = 'data-ahig-enter'
    const ENTER_MS = 320
    let enterTimer = 0

    function playEnter(el) {
      if (!el || el.isConnected === false) return
      try {
        // 先摘再挂 + 一次布局查询，同名 keyframes 才能重放（连点两个会话也生效）
        el.removeAttribute(ENTER_ATTR)
        void el.offsetWidth
        el.setAttribute(ENTER_ATTR, '1')
      } catch {
        /* ignore */
      }
      clearTimeout(enterTimer)
      enterTimer = setTimeout(() => {
        try {
          el.removeAttribute(ENTER_ATTR)
        } catch {
          /* ignore */
        }
      }, ENTER_MS)
    }

    function startTransitionObserver() {
      stopTransitionObserver()
      if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return
      try {
        rt.enterObserver = new MutationObserver((records) => {
          for (const record of records) {
            if (record.type !== 'attributes') continue
            if (record.attributeName !== 'data-conversation-session') continue
            const target = record.target
            if (!target || typeof target.hasAttribute !== 'function') continue
            if (!target.hasAttribute('data-conversation-content')) continue
            playEnter(target)
          }
        })
        rt.enterObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-conversation-session'],
          subtree: true,
        })
      } catch {
        /* ignore */
      }
    }

    function stopTransitionObserver() {
      try {
        if (rt.enterObserver) rt.enterObserver.disconnect()
      } catch {
        /* ignore */
      }
      rt.enterObserver = null
      clearTimeout(enterTimer)
    }
    // #endregion

    // #region 设置页
    // 设置页的视觉规格：对齐宿主设置面板——分组标签 + 圆角分组容器 + 0.5px 发丝分隔 +
    // 44px 行高 + 15/13/11 三级字号。颜色一律走 --dsw-alias-* 语义色，
    // 不再用 opacity 降级（那会把对比度交给底色，浅色主题下直接不达标）。
    const ui = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '2px 0 10px',
        fontSize: 13,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-primary)',
      },
      header: { display: 'flex', flexDirection: 'column', gap: 3 },
      h2: {
        margin: 0,
        fontSize: 15,
        lineHeight: '20px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      sub: { margin: 0, fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' },
      group: { display: 'flex', flexDirection: 'column', gap: 6 },
      groupLabel: {
        paddingLeft: 12,
        fontSize: 11,
        lineHeight: '14px',
        fontWeight: 600,
        letterSpacing: '.02em',
        color: 'var(--dsw-alias-label-tertiary)',
      },
      list: {
        background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08))',
        borderRadius: 10,
        overflow: 'hidden',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        boxSizing: 'border-box',
        padding: '7px 12px',
        borderTop: '0.5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2))',
      },
      rowFirst: { borderTop: 0 },
      rowText: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: '1 1 auto' },
      rowName: { fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)' },
      rowHint: {
        fontSize: 11,
        lineHeight: '15px',
        color: 'var(--dsw-alias-label-tertiary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      btn: {
        font: 'inherit',
        fontSize: 12,
        lineHeight: '16px',
        height: 28,
        padding: '0 12px',
        borderRadius: 7,
        border: '0.5px solid var(--dsw-alias-border-l3, rgba(127,127,127,.32))',
        background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.1))',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
      },
      mono: {
        fontFamily: 'ui-monospace,Consolas,monospace',
        fontSize: 11,
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-tertiary)',
      },
    }

    /** 一行：左文案（标题 + 可选一行说明）+ 右控件。分隔线只在行与行之间。 */
    function Row(props) {
      return h(
        'div',
        { style: props.first ? { ...ui.row, ...ui.rowFirst } : ui.row },
        h(
          'span',
          { style: ui.rowText },
          h('span', { style: ui.rowName }, props.name),
          props.hint
            ? h('span', { style: ui.rowHint, title: props.title || props.hint }, props.hint)
            : null,
        ),
        props.children,
      )
    }

    /** 开关：38×22 轨道 + 18 圆点（HIG 桌面尺寸），关态用填充色而不是描边。 */
    function Switch(props) {
      const on = Boolean(props.checked)
      return h(
        'label',
        {
          style: {
            position: 'relative',
            display: 'inline-flex',
            flex: '0 0 auto',
            width: 38,
            height: 22,
            cursor: 'pointer',
          },
        },
        h('input', {
          type: 'checkbox',
          role: 'switch',
          'aria-checked': on ? 'true' : 'false',
          'aria-label': props.label,
          checked: on,
          onChange: props.onChange,
          style: {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            opacity: 0,
            cursor: 'inherit',
          },
        }),
        h('span', {
          'aria-hidden': 'true',
          style: {
            position: 'absolute',
            inset: 0,
            borderRadius: 11,
            pointerEvents: 'none',
            background: on
              ? 'var(--dsw-alias-state-business-primary, #4176E6)'
              : 'var(--dsw-alias-fill-secondary, rgba(127,127,127,.34))',
            transition: 'background .16s ease',
          },
        }),
        h('span', {
          'aria-hidden': 'true',
          style: {
            position: 'absolute',
            top: 2,
            left: on ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            pointerEvents: 'none',
            boxShadow: '0 1px 2px rgba(0,0,0,.28)',
            transition: 'left .16s cubic-bezier(.32,.72,0,1)',
          },
        }),
      )
    }

    /** 分段控件：与顶栏视图标签同一套规格（inset 2 / 高 26 / 选中 600 / 滑轨跟随）。 */
    function Segmented(props) {
      const n = Math.max(1, props.options.length)
      const idx = Math.max(
        0,
        props.options.findIndex((o) => o.id === props.value),
      )
      return h(
        'div',
        {
          role: 'radiogroup',
          'aria-label': props.label,
          style: {
            position: 'relative',
            display: 'inline-grid',
            flex: '0 0 auto',
            gridTemplateColumns: 'repeat(' + n + ', minmax(56px, 1fr))',
            alignItems: 'center',
            padding: 2,
            borderRadius: 9,
            background: 'var(--dsw-alias-bg-module-platform, rgba(127,127,127,.14))',
            isolation: 'isolate',
          },
        },
        h('span', {
          'aria-hidden': 'true',
          style: {
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: 2,
            width: 'calc((100% - 4px) / ' + n + ')',
            transform: 'translateX(calc(' + idx + ' * 100%))',
            borderRadius: 7,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            border: '0.5px solid var(--dsw-alias-border-l3, rgba(127,127,127,.32))',
            background: 'var(--dsw-ahig-seg-pill, var(--dsw-alias-bg-layer-3, rgba(127,127,127,.2)))',
            transition: 'transform .18s cubic-bezier(.32,.72,0,1)',
          },
        }),
        ...props.options.map((o) =>
          h(
            'label',
            {
              key: String(o.id),
              style: {
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 26,
                padding: '0 8px',
                borderRadius: 7,
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: '16px',
                whiteSpace: 'nowrap',
                color:
                  o.id === props.value
                    ? 'var(--dsw-alias-label-primary)'
                    : 'var(--dsw-alias-label-secondary)',
                fontWeight: o.id === props.value ? 600 : 400,
              },
            },
            h('input', {
              type: 'radio',
              name: props.name,
              checked: o.id === props.value,
              onChange: () => props.onChange(o.id),
              style: {
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                margin: 0,
                opacity: 0,
                cursor: 'inherit',
              },
            }),
            h('span', null, o.label),
          ),
        ),
      )
    }

    /** 渐进披露：默认收起，点开才铺细节（HIG：默认界面只放常用项）。 */
    function Disclosure(props) {
      const [open, setOpen] = useState(false)
      return h(
        'div',
        { style: ui.list },
        h(
          'button',
          {
            type: 'button',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen(!open),
            style: {
              ...ui.row,
              ...ui.rowFirst,
              width: '100%',
              background: 'none',
              border: 0,
              font: 'inherit',
              color: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            },
          },
          h('span', { style: ui.rowText }, h('span', { style: ui.rowName }, props.name)),
          h(
            'span',
            {
              'aria-hidden': 'true',
              style: {
                flex: '0 0 auto',
                fontSize: 10,
                lineHeight: '14px',
                color: 'var(--dsw-alias-label-tertiary)',
                transform: open ? 'rotate(90deg)' : 'none',
                transition: 'transform .16s ease',
              },
            },
            '▶',
          ),
        ),
        open
          ? h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 12px 12px' } },
              props.children,
            )
          : null,
      )
    }

    /** 「为什么」只留第一句，完整说明挂 title（原来整段铺在页面上，扫读不动）。 */
    function shortWhy(text) {
      const s = String(text || '').trim()
      const cut = s.split(/[。；;]/)[0] || s
      return cut.length > 42 ? cut.slice(0, 41) + '…' : cut
    }

    /** 分段控件的标签要短：去掉括号里的限定词。 */
    function shortLabel(text) {
      return String(text || '')
        .replace(/（[^）]*）/g, '')
        .replace(/\s+$/, '')
    }

    const PREF_GROUPS = [
      { title: '布局与间距', keys: ['chrome', 'measure', 'rhythm', 'sidebar', 'chips', 'statusBar'] },
      { title: '材质与形状', keys: ['material', 'radius', 'squircle'] },
      { title: '动效', keys: ['transition', 'drag', 'dragCard', 'reducedMotion'] },
      { title: '排版与颜色', keys: ['brandFont', 'textContrast', 'focusRing'] },
    ]

    const TOGGLES = [
      {
        key: 'drag',
        label: '拖拽时的视觉反馈',
        why: '会话树拖拽全部由宿主完成（拖影、落点线、顺序提交都在 workspace bundle 里）；本插件只把源行压到 45% 不透明、给宿主生成的拖影补一层圆角与阴影。关掉即完全回到宿主原生表现',
      },
      {
        key: 'dragCard',
        label: '浮卡跟手（实验）',
        why: '把宿主的位图拖影换成透明图，另画一张 fixed 卡片跟着指针走，源行同时压暗。比默认态多接管一步 setDragImage（在宿主的调用之后覆盖），仍不改顺序、不拦事件；关掉即回到宿主拖影 + 圆角阴影',
      },
      {
        key: 'transition',
        label: '切换动画（看得见）',
        why: '侧栏收起/展开：宿主本来就有 0.3s 的 grid-template-columns 过渡，但缓动是通用 ease-in-out，中段发木；换成 .34s 的减速曲线并在拖动时禁用。切换会话：主区内容淡入 + 上移 6px（0.22s），只在 [data-conversation-session] 变化那一下触发',
      },
      {
        key: 'sidebar',
        label: '侧栏行高与命中区（看得见）',
        why: '侧栏四档行高 32/34/36/36px 统一到 34px；时间戳 10→11px 且等宽数字；行内动作命中区 16→24px；选中态与悬停分开（原来同色）；用量卡分隔线 1px→0.5px',
      },
      {
        key: 'chips',
        label: '控件行统一（看得见）',
        why: '输入卡下面那排芯片来自四个插件：古籍 28px 方框、记忆 24px 无框、专家纯文字 → 统一 26px / radius-sm / 12px / 0.5px 描边，状态色不动',
      },
      {
        key: 'chrome',
        label: '顶栏紧凑 + 分段标签（看得见）',
        why: '标题行 min-height 76→62px；视图标签由下划线式改成 macOS 分段控件（HIG：同级视图切换用 segmented control）',
      },
      {
        key: 'measure',
        label: '阅读宽度对齐（看得见）',
        why: '正文 920px 与输入卡 952px 不同宽 → 统一成 780px 一列，左右边缘对齐（HIG Layout：内容与控件对齐）',
      },
      {
        key: 'material',
        label: '控件材质（看得见）',
        why: '输入卡浮在内容之上：半透明 + 模糊 + 抬升阴影 + 0.5px 描边；侧栏与状态栏补 0.5px 分界线（HIG：区分控件与内容）',
      },
      {
        key: 'radius',
        label: '连续圆角梯度（看得见）',
        why: 'xs/sm/md/lg/xl/panel 4/8/12/16/20/28 → 6/9/13/17/21/22；按钮、菜单、输入卡、弹层都跟着变',
      },
      {
        key: 'rhythm',
        label: '间距节奏（看得见）',
        why: '对话流行距 6→10px、输入卡内间距 12→14px、侧栏内边距 12→14px（HIG：用负空间分组）',
      },
      {
        key: 'focusRing',
        label: '焦点环可见',
        why: 'DSH 把 --dsw-focus-ring-color 定义成 transparent，键盘焦点看不见（WCAG 2.4.7）',
      },
      {
        key: 'textContrast',
        label: '浅色模式文字对比度',
        why: '三级文字 3.71:1、说明文字 2.13:1 → 提到 5.13 / 4.84（WCAG 正文 4.5:1）',
      },
      {
        key: 'brandFont',
        label: '去掉品牌字体 Montserrat',
        why: 'HIG：少用字体族、避免 Light 及以下字重（该字体带一档 Light）',
      },
      {
        key: 'statusBar',
        label: '底部读数行统一',
        why: '输入卡下方那条读数行（实为 [data-composer-dock]：统计药丸 + 费用明细 + 会话费用 + 上下文环）四套来源五种字号 → 统一 12px / 20px 行高 / 次级色 / tabular-nums，费用明细由实心药丸改幽灵按钮',
      },
      {
        key: 'reducedMotion',
        label: '跟随系统「减少动态效果」',
        why: 'HIG：动效要能关；DSH 基座只有 1 处 prefers-reduced-motion',
      },
      {
        key: 'squircle',
        label: '连续圆角（实验）',
        why: '只在支持 corner-shape 的引擎生效，不支持时整段无效',
      },
    ]

    function readThemeInfo() {
      try {
        const theme = rt.theme
        if (!theme || typeof theme.getTheme !== 'function') return null
        const snap = theme.getTheme()
        return {
          active: snap && snap.active,
          preference: snap && snap.preference,
          themes: snap && Array.isArray(snap.themes) ? snap.themes.length : 0,
        }
      } catch {
        return null
      }
    }

    function SettingsPage() {
      const p = usePrefs()
      const info = readThemeInfo()
      const layers = rt.appliedLayers || []
      const byKey = {}
      for (const t of TOGGLES) byKey[t.key] = t
      const fontOpt = FONT_PRESETS.filter((o) => o.id === p.fontPreset)[0] || FONT_PRESETS[0]

      const toggleRow = (key, first) => {
        const t = byKey[key]
        if (!t) return null
        return h(
          Row,
          {
            key: key,
            first: first,
            name: shortLabel(t.label),
            hint: shortWhy(t.why),
            title: t.why,
          },
          h(Switch, {
            checked: Boolean(p[key]),
            label: shortLabel(t.label),
            onChange: () => patch({ [key]: !p[key] }),
          }),
        )
      }

      const section = (group) =>
        h(
          'section',
          { key: group.title, style: ui.group },
          h('div', { style: ui.groupLabel }, group.title),
          h('div', { style: ui.list }, ...group.keys.map((k, i) => toggleRow(k, i === 0))),
        )

      return h(
        'div',
        { 'data-ahig-settings': '1', style: ui.page },

        h(
          'header',
          { style: ui.header },
          h('h2', { style: ui.h2 }, 'Apple 规范'),
          h(
            'p',
            { style: ui.sub },
            '按 HIG 校正 DSH 的外观细节，逐项可关。改完立即生效；插件本体改动需完全退出 DSH 再开。',
          ),
        ),

        ...PREF_GROUPS.map(section),

        h(
          'section',
          { style: ui.group },
          h('div', { style: ui.groupLabel }, '字体'),
          h(
            'div',
            { style: ui.list },
            h(
              Row,
              { first: true, name: '字体族预设', hint: fontOpt.hint, title: fontOpt.hint },
              h(Segmented, {
                name: 'ahig-font-preset',
                label: '字体族预设',
                value: p.fontPreset,
                options: FONT_PRESETS.map((o) => ({ id: o.id, label: shortLabel(o.label) })),
                onChange: (id) => patch({ fontPreset: id }),
              }),
            ),
          ),
        ),

        h(
          'section',
          { style: ui.group },
          h('div', { style: ui.groupLabel }, '诊断' ),
          h(
            Disclosure,
            { name: '状态与日志' },
            h(
              'div',
              { style: ui.mono },
              info
                ? '主题 ' + (info.active || '?') + '（偏好 ' + (info.preference || '?') + '）· token 层 ' + layers.length + ' 个'
                : 'theme 服务不可读（样式层不受影响）',
            ),
            layers.length ? h('div', { style: ui.mono }, layers.join(' · ')) : null,
          ),
        ),

        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 } },
          h(
            'button',
            { type: 'button', style: ui.btn, onClick: () => save(defaults()) },
            '恢复默认设置',
          ),
          h('span', { style: ui.mono }, 'v' + VERSION),
        ),
      )
    }

    class SettingsBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      componentDidCatch(error) {
        warn('设置页渲染失败', error)
      }
      render() {
        if (this.state.error) {
          return h(
            'div',
            { style: { ...ui.list, padding: '12px', fontSize: 12 } },
            '设置页渲染失败（' + String(this.state.error && this.state.error.message) + '），插件功能不受影响。',
          )
        }
        return h(SettingsPage)
      }
    }
    // #endregion

    // #region 生命周期
    const rt = {
      ctx: null,
      theme: null,
      slots: null,
      styleEl: null,
      tokenDisposers: [],
      appliedLayers: [],
      enterObserver: null,
      tabsTimer: 0,
      tabsBound: false,
      dragBound: false,
      dragSrc: null,
      dragCard: null,
      dragCardOffset: null,
      dragGhost: null,
      dragMode: '',
      dragSlotLayer: null,
      dragSlot: null,
      dragLine: null,
      dragLanding: '',
    }

    function teardown() {
      stopTransitionObserver()
      stopTabs()
      stopDragDecor()
      for (const dispose of rt.tokenDisposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* ignore */
        }
      }
      try {
        if (rt.styleEl) rt.styleEl.remove()
      } catch {
        /* ignore */
      }
      rt.styleEl = null
      rt.appliedLayers = []
      try {
        const el = document.documentElement
        for (const attr of [
          'data-ahig',
          'data-ahig-statusbar',
          'data-ahig-motion',
          'data-ahig-squircle',
          'data-ahig-material',
          'data-ahig-radius',
          'data-ahig-rhythm',
          'data-ahig-chrome',
          'data-ahig-measure',
          'data-ahig-chips',
          'data-ahig-sidebar',
          'data-ahig-transition',
          'data-ahig-drag',
        ]) {
          el.removeAttribute(attr)
        }
      } catch {
        /* ignore */
      }
    }


    function apply(ctx) {
      rt.ctx = ctx
      rt.slots = ctx && ctx.slots
      rt.theme = (ctx && ctx.theme) || null

      if (!rt.slots || typeof rt.slots.register !== 'function') {
        warn('slots 服务不可用，插件不启动')
        return
      }

      prefs = load()
      installStyle()
      // 单源：启动期与设置变更走同一条路（applyPrefs 里带 syncAttrs / 令牌层 /
      // 切换动画 / 拖拽 / 标签条 startTabs）。以前这里手抄了一份子集，
      // 漏掉 startTabs ⇒ 只有动过设置才画分段控件，重排（换会话/发消息）后
      // 新 DOM 节点再也没人画，真机上就退回宿主下划线样式。
      applyPrefs()
      try {
        const registerSettings = function* () {
          yield rt.slots.register(
            { name: SETTINGS_SLOT, id: SETTINGS_ID, order: 72, label: () => SETTINGS_LABEL },
            SettingsBoundary,
          )
        }
        rt.slots.inject(SETTINGS_SLOT, registerSettings)
      } catch (error) {
        warn('注册 ' + SETTINGS_SLOT + ' 失败', error)
      }

      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          teardown()
          log('已卸载')
        })
      }

      log('client ready', VERSION, prefs)
    }
    // #endregion

    module.exports = {
      name: 'dsh-apple-hig-client',
      inject: ['slots', 'theme'],
      apply,
    }

    // 便于手工排查：控制台里 dshAppleHig.reset() / .get() / .layers()
    if (typeof window !== 'undefined') {
      window.dshAppleHig = {
        version: VERSION,
        get: () => ({ ...prefs }),
        layers: () => rt.appliedLayers.slice(),
        patches: () => tokenGroups(prefs).map(([name]) => name),
        set: (next) => patch(next),
        reset: () => save(defaults()),
        // 标签条去重：被隐藏的重复标签数量（0 = 没有重复）
        tabs: () => {
          syncTabs()
          const l = tabsList()
          const bs = l ? tabsBtns(l) : []
          const seg = bs.length ? Math.round(bs[0].getBoundingClientRect().width) : 0
          return {
            on: !!(l && l.getAttribute(TABS_ON) === '1'),
            buttons: bs.length,
            seg,
            track: l ? Math.round(l.getBoundingClientRect().width) : 0,
            rail: l ? l.style.getPropertyValue('--ahig-seg-w') : '',
            text: bs.map((b) => Math.round(b.textContent.trim().length)),
          }
        },
        // 拖拽读数（只读）：宿主自己算的落点 + 本层装饰是否生效
        drag: () => dragSnapshot(),
      }
    }

    return module.exports
  },
})
