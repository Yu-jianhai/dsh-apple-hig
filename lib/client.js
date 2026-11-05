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

    const VERSION = '0.8.5'
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

    // 拖拽表现层的两个选项（v0.7.0）：三形态两回弹都做，用户在设置里挑
    const DRAG_STYLES = [
      { id: 'solid', label: '实块', hint: '落点是一块更亮的地面，最安静' },
      { id: 'dashed', label: '虚线空槽', hint: '只留轮廓，像「这里有个空格」' },
      { id: 'ghost', label: '幽灵卡', hint: '把原行以 35% 留在格子里' },
    ]
    const DRAG_BOUNCES = [
      { id: true, label: '轻回弹', hint: '略微过冲后落定（cubic-bezier(.34,1.32,.64,1)）' },
      { id: false, label: '无回弹', hint: '直接落定（cubic-bezier(.4,0,.2,1)）' },
    ]

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
       * 会话树拖拽重排（表现层）：拿着浮卡、原位置换灰块、其余行让位、松手吸附。
       * 顺序不在我们手里 —— 宿主自己拖拽 + setSessionOrder 提交，我们只画。
       */
      drag: true,
      /**
       * 灰块形态：solid 实块 / dashed 虚线空槽 / ghost 幽灵卡。
       */
      dragStyle: 'solid',
      /**
       * 放手吸附：轻回弹（略微过冲后落定）或直接落定。
       */
      dragBounce: true,
      /**
       * 标签条去重：默认关闭。
       * 曾经默认开启，用来隐藏「同文案」的重复标签；但实测两个「上下文」分别是
       * dsh-context 的 context（order 20）与 billion-context 的 bili-context（order 30）——
       * 是两个插件各自合法的视图，按文案隐藏会把后者的入口整个吃掉。
       * 保留开关，只给「确实同一插件重复注册」的极端情况用。
       */
      tabDedupe: false,
      /**
       * 诊断浮层：拖拽时在窗口右上角显示「事件有没有到、走到哪一步、为什么退出」。
       * v0.7.4 的临时探针 —— 用来判断表现层到底有没有接管，而不是继续盲修。
       */
      probe: true,
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
        'dragBounce',
        'tabDedupe',
        'probe',
      ]) {
        if (typeof raw[key] === 'boolean') out[key] = raw[key]
      }
      if (['solid', 'dashed', 'ghost'].includes(raw.dragStyle)) out.dragStyle = raw.dragStyle
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
      'html[data-ahig-chrome="1"] div:has(> [data-conversation-tabs]){margin-top:6px;padding-bottom:6px}',

      /* 视图标签 → 分段控件：容器做成一条「淡墨」轨道，选中项浮起一小块。
       * 轨道用 color-mix(label-primary 5%) 而不是固定色阶，是因为静态色阶在深色
       * 主题下被 remap 过，写死会两个主题只对一个。
       */
      'html[data-ahig-chrome="1"] div:has(> div > [data-conversation-tabs]) [role="tablist"],',
      'html[data-ahig-chrome="1"] [data-conversation-tabs]{',
      '  display:inline-flex;',
      '  flex-wrap:wrap;',
      '  align-self:flex-start;',
      '  align-items:center;',
      '  gap:2px;',
      '  min-height:0;',
      '  padding:3px;',
      '  border-radius:var(--dsw-radius-md);',
      '  background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);',
      '  box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1);',
      '}',
      'html[data-ahig-chrome="1"] div:has(> div > [data-conversation-tabs]) button[role="tab"],',
      'html[data-ahig-chrome="1"] [data-conversation-tabs] button[role="tab"]{',
      /* 宿主 .an3WzG_tab 是「line-height:16px + padding:0 0 9px」的下划线式，
       * 只改高度会留下上下不等：显式定高 + inline-flex 居中，文字在 26px 里正好居中。 */
      '  display:inline-flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  box-sizing:border-box;',
      '  height:26px;',
      '  min-height:26px;',
      '  line-height:16px;',
      '  padding:0 12px;',
      /* 按钮一律不许被压缩、文字不换行：窄窗口下宁可整条轨道换行，
       * 也不让 flex 把按钮压到比文字还窄（那会看到文字互相压住）。 */
      '  flex:0 0 auto;',
      '  white-space:nowrap;',
      '  border-radius:var(--dsw-radius-sm);',
      '  color:var(--dsw-alias-label-secondary);',
      '  transition:background-color .15s ease, color .15s ease;',
      '}',
      /* 去掉原生下划线（:after 2px 条），分段控件不需要它 */
      'html[data-ahig-chrome="1"] div:has(> div > [data-conversation-tabs]) button[role="tab"]:after{display:none}',
      'html[data-ahig-chrome="1"] div:has(> div > [data-conversation-tabs]) button[role="tab"]:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover);',
      '  color:var(--dsw-alias-label-primary);',
      '}',
      'html[data-ahig-chrome="1"] div:has(> div > [data-conversation-tabs]) button[role="tab"][aria-selected="true"]{',
      '  background:var(--dsw-alias-bg-base);',
      '  color:var(--dsw-alias-label-primary);',
      '  box-shadow:0 .5px 1px #00000014, 0 0 0 .5px var(--dsw-alias-border-l2);',
      '}',
      /* 深色下 bg-base 比轨道还暗，「浮起」会读成「按下去」→ 改成提亮一档 */
      'html[data-ahig-chrome="1"] body[data-ds-dark-theme] div:has(> div > [data-conversation-tabs]) button[role="tab"][aria-selected="true"]{',
      '  background:color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);',
      '}',

      /* 「更多视图」按钮（…）：宿主 .an3WzG_viewsMore 是 22×22 + margin-top:-3px，
       * 行容器 align-items:flex-start，所以三点比分段轨道的中线高约 7px。
       * 这里给成与标签同高的 26×26 盒 + inline-flex 居中，顶边与轨道齐平，
       * 视觉中线自然对齐；哈希类名用 [class*="_viewsMore"] 兜住跨构建改名。 */
      'html[data-ahig-chrome="1"] [class*="_viewsMoreAnchor"]{display:inline-flex;align-items:center}',
      'html[data-ahig-chrome="1"] button[class*="_viewsMore"]{',
      '  width:26px;',
      '  height:26px;',
      '  min-width:26px;',
      '  margin-top:0;',
      '  padding:0;',
      '  display:inline-flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  border-radius:var(--dsw-radius-sm);',
      '}',

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


      // ==== 会话树拖拽重排（表现层）====
      // 顺序由宿主提交，这里只画三样：跟手的浮卡、占住落点的灰块、让位的行。
      // 灰块是宿主行的克隆，带 data-ahig-ph 而**没有** data-row-key ——
      // dsh-session-progress 的进度带挂在 [data-row-key^="session:"]::before/::after 上，
      // 不摘掉 key 的话灰块里会再画一条进度带（看起来像两条进度条在动）。
      '.ahig-drag-card{position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;opacity:0;border-radius:var(--dsw-radius-md);background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, var(--dsw-alias-bg-layer-3));box-shadow:0 0 0 .5px var(--dsw-alias-border-l2),0 10px 24px #00000040,0 2px 6px #00000026;overflow:hidden;will-change:transform}',
      '.ahig-drag-card.on{opacity:1;transition:opacity 100ms ease}',
      '.ahig-drag-card > *{width:100%;height:100%;pointer-events:none}',
      // 定死 fixed：灰块与浮卡都用 viewport 坐标，吸附落点天然就是灰块所在处。
      // 早先用 absolute + 某个祖先做宿主，宿主一换（React 重挂载）就整体偏一节。
      '.ahig-drag-ph{position:fixed;left:0;top:0;z-index:2147482999;pointer-events:none;border-radius:var(--dsw-radius-md);overflow:hidden;will-change:transform;transition:transform 180ms cubic-bezier(.22,.8,.24,1),width 120ms ease,height 120ms ease}',
      '.ahig-drag-ph[data-ahig-ph="solid"]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2)}',
      '.ahig-drag-ph[data-ahig-ph="dashed"]{background:transparent;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}',
      '.ahig-drag-ph[data-ahig-ph="ghost"]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}',
      '.ahig-drag-ph > *{opacity:.34;filter:grayscale(.35)}',
      '.ahig-drag-ph[data-ahig-ph="solid"] > *,.ahig-drag-ph[data-ahig-ph="dashed"] > *{opacity:0}',
      // 还占着原位时给 35% 淡影（告诉人「从哪来」）；一旦落点换了格子，让位的行会压到这一格上，
      // 这时必须真正隐藏，否则两行文字叠在一起（用户录屏里的重影）。
      'html[data-ahig-drag="1"] [data-ahig-dragging="1"]{opacity:.35;filter:saturate(.85)}',
      'html[data-ahig-drag="1"][data-ahig-gap="1"] [data-ahig-dragging="1"]{opacity:0!important;visibility:hidden}',
      'html[data-ahig-gap="1"] [data-ahig-dragging="1"] *{animation:none!important}',
      /* 宿主原生落点线保留：它由宿主自己算，永远是对的；我们只在它旁边再画灰块 */
      
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
    // 两个必须让路的第三方：
    //   1) 宿主提交后会跑 AnimatedRows 的 FLIP（ROW_GLIDE_MS=200）。我们行上的
    //      translateY 如果还留着，FLIP 会量到被我们挪过的位置，起点就错了 →
    //      松手瞬间先 transition:none 清掉自己的位移，再让宿主接手。
    //   2) dsh-session-progress 把进度带画在 [data-row-key^="session:"]::before/
    //      ::after 上。灰块是克隆出来的行，如果不把 data-row-key 摘掉，它会在
    //      灰块里再画一条进度带（看起来像两条进度条在动）。
    // ---------------------------------------------------------------------
    const DRAG_ROW_SEL = '[data-row-key^="session:"]'
    const DRAG_SLOT_MS = 180
    const DRAG_SNAP_MS = 240
    const DRAG_LIFT = 30
    const DRAG_EDGE = 28
    const DRAG_STYLE_KEY = 'data-ahig-ph' // 灰块上的标记（同时用来挡掉 session-progress）

    function dragTree() {
      return document.querySelector('[data-slot="sidebar"]')
    }

    /** 行所在的「工作区分组」元素：宿主把 --dsh-workspace-indent 内联写在这个 section 上。 */
    function dragGroupEl(row) {
      let n = row && row.parentElement
      while (n && n !== document.body) {
        try {
          if (n.style && n.style.getPropertyValue('--dsh-workspace-indent') !== '') return n
        } catch (err) {
          /* 某些节点取 style 会抛，忽略 */
        }
        const cls = typeof n.className === 'string' ? n.className : ''
        if (/groupSection/i.test(cls)) return n
        n = n.parentElement
      }
      return null
    }

    function dragRows() {
      const tree = dragTree()
      if (!tree) return []
      const out = []
      for (const el of tree.querySelectorAll(DRAG_ROW_SEL)) {
        const r = el.getBoundingClientRect()
        if (r.height < 8 || r.width < 8) continue
        out.push({ el, key: el.getAttribute('data-row-key') || '', top: r.top, height: r.height, width: r.width, left: r.left, dy: 0 })
      }
      return out
    }

    // #region 会话区拖拽 · 纯核心（无 DOM，可单测）
    // 这里的函数只吃「行数组 + 几个数字」，不读 document、不写样式；
    // DOM 侧的 dragXxx 只是薄包装。这样槽位/步长/分组/位移都能脱离浏览器断言。
    const CORE = {
      /** 槽位步长：只收「看起来紧邻」的间距（行距 > 2 倍行高视为跨组），取中位数。 */
      stepOf(rows) {
        if (!rows || rows.length < 2) return 0
        const gaps = []
        for (let i = 1; i < rows.length; i += 1) {
          const gap = rows[i].top - rows[i - 1].top
          const h = rows[i - 1].height || 34
          if (gap > 0 && gap <= h * 2) gaps.push(gap)
        }
        if (!gaps.length) return Math.max(1, Math.round(rows[1].top - rows[0].top))
        gaps.sort((a, b) => a - b)
        return Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)]))
      },

      /** 指针落在第几个插入位（行中线为界）。 */
      slotAt(rows, y) {
        let i = 0
        while (i < rows.length && y > rows[i].top + rows[i].height / 2) i += 1
        return i
      },

      /**
       * 源行所属分组的首末下标。
       * sameGroup(a,b) 由调用方给出（宿主的工作区 section 祖先）；没有就退回竖向连续性。
       */
      groupRange(rows, index, sameGroup) {
        let first = index
        let last = index
        if (!rows || !rows.length || index < 0) return { first: 0, last: -1 }
        if (typeof sameGroup === 'function') {
          for (let i = 0; i < rows.length; i += 1) {
            if (i !== index && sameGroup(rows[i])) {
              if (i < first) first = i
              if (i > last) last = i
            }
          }
          return { first, last }
        }
        const reach = (rows[index].height || 34) * 1.5
        while (first > 0 && rows[first].top - (rows[first - 1].top + rows[first - 1].height) <= reach) first -= 1
        while (last < rows.length - 1 && rows[last + 1].top - (rows[last].top + rows[last].height) <= reach) last += 1
        return { first, last }
      },

      /** 落点夹在本组内：最早到组首，最晚到组末之后一格。 */
      clampSlot(raw, group, len) {
        if (!group) return Math.max(0, Math.min(raw, len))
        return Math.min(Math.max(raw, group.first), Math.min(group.last + 1, len))
      },

      /** 组内槽位的顶坐标；组外槽位（越界/跨组）贴在本组首或末。 */
      slotTopIn(rows, slot, step, group) {
        if (!rows || !rows.length) return 0
        const pad = Math.max(0, (step || 0) - rows[0].height)
        if (group) {
          if (slot <= group.first) return rows[group.first].top
          if (slot > group.last) {
            // 插到组末 = 占最后那一行的原格：让位时 s+1..last 会上移一格，
            // 空出来的正是 last 的原格。按「末行底 + pad」算会落到组末的
            // 「展开其余 N 个会话」那一行上，把它的字盖住。
            return rows[group.last].top
          }
          return rows[slot].top
        }
        return CORE.slotTop(rows, slot, step)
      },

      /** 无分组信息时的槽位顶坐标（兼容旧路径）。 */
      slotTop(rows, slot, step) {
        if (!rows || !rows.length) return 0
        if (slot <= 0) return rows[0].top
        const pad = Math.max(0, (step || 0) - rows[0].height)
        if (slot >= rows.length) {
          return rows[rows.length - 1].top
        }
        const prev = rows[slot - 1]
        const next = rows[slot]
        const prevBottom = prev.top + prev.height
        const gap = next.top - prevBottom
        if (step && gap > step * 1.4) return prevBottom + pad
        return next.top
      },

      /** 灰块/浮卡的落点矩形：宽度与高度都取源行。 */
      phRect(rows, sourceIndex, slot, step, group) {
        const base = rows[sourceIndex]
        return {
          top: CORE.slotTopIn(rows, slot, step, group),
          height: base.height,
          left: base.left,
          width: base.width,
        }
      },

      /** 侧栏锚点是 display:contents，没有盒子；边界只能用行的实测矩形拼。 */
      boundsOf(rows, edge) {
        if (!rows || !rows.length) return null
        let left = Infinity
        let right = -Infinity
        let bottom = -Infinity
        for (const row of rows) {
          if (row.left < left) left = row.left
          if (row.left + row.width > right) right = row.left + row.width
          if (row.top + row.height > bottom) bottom = row.top + row.height
        }
        return { left, right, top: rows[0].top - edge, bottom: bottom + edge }
      },

      /** 第 i 行该移多少：源行之前/之后各让一格，源行自己不动。 */
      shiftOf(i, source, slot, step) {
        if (i === source) return 0
        if (slot < source && i >= slot && i < source) return step
        if (slot > source && i > source && i <= slot) return -step
        return 0
      },
    }

    // #endregion
    // #region 会话区拖拽 · DOM 薄包装
    function dragStep(rows) {
      return CORE.stepOf(rows)
    }

    function dragSlotTop(rows, slot, step) {
      return CORE.slotTop(rows, slot, step)
    }

    function dragSlotAt(rows, y) {
      return CORE.slotAt(rows, y)
    }

    let dragTransparent = null
    function dragGhostImage() {
      if (dragTransparent) return dragTransparent
      const c = document.createElement('canvas')
      c.width = 1
      c.height = 1
      dragTransparent = c
      return c
    }

    function dragEnsureFloat() {
      if (rt.dragFloat && rt.dragFloat.isConnected) return rt.dragFloat
      const el = document.createElement('div')
      el.className = 'ahig-drag-card'
      el.setAttribute('aria-hidden', 'true')
      document.body.appendChild(el)
      rt.dragFloat = el
      return el
    }

    function dragEnsurePh() {
      if (rt.dragPh && rt.dragPh.isConnected) return rt.dragPh
      const el = document.createElement('div')
      el.className = 'ahig-drag-ph'
      el.setAttribute(DRAG_STYLE_KEY, prefs.dragStyle)
      el.setAttribute('aria-hidden', 'true')
      // 先不挂载：等第一次定位时再挑一个「有定位上下文」的宿主（见 dragMovePh）
      rt.dragPh = el
      return el
    }

    function dragClear() {
      rt.dragEpoch = (rt.dragEpoch || 0) + 1
      const st = rt.dragState
      if (st) {
        for (const row of st.rows) {
          row.el.style.transition = ''
          row.el.style.transform = ''
          row.el.removeAttribute('data-ahig-dragging')
        }
      }
      // 灰块通常由 drop/dragend 收尾，这里只兜底
      if (rt.dragPh) {
        rt.dragPh.remove()
        rt.dragPh = null
      }
      if (rt.dragFloat) {
        rt.dragFloat.classList.remove('on')
        rt.dragFloat.style.transition = ''
        rt.dragFloat.innerHTML = ''
      }
      rt.dragState = null
      document.documentElement.setAttribute('data-ahig-drag', prefs.drag ? '1' : '0')
      document.documentElement.setAttribute('data-ahig-gap', '0')
    }

    /**
     * 行列表被 React 重渲染过时（元素已脱离文档），重新量一遍几何。
     * 量之前先把我们自己的位移清掉，否则量到的是「已经被推开」的位置。
     */
    function dragRefreshRows(st) {
      if (st.rows.length && st.rows.every((r) => r.el.isConnected)) return false
      for (const r of st.rows) {
        r.el.style.transition = 'none'
        r.el.style.transform = ''
      }
      const rows = dragRows()
      const idx = rows.findIndex((r) => r.el.getAttribute('data-row-key') === st.sourceKey)
      if (idx < 0) return false
      for (const r of rows) r.dy = 0
      st.rows = rows
      st.sourceIndex = idx
      st.step = dragStep(rows)
      return true
    }

    function dragShifts(st) {
      const step = st.step
      const s = st.sourceIndex
      const p = st.slot
      const instant = !!st.instant
      const transition = instant
        ? 'none'
        : `transform ${DRAG_SLOT_MS}ms cubic-bezier(.22,.8,.24,1)`
      for (let i = 0; i < st.rows.length; i += 1) {
        const row = st.rows[i]
        if (i === s) continue
        const dy = CORE.shiftOf(i, s, p, step)
        row.el.style.transition = transition
        row.dy = dy
        row.el.style.transform = dy ? `translateY(${dy}px)` : ''
      }
      // 源行只在「还占着原位」时才可见；让位一发生，它必须把格子让出来。
      document.documentElement.setAttribute('data-ahig-gap', s !== p ? '1' : '0')
    }

    /**
     * 重新量行几何。行上可能有我们自己的 translateY，先减掉才是「自然位置」；
     * 元素被 React 换掉时就按 data-row-key 重新找回来。
     */
    function dragMeasure(st) {
      for (let i = 0; i < st.rows.length; i += 1) {
        const row = st.rows[i]
        if (!row.el.isConnected && row.key) {
          const again = dragRows().find((r) => r.el.getAttribute('data-row-key') === row.key)
          if (again) {
            row.el = again.el
            row.key = again.key
          }
        }
        if (!row.el.isConnected) continue
        const rect = row.el.getBoundingClientRect()
        const dy = row.dy || 0
        row.top = rect.top - dy
        row.left = rect.left
        row.width = rect.width
        row.height = rect.height
      }
      return st
    }

    function dragSlotTopIn(rows, slot, step, group) {
      return CORE.slotTopIn(rows, slot, step, group)
    }

    function dragPhRect(st) {
      return CORE.phRect(st.rows, st.sourceIndex, st.slot, st.step, st.group)
    }

    function dragMovePh(st) {
      const ph = dragEnsurePh()
      const base = st.rows[st.sourceIndex]
      if (!base || !base.el.isConnected) return
      const r = dragPhRect(st)
      if (ph.parentElement !== document.body) document.body.appendChild(ph)
      ph.style.width = `${Math.round(r.width)}px`
      ph.style.height = `${Math.round(r.height)}px`
      ph.style.transform = `translate3d(${Math.round(r.left)}px, ${Math.round(r.top)}px, 0)`
    }

    function dragFloatTo(st, clientX, clientY) {
      const el = dragEnsureFloat()
      const base = st.rows[st.sourceIndex]
      const side = dragBounds(st)
      const inside = side ? clientX <= side.right && clientY <= side.bottom : false
      const x = inside ? base.left : Math.min(Math.max(clientX - st.grabDx, 4), innerWidth - base.width - 4)
      const y = clientY - st.grabDy - DRAG_LIFT
      el.style.width = `${Math.round(base.width)}px`
      el.style.height = `${Math.round(base.height)}px`
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
      el.classList.add('on')
    }

    /** 最近几条拖拽事件（设置页可见，用来远程判断「跳一下就回来」是哪一步断的）。 */
    // ==== 拖拽探针（v0.7.4）====
    // 只干一件事：把「插件有没有接管这次拖拽」变成屏幕上的字。
    // 四种结论互斥：没事件 / 有按下没 dragstart / dragstart 后没有 dragover（浏览器 abort）/ 已接管。
    const PROBE_ID = 'ahig-probe'
    const PROBE_T0 = Date.now()

    function probeGroup() {
      const st = rt.dragState
      if (!st || !st.group) return '-'
      return st.group.first + '..' + st.group.last
    }

    function probeStep() {
      const st = rt.dragState
      return st ? Math.round(st.step) : '-'
    }

    function probeBox(el) {
      if (!el || !el.getBoundingClientRect) return '-'
      const r = el.getBoundingClientRect()
      return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top)
    }

    function probeState() {
      if (!rt.probe) {
        rt.probe = {
          press: 0,
          start: 0,
          over: 0,
          drop: 0,
          end: 0,
          slot: '-',
          moved: false,
          rows: 0,
          reason: '',
          events: [],
        }
      }
      return rt.probe
    }

    function probeNote(text) {
      probeState().reason = text
      probeRender()
    }

    function probeEvent(name) {
      const p = probeState()
      p[name] = (p[name] || 0) + 1
      const t = ((Date.now() - PROBE_T0) / 1000).toFixed(1)
      p.events.push(name + '@' + t + 's')
      if (p.events.length > 6) p.events.shift()
      probeRender()
    }

    function probeVerdict() {
      const p = probeState()
      if (!prefs.drag) return '拖拽层没挂：设置里「拖拽重排动画」是关的'
      if (p.reason) return p.reason
      if (!p.press && !p.start) return '还没有按下或拖拽事件到这里'
      if (p.press && !p.start) return '有按下但没有 dragstart：浏览器没发起原生拖拽'
      if (p.start && !p.over) return 'dragstart 之后没有 dragover：拖拽被浏览器中止'
      if (p.over) return '已接管 · slot=' + p.slot + ' · moved=' + (p.moved ? 'yes' : 'no')
      return ''
    }

    function probeFind() {
      // 单测/无 DOM 环境里没有 getElementById，探针要能安静降级
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return null
      return document.getElementById(PROBE_ID)
    }

    function probeRender() {
      if (!prefs.probe) return
      if (typeof document === 'undefined' || !document.body || typeof document.body.appendChild !== 'function') return
      const p = probeState()
      let el = probeFind()
      if (!el || el !== rt.probeEl) el = rt.probeEl && rt.probeEl.isConnected ? rt.probeEl : null
      if (!el) {
        el = document.createElement('div')
        rt.probeEl = el
        el.id = PROBE_ID
        el.setAttribute('aria-hidden', 'true')
        if (el.style) el.style.cssText = [
          'position:fixed',
          'right:12px',
          'top:12px',
          'z-index:2147483600',
          'max-width:340px',
          'padding:8px 10px',
          'border-radius:8px',
          'background:rgba(15,17,21,.92)',
          'color:#f9fafb',
          'font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace',
          'white-space:pre-wrap',
          'pointer-events:none',
          'box-shadow:0 0 0 .5px rgba(255,255,255,.16),0 8px 20px rgba(0,0,0,.45)',
        ].join(';')
        document.body.appendChild(el)
      }
      el.textContent = [
        'AHIG 拖拽探针  v' + VERSION,
        'layer=' + (rt.dragBound ? 'on' : 'off') + '  prefs.drag=' + (prefs.drag ? 'on' : 'off') + '  rows=' + p.rows,
        'press=' + p.press + '  start=' + p.start + '  over=' + p.over + '  drop=' + p.drop + '  end=' + p.end,
        'slot=' + p.slot + '  moved=' + (p.moved ? 'yes' : 'no') + '  grp=' + probeGroup() + '  step=' + probeStep(),
        'ph=' + probeBox(rt.dragPh) + ' card=' + probeBox(rt.dragFloat) + (rt.dragFloat && rt.dragFloat.classList.contains('on') ? '(on)' : '(off)'),
        'err=' + (p.err || '-'),
        'tabs=' + probeTabs(),
        p.events.length ? p.events.join(' → ') : '（还没有事件）',
        '结论：' + probeVerdict(),
      ].join('\n')
    }

    /**
     * 标签条诊断：把真实 DOM 的形状打进浮层（tablist 个数、包装层、按钮实际 padding）。
     * 分段控件「重叠」这类问题只能靠现场读数定位——夹具没复刻出那次的结构。
     */
    function probeTabs() {
      if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return '-'
      let lists
      try {
        lists = document.querySelectorAll('[data-conversation-tabs]')
      } catch {
        return '-'
      }
      if (!lists || !lists.length) return 'no-tablist'
      const list = lists[0]
      let btns
      try {
        btns = list.querySelectorAll('button[role="tab"]')
      } catch {
        return 'len=' + lists.length
      }
      const one = btns && btns[0]
      if (!one) return 'lists=' + lists.length + ' no-btn'
      let cs = null
      try {
        cs = (typeof getComputedStyle === 'function' ? getComputedStyle(one) : null)
      } catch {
        cs = null
      }
      const w = one.parentElement && one.parentElement.tagName ? one.parentElement.tagName.toLowerCase() : '?'
      return [
        'lists=' + lists.length,
        'btns=' + btns.length,
        'wrap=' + w,
        'pad=' + (cs ? cs.paddingLeft + '/' + cs.paddingRight : '?'),
        'h=' + (cs ? cs.height : '?'),
        'lh=' + (cs ? cs.lineHeight : '?'),
      ].join(' ')
    }

    function probeUnmount() {
      if (typeof document === 'undefined') return
      const el = rt.probeEl || probeFind()
      if (el) el.remove()
      rt.probeEl = null
    }

    function dragLog(ev) {
      rt.dragLog = rt.dragLog || []
      rt.dragLog.push({ ev, t: Math.round((typeof performance !== 'undefined' ? performance.now() : 0)) })
      if (rt.dragLog.length > 8) rt.dragLog.shift()
    }

    /** 立刻收拾干净，不播任何动画（用于被浏览器 abort 的假拖拽）。 */
    function dragReset(st) {
      rt.dragEpoch = (rt.dragEpoch || 0) + 1
      if (st) {
        for (const row of st.rows) {
          row.el.style.transition = ''
          row.el.style.transform = ''
          row.el.removeAttribute('data-ahig-dragging')
        }
      }
      if (rt.dragPh) {
        rt.dragPh.remove()
        rt.dragPh = null
      }
      if (rt.dragFloat) {
        rt.dragFloat.classList.remove('on')
        rt.dragFloat.style.transition = ''
        rt.dragFloat.style.transform = ''
        rt.dragFloat.innerHTML = ''
      }
      rt.dragState = null
      document.documentElement.setAttribute('data-ahig-drag', prefs.drag ? '1' : '0')
      document.documentElement.setAttribute('data-ahig-gap', '0')
    }

    function dragBeginUnsafe(row, e) {
      const rows = dragRows()
      const index = rows.findIndex((r) => r.el === row)
      if (index < 0) return
      const tree = dragTree()
      const treeRect = tree.getBoundingClientRect()
      const base = rows[index]
      rt.dragState = {
        rows,
        sourceIndex: index,
        sourceKey: row.getAttribute('data-row-key') || '',
        startedAt: Date.now(),
        moved: false,
        slot: index,
        step: dragStep(rows),
        treeTop: treeRect.top,
        treeLeft: treeRect.left,
        grabDx: e.clientX - base.left,
        grabDy: e.clientY - base.top,
        pointerY: e.clientY,
        pointerX: e.clientX,
      }
      // 宿主只允许同组内换序（compatibleTarget = 同 group、同 pinned），
      // 所以落点必须夹在源行所在的工作区里。分组判定只用竖向间距：
      // 行距 > 1.5 倍行高，说明中间隔着工作区标题或「展开其余 N 个会话」，就是边界。
      // 宿主只允许同组内换序（compatibleTarget = 同 group、同 pinned），
      // 所以落点必须夹在源行所在的工作区里。
      const gEl = dragGroupEl(row)
      rt.dragState.group = CORE.groupRange(
        rows,
        index,
        gEl ? (other) => dragGroupEl(other.el) === gEl : null,
      )
      document.documentElement.setAttribute('data-ahig-drag', '1')
      row.setAttribute('data-ahig-dragging', '1')
      rt.dragEpoch = (rt.dragEpoch || 0) + 1
      const st = rt.dragState
      st.epoch = rt.dragEpoch
      // 浮卡：内容必须真的放进去（早先只建了壳，拖起来是一个空白灰块）
      const float = dragEnsureFloat()
      float.innerHTML = ''
      const cardClone = dragCloneRow(row)
      float.appendChild(cardClone)
      // 灰块：只有 ghost 形态才在格子里放一份淡影，其余形态是纯色块
      const ph = dragEnsurePh()
      ph.setAttribute(DRAG_STYLE_KEY, prefs.dragStyle)
      ph.innerHTML = ''
      if (prefs.dragStyle === 'ghost') ph.appendChild(dragCloneRow(row))
      dragMovePh(st)
      dragFloatTo(st, e.clientX, e.clientY)
      dragShifts(st)
    }

    /**
     * 行克隆：去掉宿主的身份属性与右侧操作按钮，只留标题/时间这类内容。
     * 还要把它**继承来的排版**抄成内联：会话行的左缩进来自
     * `padding-inline-start: calc(8px + var(--dsh-workspace-indent))`，
     * 而这个变量是宿主写在工作区分组 section 上的内联样式；克隆一离开那个祖先，
     * 变量就回落成 0 —— 卡片里的文字会整体左移，看起来就是「文字错位」。
     */
    function dragCloneRow(row) {
      const clone = row.cloneNode(true)
      try {
        const cs = getComputedStyle(row)
        const rect = row.getBoundingClientRect()
        const indent = cs.getPropertyValue('--dsh-workspace-indent')
        if (indent) clone.style.setProperty('--dsh-workspace-indent', indent.trim())
        for (const prop of [
          'paddingTop',
          'paddingRight',
          'paddingBottom',
          'paddingLeft',
          'paddingInlineStart',
          'paddingInlineEnd',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'letterSpacing',
          'color',
          'gap',
          'boxSizing',
        ]) {
          const value = cs[prop]
          if (value) clone.style[prop] = value
        }
        clone.style.margin = '0'
        if (rect.height) clone.style.height = Math.round(rect.height) + 'px'
      } catch {
        /* ignore */
      }
      for (const attr of ['data-row-key', 'draggable', 'role', 'tabindex', 'aria-selected', 'aria-expanded']) {
        clone.removeAttribute(attr)
      }
      clone.removeAttribute('data-ahig-dragging')
      clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
      // 行内右侧的「⋯ / 删除 / 收藏」按钮不该跟着卡片跑
      clone.querySelectorAll('button').forEach((n) => n.remove())
      clone.querySelectorAll('[data-row-key]').forEach((n) => n.removeAttribute('data-row-key'))
      return clone
    }

    /** 侧栏锚点是 display:contents，没有盒子；边界只能用行的实测矩形拼。 */
    function dragBounds(st) {
      return CORE.boundsOf(st && st.rows, DRAG_EDGE)
    }

    function dragOverUnsafe(st, e) {
      st.pointerX = e.clientX
      st.pointerY = e.clientY
      if (!st.moved) {
        const base = st.rows[st.sourceIndex]
        if (base && Math.abs(e.clientY - (base.top + st.grabDy)) > 3) {
          st.moved = true
          dragLog('over')
        }
      }
      const tree = dragTree()
      if (!tree) return
      // 每帧重量：侧栏滚动、自动滚动、宿主重渲染都会让上一次的几何失真
      const replaced = dragRefreshRows(st)
      dragMeasure(st)
      if (replaced || st.rows.length !== st.lastCount) {
        st.lastCount = st.rows.length
        st.slot = Math.min(st.slot, st.rows.length)
        dragMovePh(st)
        dragShifts(st)
      }
      const r = dragBounds(st)
      const inTree = !!r && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (inTree) {
        const g = st.group || { first: 0, last: st.rows.length - 1 }
        let slot = CORE.clampSlot(CORE.slotAt(st.rows, e.clientY), g, st.rows.length)
        // 源行本来就是组里最后一行时，「插到组末」等于原地不动
        if (slot === g.last + 1 && st.sourceIndex === g.last) slot = st.sourceIndex
        if (slot !== st.slot) {
          st.slot = slot
          dragMovePh(st)
          dragShifts(st)
        }
      }
      // 指针越过本组上下边界时，灰块淡掉：这一格放不下，别让人以为能放
      const phEl = rt.dragPh
      if (phEl && st.group) {
        const g0 = st.rows[st.group.first]
        const g1 = st.rows[st.group.last]
        const top = g0 ? g0.top - 4 : 0
        const bottom = g1 ? g1.top + g1.height + 4 : 0
        phEl.style.opacity = e.clientY < top || e.clientY > bottom ? '0.45' : ''
      }
      dragFloatTo(st, e.clientX, e.clientY)
      dragAutoScroll(e.clientY)
    }

    function dragScrollHost() {
      const rows = rt.dragState && rt.dragState.rows
      let el = rows && rows[0] && rows[0].el ? rows[0].el.parentElement : dragTree()
      // 会话行外面裹着 HoverCard 的 <span>，滚动容器在更上层：往上找第一个真的能滚的元素
      while (el) {
        if (el.scrollHeight > el.clientHeight + 4) {
          const oy = getComputedStyle(el).overflowY
          if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return el
        }
        el = el.parentElement
      }
      return null
    }

    function dragAutoScroll(clientY) {
      const scroller = dragScrollHost()
      if (!scroller) return
      const r = scroller.getBoundingClientRect()
      if (r.height < 40) return
      let dir = 0
      if (clientY < r.top + DRAG_EDGE) dir = -1
      else if (clientY > r.bottom - DRAG_EDGE) dir = 1
      if (!dir) {
        if (rt.dragScrollRaf) {
          cancelAnimationFrame(rt.dragScrollRaf)
          rt.dragScrollRaf = 0
        }
        return
      }
      if (rt.dragScrollRaf) return
      const tick = () => {
        if (!rt.dragState) {
          rt.dragScrollRaf = 0
          return
        }
        scroller.scrollTop += dir * 12
        const st = rt.dragState
        st.rows = dragRows()
        dragMovePh(st)
        dragShifts(st)
        rt.dragScrollRaf = requestAnimationFrame(tick)
      }
      rt.dragScrollRaf = requestAnimationFrame(tick)
    }

    function dragEndUnsafe(commit) {
      const st = rt.dragState
      if (!st) return
      if (rt.dragScrollRaf) {
        cancelAnimationFrame(rt.dragScrollRaf)
        rt.dragScrollRaf = 0
      }
      const targetSlot = commit ? st.slot : st.sourceIndex
      // 指针还没离开源行就被浏览器结束了（宿主重渲染 / 被 abort）：
      // 这不是一次真正的拖拽，别播吸附动画，直接安静收场。
      if (!st.moved) {
        dragLog('abort')
        dragReset(st)
        return
      }
      dragLog(commit ? 'commit' : 'cancel')
      dragMeasure(st)
      // 取消要回源行、提交才去灰块处；早先两种情况都用了 st.slot，
      // 于是「拖出去又松手」会飞到一个既不是源行也不是落点的地方。
      const phLive =
        commit && rt.dragPh && rt.dragPh.isConnected ? rt.dragPh.getBoundingClientRect() : null
      const rect = phLive
        ? { left: phLive.left, top: phLive.top, width: phLive.width, height: phLive.height }
        : dragPhRect({
            rows: st.rows,
            sourceIndex: st.sourceIndex,
            slot: targetSlot,
            step: st.step,
            group: st.group,
          })
      const float = rt.dragFloat
      const ph = rt.dragPh
      // 先把自己的位移「瞬间」清掉并撤掉灰块：随后宿主的 FLIP 会以干净的
      // 自然位置为起点去量，动画只剩它自己那一套（同一行不会有两套动画）。
      st.instant = !!commit
      dragShifts(st)
      if (ph) {
        ph.style.transition = 'opacity 120ms ease'
        ph.style.opacity = '0'
      }
      if (float) {
        // 先把当前 transform 结算到卡片上，再换成带过渡的目标位：动画才是从「现在这里」出发，
        // 而不是从最后一次 dragover 写下的旧坐标起步（那会看起来先跳一下再飞）。
        const from = getComputedStyle(float).transform
        float.style.transition = 'none'
        if (from && from !== 'none') float.style.transform = from
        void float.offsetWidth
        float.style.transition = `transform ${DRAG_SNAP_MS + 40}ms ${
          prefs.dragBounce ? 'cubic-bezier(.34,1.22,.64,1)' : 'cubic-bezier(.22,.8,.24,1)'
        }`
        float.style.transform = `translate3d(${Math.round(rect.left)}px, ${Math.round(rect.top)}px, 0)`
      }
      const state = st
      const myEpoch = st.epoch
      rt.dragState = null
      setTimeout(() => {
        // 期间又起了新的一次拖拽：旧定时器不许再动新拖拽的 DOM
        if (rt.dragEpoch !== myEpoch) return
        for (const row of state.rows) {
          row.el.style.transition = ''
          row.el.style.transform = ''
          // 浮卡落定之后才把被拿起的行显出来：中间这几帧它一直是隐藏的，
          // 所以「清位移 → 宿主 FLIP 带走」这一段不会闪回原位。
          row.el.removeAttribute('data-ahig-dragging')
        }
        if (ph && ph.isConnected) ph.remove()
        if (rt.dragPh === ph) rt.dragPh = null
        if (float) {
          float.classList.remove('on')
          float.style.transition = ''
          float.innerHTML = ''
        }
        document.documentElement.setAttribute('data-ahig-drag', prefs.drag ? '1' : '0')
      document.documentElement.setAttribute('data-ahig-gap', '0')
      }, DRAG_SNAP_MS + 40)
    }

    // 拖拽里的任何异常都不该静默：捕获后写进探针，屏幕上能看见。
    function probeCatch(err) {
      const p = probeState()
      p.err = (err && err.message) || String(err)
      probeRender()
    }

    function dragBegin(row, e) {
      try {
        dragBeginUnsafe(row, e)
      } catch (err) {
        probeCatch(err)
      }
    }

    function dragOver(st, e) {
      try {
        dragOverUnsafe(st, e)
      } catch (err) {
        probeCatch(err)
      }
    }

    function dragEnd(commit) {
      try {
        dragEndUnsafe(commit)
      } catch (err) {
        probeCatch(err)
      }
    }

    // #region 原生事件的接线（capture，只读，不 preventDefault）
    function onDragStart(e) {
      probeEvent('start')
      if (!prefs.drag) {
        probeNote('开关关闭，dragstart 到了但没接管')
        return
      }
      if (rt.dragState) {
        // 早先这里直接 return，结果一次没收干净就再也拖不动；改成强制清理后继续。
        probeNote('上一轮没收干净 → 已强制清理，本次继续')
        dragReset(rt.dragState)
      }
      const row = e.target && e.target.closest ? e.target.closest(DRAG_ROW_SEL) : null
      if (!row) {
        probeNote('dragstart 命中，但目标不在会话行上（选择器没匹配到 [data-row-key^="session:"]）')
        return
      }
      if (e.dataTransfer) {
        try {
          e.dataTransfer.setDragImage(dragGhostImage(), 0, 0)
          if (!e.dataTransfer.effectAllowed || e.dataTransfer.effectAllowed === 'none') {
            e.dataTransfer.effectAllowed = 'move'
          }
        } catch {
          /* ignore */
        }
      }
      dragLog('start')
      dragBegin(row, e)
    }

    function onDragOver(e) {
      const p = probeState()
      p.over += 1
      p.rows = rt.dragState ? rt.dragState.rows.length : p.rows
      if (!rt.dragState) {
        if (p.over === 1) probeNote('有 dragover 但没有 dragState：dragstart 没接管或已结束')
        probeRender()
        return
      }
      dragOver(rt.dragState, e)
      p.slot = rt.dragState.slot
      p.moved = rt.dragState.moved
      probeRender()
    }

    function onDrop(e) {
      probeEvent('drop')
      if (!rt.dragState) return
      dragLog('drop')
      // 会话树只能在本工作区内换位（宿主 compatibleTarget 同组才接收）。
      // 所以「指针在列表里」不够，落点行必须属于源行所在的这一组。
      const tree = dragTree()
      const st = rt.dragState
      const g = st.group
      const dropRow = e.target && e.target.closest ? e.target.closest(DRAG_ROW_SEL) : null
      dragRefreshRows(st)
      dragMeasure(st)
      const dropKey = dropRow ? dropRow.getAttribute('data-row-key') || '' : ''
      let idx = dropRow ? st.rows.findIndex((r) => r.el === dropRow) : -1
      if (idx < 0 && dropKey) idx = st.rows.findIndex((r) => r.key === dropKey)
      const inList = tree ? tree.contains(e.target) : false
      const sameGroup = !!(g && idx >= g.first && idx <= g.last)
      const inside = inList && sameGroup
      probeNote(inside ? '落点同组，提交给宿主' : '落点不在本工作区（不提交）')
      dragEnd(inside)
    }

    function onDragEnd() {
      probeEvent('end')
      if (!rt.dragState) return
      dragLog('end')
      dragEnd(false)
    }

    function onPress(e) {
      const row = e.target && e.target.closest ? e.target.closest(DRAG_ROW_SEL) : null
      if (!row) return
      probeEvent('press')
    }

    function startDragLayer() {
      if (rt.dragBound) return
      rt.dragBound = true
      document.addEventListener('pointerdown', onPress, true)
      document.addEventListener('dragstart', onDragStart, true)
      document.addEventListener('dragover', onDragOver, true)
      document.addEventListener('drop', onDrop, true)
      document.addEventListener('dragend', onDragEnd, true)
    }

    function stopDragLayer() {
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('drop', onDrop, true)
      document.removeEventListener('dragend', onDragEnd, true)
      rt.dragBound = false
      if (rt.dragScrollRaf) {
        cancelAnimationFrame(rt.dragScrollRaf)
        rt.dragScrollRaf = 0
      }
      dragClear()
      if (rt.dragFloat) {
        rt.dragFloat.remove()
        rt.dragFloat = null
      }
      if (rt.dragPh) {
        rt.dragPh.remove()
        rt.dragPh = null
      }
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
      if (prefs.drag) startDragLayer()
      else stopDragLayer()
      if (prefs.probe) probeRender()
      else probeUnmount()
      if (prefs.tabDedupe) startTabDedupe()
      else stopTabDedupe()
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

    // #region 标签条去重守卫
    /**
     * 宿主标题行 `[data-conversation-tabs]` 里每个 view 一个 `button[role=tab]`，
     * 文案来自注册时的 label，DOM 上没有 view id（React key 才是 id）。所以只能按
     * 文案判重：同一个 tablist 里第二次出现同样文字的按钮 → 判为同一 view 重复注册。
     * 只隐藏、不 removeChild：节点还挂在 React fiber 上，摘掉会在下一次 reconcile 炸 removeChild。
     */
    const TAB_DUP_ATTR = 'data-ahig-tab-dup'
    const TAB_PREV_ATTR = 'data-ahig-tab-prev'
    let tabObserver = null
    let tabRaf = 0
    let tabDupCount = 0

    /**
     * 标签按钮的文案。宿主的 view label 有两种形态：纯文字，或
     * `<span class="…icon"></span><span class="…label">上下文</span>` —— 图标 span 在前、
     * 文字 span 在后，图标 span 通常为空。取「最后一个非空 span」的文本，全空再退回整按钮文本。
     * （v0.8.2 取的是第一个 span，遇上带图标的 label 会拿到空串 → 该 tab 被 continue 跳过。）
     */
    function tabKey(el) {
      let text = ''
      if (typeof el.querySelectorAll === 'function') {
        for (const span of el.querySelectorAll('span')) {
          const t = (span.textContent || '').replace(/\s+/g, '')
          if (t) text = t
        }
      }
      if (!text) text = (el.textContent || '').replace(/\s+/g, '')
      return text
    }

    function hideTab(el) {
      if (el.getAttribute(TAB_DUP_ATTR) === '1') return
      el.setAttribute(TAB_DUP_ATTR, '1')
      el.setAttribute(TAB_PREV_ATTR, el.style.display || '')
      el.style.setProperty('display', 'none', 'important')
    }

    function showTab(el) {
      if (el.getAttribute(TAB_DUP_ATTR) !== '1') return
      const prev = el.getAttribute(TAB_PREV_ATTR) || ''
      if (prev) el.style.display = prev
      else el.style.removeProperty('display')
      el.removeAttribute(TAB_DUP_ATTR)
      el.removeAttribute(TAB_PREV_ATTR)
    }

    function dedupeTabs() {
      tabRaf = 0
      if (typeof document === 'undefined' || !document.body) return
      if (typeof document.querySelectorAll !== 'function') return
      let hidden = 0
      for (const list of document.querySelectorAll('[data-conversation-tabs]')) {
        const seen = new Set()
        for (const el of Array.from(list.children)) {
          if (!el || el.tagName !== 'BUTTON' || el.getAttribute('role') !== 'tab') continue
          const key = tabKey(el)
          if (!key) continue
          if (!seen.has(key)) {
            seen.add(key)
            showTab(el)
            continue
          }
          hideTab(el)
          hidden += 1
        }
      }
      if (hidden !== tabDupCount) {
        tabDupCount = hidden
        if (hidden > 0) warn('标签条去重：隐藏 ' + hidden + ' 个重复标签（宿主重复注册了同一个 view）')
        else log('标签条去重：重复标签已消失，全部还原')
      }
    }

    function scheduleTabDedupe() {
      if (typeof requestAnimationFrame !== 'function') {
        dedupeTabs()
        return
      }
      if (tabRaf) return
      tabRaf = requestAnimationFrame(dedupeTabs)
    }

    function touchesTabStrip(record) {
      const target = record.target
      if (target && target.nodeType === 1 && typeof target.closest === 'function') {
        if (target.closest('[data-conversation-tabs]')) return true
      }
      for (const node of record.addedNodes || []) {
        if (node.nodeType !== 1) continue
        if (typeof node.matches === 'function' && node.matches('[data-conversation-tabs]')) return true
        if (typeof node.querySelector === 'function' && node.querySelector('[data-conversation-tabs]')) return true
      }
      return false
    }

    function startTabDedupe() {
      stopTabDedupe()
      if (typeof document === 'undefined' || typeof MutationObserver !== 'function' || !document.body) return
      try {
        tabObserver = new MutationObserver((records) => {
          for (const record of records) {
            if (record.type !== 'childList') continue
            if (touchesTabStrip(record)) {
              scheduleTabDedupe()
              return
            }
          }
        })
        tabObserver.observe(document.body, { childList: true, subtree: true })
      } catch {
        tabObserver = null
      }
      scheduleTabDedupe()
    }

    function stopTabDedupe() {
      try {
        if (tabObserver) tabObserver.disconnect()
      } catch {
        /* ignore */
      }
      tabObserver = null
      if (tabRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tabRaf)
      tabRaf = 0
      if (typeof document !== 'undefined' && document.body && typeof document.querySelectorAll === 'function') {
        for (const el of document.querySelectorAll('[' + TAB_DUP_ATTR + '="1"]')) showTab(el)
      }
      tabDupCount = 0
    }
    // #endregion

    // #region 设置页
    const ui = {
      wrap: { display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 2px', fontSize: 13 },
      card: {
        border: '1px solid rgba(127,127,127,.24)',
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      },
      title: { fontSize: 12, fontWeight: 600, opacity: 0.85, letterSpacing: '.02em' },
      row: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' },
      name: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      small: { fontSize: 11, opacity: 0.6, lineHeight: 1.6 },
      mono: { fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 11, opacity: 0.5 },
      btn: {
        font: 'inherit',
        color: 'inherit',
        background: 'rgba(127,127,127,.16)',
        border: 0,
        borderRadius: 6,
        padding: '3px 9px',
        cursor: 'pointer',
      },
    }

    const TOGGLES = [
      {
        key: 'probe',
        label: '诊断浮层（临时）',
        why: '拖拽时在右上角显示探针：按下 / dragstart / dragover 计数、当前 slot、是否真的移动过、退出原因；用来判断「插件有没有接管这次拖拽」。定位完成后应关闭',
      },
      {
        key: 'drag',
        label: '拖拽重排动画（看得见）',
        why: '会话树：拿起时浮卡跟手、原位换成灰块、其余行让位 180ms、松手 240ms 吸附（顺序仍由宿主的 setSessionOrder 提交）。一级导航：只给 dsh-sidebar-layout 的 order 切换补 200ms 缓动，不另起一套拖拽',
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
        key: 'tabDedupe',
        label: '标签条去重（看得见）',
        why: '宿主把同一个视图注册两次时，标题行会画出两个「上下文」。这里把后出现的同文案标签隐藏（不移除节点，React 仍持有引用），重复消失后自动还原；只在出现重复时才动 DOM',
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
      return h(
        'div',
        { 'data-ahig-settings': '1', style: ui.wrap },

        h(
          'div',
          { style: { ...ui.card, gap: 4 } },
          h('div', { style: ui.title }, '状态'),
          h(
            'div',
            { style: { fontSize: 12 } },
            info
              ? '当前主题 ' + (info.active || '?') + '（偏好 ' + (info.preference || '?') + '）· 已启用 token 层 ' + layers.length + ' 个'
              : 'theme 服务不可读，token 层状态未知（样式层不受影响）',
          ),
          layers.length ? h('div', { style: ui.mono }, layers.join(' · ')) : null,
          h(
            'div',
            { style: ui.mono },
            '拖拽日志：' +
              ((rt.dragLog && rt.dragLog.length)
                ? rt.dragLog.map((e) => e.ev + '@' + e.t).join(' → ')
                : '（还没有拖过）'),
          ),
          h(
            'div',
            { style: ui.small },
            '改完立即生效；插件本体改动要重启 DSH（hmr 已关闭）。卸载本插件后所有 token 层自动回收。',
          ),
        ),

        h(
          'div',
          { style: ui.card },
          h('div', { style: ui.title }, '逐项开关'),
          ...TOGGLES.map((t) =>
            h(
              'label',
              { key: t.key, style: { ...ui.row, alignItems: 'flex-start', cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: Boolean(p[t.key]),
                onChange: () => patch({ [t.key]: !p[t.key] }),
              }),
              h(
                'span',
                { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
                h('span', { style: ui.name }, t.label),
                h('span', { style: ui.small }, t.why),
              ),
            ),
          ),
        ),

        h(
          'div',
          { style: ui.card },
          h('div', { style: ui.title }, '拖拽落点形态'),
          ...DRAG_STYLES.map((item) =>
            h(
              'label',
              { key: item.id, style: { ...ui.row, alignItems: 'flex-start', cursor: 'pointer' } },
              h('input', {
                type: 'radio',
                name: 'ahig-drag-style',
                checked: p.dragStyle === item.id,
                onChange: () => patch({ dragStyle: item.id }),
              }),
              h(
                'span',
                { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
                h('span', { style: ui.name }, item.label),
                h('span', { style: ui.small }, item.hint),
              ),
            ),
          ),
        ),

        h(
          'div',
          { style: ui.card },
          h('div', { style: ui.title }, '松手吸附'),
          ...DRAG_BOUNCES.map((item) =>
            h(
              'label',
              { key: String(item.id), style: { ...ui.row, alignItems: 'flex-start', cursor: 'pointer' } },
              h('input', {
                type: 'radio',
                name: 'ahig-drag-bounce',
                checked: p.dragBounce === item.id,
                onChange: () => patch({ dragBounce: item.id }),
              }),
              h(
                'span',
                { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
                h('span', { style: ui.name }, item.label),
                h('span', { style: ui.small }, item.hint),
              ),
            ),
          ),
        ),

        h(
          'div',
          { style: ui.card },
          h('div', { style: ui.title }, '字体族预设'),
          ...FONT_PRESETS.map((preset) =>
            h(
              'label',
              { key: preset.id, style: { ...ui.row, alignItems: 'flex-start', cursor: 'pointer' } },
              h('input', {
                type: 'radio',
                name: 'ahig-font-preset',
                checked: p.fontPreset === preset.id,
                onChange: () => patch({ fontPreset: preset.id }),
              }),
              h(
                'span',
                { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
                h('span', { style: ui.name }, preset.label),
                h('span', { style: ui.small }, preset.hint),
              ),
            ),
          ),
          h(
            'div',
            { style: ui.small },
            '只改「未选字体」时的兜底值（--dsh-font-family-text-default）；设置 → 外观里自己选过字体的，那边优先。',
          ),
        ),

        h(
          'div',
          { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h(
            'button',
            {
              type: 'button',
              style: ui.btn,
              onClick: () => save(defaults()),
            },
            '恢复默认',
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
            { style: { ...ui.card, fontSize: 12 } },
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
      dragState: null,
      dragFloat: null,
      dragPh: null,
      dragBound: false,
      dragEpoch: 0,
      dragScrollRaf: 0,
    }

    function teardown() {
      stopTransitionObserver()
      stopTabDedupe()
      stopDragLayer()
      probeUnmount()
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
      syncAttrs()
      applyTokenLayers()
      if (prefs.transition) startTransitionObserver()
      if (prefs.drag) startDragLayer()
      if (prefs.probe) probeRender()
      if (prefs.tabDedupe) startTabDedupe()

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
        core: CORE,
        // 标签条去重：被隐藏的重复标签数量（0 = 没有重复）
        tabs: () => ({ hidden: tabDupCount }),
        // 拖拽状态快照：夹具与手工排查用（探针浮层另外显示一部分）
        drag: () => {
          const st = rt.dragState
          if (!st) return null
          return {
            slot: st.slot,
            sourceIndex: st.sourceIndex,
            group: st.group ? { first: st.group.first, last: st.group.last } : null,
            step: st.step,
            rows: st.rows.length,
            moved: !!st.moved,
          }
        },
      }
    }

    return module.exports
  },
})
