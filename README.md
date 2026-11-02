# dsh-apple-hig

按 Apple Human Interface Guidelines 校正 DeepSeek Harness 桌面端配色、字体与状态栏的一个**叠加层插件**：
不改宿主代码、不碰功能布局、每一档都能单独关掉，卸载即完全还原。

- 仓库：<https://github.com/Yu-jianhai/dsh-apple-hig>
- 版本：0.7.2
- 作用面：客户端（`module.exports.inject: ['slots','theme']`）；宿主半边是空操作
- 范围：方案里的 **L0（token）+ L1（排版）+ L2（材质与形状）+ L3（布局）**
- v0.2.0 起 L2 三档（材质 / 圆角 / 间距节奏）默认开；v0.3.0 起 L3 两档（顶栏与分段标签 / 阅读宽度）默认开；v0.4.0 起底部读数行与输入卡控件行统一（默认开）；v0.5.0 起侧栏（行高/时间戳/命中区/选中态/用量卡数字）也纳入（默认开）；v0.6.0 起切换动画（侧栏收展缓动 + 换会话进场）（默认开）；v0.6.1 修掉 v0.6.0 引入的「模型位 High 被裁」——芯片行行高从 `1` 改成 18px，并让推理档位不参与收缩；**v0.7.0 起会话树拖拽重排有了表现层**（浮卡 / 灰块 / 让位 / 吸附，顺序仍由宿主提交）；v0.7.1 修掉 v0.7.0 拖拽的三个缺陷——浮卡只建了空壳没放内容（拖起来是一块空白灰）、松手后 280ms 的清理定时器会误伤紧接着的下一次拖拽、行克隆带着「⋯/删除/收藏」按钮一起飞；v0.7.2 把「被拖行」从完全隐藏改成 35% 淡影（隐藏拖拽源在部分 WebView 里会让浏览器直接 abort 拖拽，表现为「跳一下就回原位」），并对 abort 做静默处理、在设置页显示拖拽事件日志；v0.7.3 把灰块改为 fixed 定位、与浮卡共用 viewport 坐标，并在每次 dragover 重新量行几何（滚动/自动滚动/宿主重渲染后落点不再偏），吸附落点即灰块所在处

---

## 1. 它改了什么（以及每条的依据）

| # | 改动 | 改前 | 改后 | 依据 |
|---|------|------|------|------|
| 1 | 键盘焦点环可见 | `--dsw-focus-ring-color: transparent` | `var(--dsw-alias-state-business-primary)` | 基座 CSS 里 5 处 `outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, <fallback>)`，**因为该 token 有定义，fallback 永不生效** → 焦点环实际透明。WCAG 2.4.7 / HIG Accessibility |
| 2 | 三级文字对比度 | 浅色 `#81858c` = **3.71:1** | `#696e76` = 5.13:1 | WCAG 1.4.3（正文 4.5:1）。深色原值 8.54:1 已达标，照原值写回 |
| 3 | 说明文字对比度 | 浅色 `#adb2b8` = **2.13:1** | `#6d727a` = 4.84:1 | 同上。深色原值 4.92:1 写回 |
| 4 | 品牌字体字重 | `--dsw-font-family-brand: "Montserrat", …`（自带 regular/medium/**light** 三档 woff2） | 回落到正文字体栈 | HIG Typography：「Generally, avoid light font weights」「Minimize the number of typefaces」 |
| 5 | 正文字体族 | DSH 原栈（Python 平台无关栈） | 二选一预设：`native`（Windows 原生感）/ `apple`（SF Pro 优先） | HIG：用系统字体建立层级感。**字号不动** —— HIG 实测「macOS 默认 13pt / 最小 10pt」，DSH 正文 14px、控件 12–13px 本就合规 |
| 6 | 底部读数行（原称「状态栏」） | `[data-shell-bottom]` 只有 `background`，而该槽无人注册＝空行；真实读数行在 `[data-composer-dock]` | 见第 18 项 | HIG Layout「分组靠对齐与留白」＋ Typography「同一处读数同一套 text style」 |
| 7 | 减少动态效果 | 跟随系统但不强制 | `prefers-reduced-motion: reduce` 时把 animation/transition 压到 0.01ms | HIG Motion：「有目的、可关闭」；只压时长，**不动 `iteration-count`**，避免把加载转圈冻住 |
| 8 | squircle 圆角 | — | `corner-shape: superellipse(1.2)`（**默认关**） | HIG 的连续曲率圆角。宿主已用 `@supports (corner-shape:superellipse(1.5))` 探过路；Chromium 不支持时整块样式自动失效，不会报错 |
| 9 | **输入卡材质（看得见）** | `[data-composer-card]` = 实底色 `--dsw-specific-input-major` + `--dsw-elevation-soft` | 88% 半透明 + `backdrop-filter: blur(24px) saturate(180%)` + `--dsw-elevation-prominent` + 0.5px 描边；`:focus-within` 叠一圈 22% 主色光晕 | HIG Layout「区分控件与内容：用材质把控件浮起来」/ Materials「regular 变体适合文本多的界面」。**只给 composer 卡**，侧栏背后是纯底色，blur 等于白烧 GPU |
| 10 | **分隔线（看得见）** | 侧栏与主区之间 `border-left: none`（宿主就是这样，等于没有分界）；状态栏无 border | 侧栏 `inset -.5px 0 0 --dsw-alias-border-l2`；状态栏 `inset 0 .5px 0 --dsw-alias-border-l1` | HIG Layout：「分组用负空间 / 容器 / 分隔线」。只加 0.5px 半透明线，不动留白 |
| 11 | **连续圆角梯度（看得见）** | `--dsw-radius-xs/sm/md/lg/xl/panel` = 4 / 8 / 12 / 16 / 20 / **28** px | 6 / 9 / 13 / 17 / 21 / **22** px | HIG 连续曲率：小控件略圆、大面板收一点，避免「一切皆胶囊」。按钮、菜单、输入卡、弹层都读这几个 token，所以整应用一起变 |
| 12 | **间距节奏（看得见）** | 对话流默认行距 `--dsh-chat-flow-gap: 6px`；输入卡内间距 12px / 上 8px；侧栏内边距 12px | 10px / 14px·10px / 14px | HIG Layout：「用负空间分组、给内容留呼吸」。对话流只抬**默认值**，宿主在部分子项上另写的 12px / 16px 特例保留（不写 `!important`） |
| 13 | 内容宽度留白 | `--dsh-chat-content-width: min(calc(100% - 32px), 920px)` | `min(calc(100% - 40px), 920px)` | 配套第 12 项：最窄时也留 40px，不让正文贴边 |
| 14 | 焦点环加宽 | `--dsw-focus-ring-width: 2px` | 3px | 与第 1 项配套：颜色有了，宽度再给一档才「看得见但不刺眼」 |
| 15 | **顶栏紧凑（看得见）** | `.an3WzG_header{min-height:76px;padding:10px 28px 0 20px}` + 标签行 ≈ 92px 总高 | `min-height:62px; padding-top:8px`，标签行 `margin-top:6px` | HIG：macOS toolbar 约 52pt，标题与视图切换不该占掉窗口 11% 的高度 |
| 16 | **视图标签 → 分段控件（看得见）** | 下划线式：5 个文字标签、`gap:32px`、选中项靠 `:after` 2px 主色条 | `role=tablist` 容器做成浅色轨道（`radius-md` + 3px 内边距 + `.5px` 内描边），选中项浮起（`radius-sm` + `bg-base` + 1px 投影），去掉下划线 | HIG：macOS 里同级视图切换用 **segmented control**；只动样式，`role`/`aria-selected`/键盘导航全部保留 |
| 17 | **阅读宽度对齐（看得见）** | 正文 `min(calc(100% - 32px), 920px)`、输入卡 `min(calc(100% - 16px), 952px)` —— 两个宽度不同，边缘对不齐 | 两者统一 `min(calc(100% - 40px), 780px)` + 卡片 `margin-inline:auto` | HIG Layout：内容与控件对齐；单栏阅读宽度收在舒适范围 |
| 18 | **底部读数行统一（看得见）** | 输入卡下方那条（`3 轮 305 步 · 195 tok/s ｜费用明细｜41M tok · 缓存命中 99%｜本会话 ¥…·命中…·输入…·缓存…·输出… ｜◔17%`）其实在 `[data-composer-dock]` 里，来自三个来源、各写一套：宿主统计药丸 `font-size:calc(13px - 1px)`·`label-tertiary`·`padding:1px 8px`；cost meter 的「费用明细」是实底灰药丸、`.cm-session-cost` 11px 挤成一行；上下文环无字 | 容器 `gap:10px`·`padding:6px 2px 0`·12px·20px 行高·`label-secondary`·`tabular-nums`；统计药丸与「费用明细」同为 12px 幽灵按钮（20px 高、`radius-sm`、hover 才出淡底）；会话费用 12px，金额次级色、明细三级色 | HIG Typography：同一处读数用同一套字号字重；HIG Layout：靠对齐与留白分组。**顺带纠正一个事实**：`[data-shell-bottom]` 只渲染 `shell.bottom` 槽，desktop profile 无人注册 → 是空行，原第 6 项的「状态栏降存在感」一直打在空盒子上 |
| 19 | **控件行统一（看得见）** | 输入卡下面那排芯片四个来源四种盒型：「古籍」28px 高·1px 实线·`radius 8`·`opacity .72`；「记忆·智能」视觉 24px·无底无边·开启走 `border-image` 流光；「专家」纯文字 13px 无描边；「完全权限」「模型」宿主自己的槽 | 统一 26px 高·`padding 0 9px`·`radius-sm`·12px/500·**行高 18px**·`gap 5px`·`inline-flex` 居中；「古籍」描边 1px→0.5px 且 `opacity` 归 1；「专家」补 0.5px 淡描边；「+」固定 26×26 | HIG：同类职责的控件共用几何与字重，差别只体现在状态色。**只统一盒子与字体，不碰各插件强调色** —— 强调色表达状态（古籍开启、记忆流光、权限等级），统一掉反而丢信息 |
| 20 | **侧栏行高与命中区（看得见）** | 同一块侧栏四档行高：会话行 32px、文件夹行 34px、顶部导航行 `min-height:36px`、分组头 36px；时间戳 `font-size:10px`·`line-height:16px`（全侧栏最小字）；行内动作按钮 16×16（命中区）；选中 `.selected{background:var(--dsw-alias-interactive-bg-hover)}` **与 hover 同色**；cost meter 用量卡分隔线 `1px`（宿主其它分界线都是 `.5px`） | 行统一 34px、导航行 36→34px；时间戳 10→11px + `tabular-nums`；行内动作 16→24px 命中区（图标仍 16）；选中改主色 9% 底 + `.5px` 内描边、hover 12%；用量卡分隔线 `1px→.5px`、卡片顶部留白 8→10px、今日两值统一 12px/18px + `tabular-nums` | HIG Layout：同一列表内行高一致，分组用留白而非行高；HIG Accessibility：可点区域不小于 24×24；HIG Typography：最小字号不低于 11px，数字用等宽字形避免扫读跳动；选中态必须与悬停态可区分 |
| 21 | **切换动画（看得见）** | 侧栏收展：宿主自带 `.frame[data-animating]{transition:grid-template-columns .3s var(--ds-ease-in-out)}`，用的是通用 ease-in-out，起步收尾一样快、中段发木；换会话：主区内容不换 DOM 节点，只改 `[data-conversation-session]` 的值，CSS 感知不到，等于**硬切** | 侧栏收展改 `.34s cubic-bezier(.32,.72,0,1)`（快起慢收），仅在宿主标记 `[data-animating]` 且非拖动时生效（窗口缩放不跟着动画）；换会话时由 MutationObserver 给内容节点打 `data-ahig-enter`，触发 `.22s` 的淡入 + 上移 6px | HIG Motion：动画要有目的、短暂精确、别让人等；常用交互不必加动效，**切换上下文**是例外——它需要让人知道「内容换了」。只监听 `data-conversation-session` 一个属性，不监听 childList，避免流式输出时每帧回调（这台机器专门查过空闲 CPU） |

对比度验收（`node tools/contrast.mjs`，读 `_recon/palette.json` 的真实色值算 WCAG 比值）：

```
浅色  正文主色 18.90  次色 5.80  三级 3.71→5.13  说明 2.13→4.84  焦点环 n/a→4.23
深色  正文主色 17.45  次色 12.11 三级 8.54       说明 4.92       焦点环 n/a→7.83
```

---

| 22 | **会话树拖拽重排（看得见）** | 宿主自己实现了 HTML5 拖拽换序：行上 `draggable`、`dragstart` 写 `text/plain`、`dragover` 按行上下半决定 before/after、`drop` 走 `sessionDragOrder → setSessionOrder`（全仓唯一写入方）。但过程只有一条 55deg 渐变的落点线，行不会让位、没有拿起感 | 拿起时用自绘浮卡跟手（原位换成灰块），越过相邻行中线就换格、其余行 180ms 让位；松手 240ms 吸附到落点（轻回弹 / 直接落定两选一）；灰块三形态（实块 / 虚线空槽 / 幽灵卡）；Esc 与拖出列表都不提交。**顺序一律由宿主 drop 完成**，我们只画 | HIG Motion：直接操纵的物体要有拿起感、落点要可预览；HIG Layout：拖拽中给出明确的目标位置，避免「松手才知道结果」 |
| 23 | **与两侧既有动画的兼容** | ① 宿主提交后会跑 `AnimatedRows` 的 FLIP（`ROW_GLIDE_MS=200`）；我们的行位移若残留，FLIP 会量到错误起点。② `dsh-session-progress` 把进度带画在 `[data-row-key^="session:"]::before/::after` 上，灰块是行的克隆，会连带画第二条进度带 | ① 松手瞬间用 `transition:none` 清掉自己的位移、并让被拿起的行保持隐藏到浮卡落定，宿主 FLIP 以自然位置为起点、同一行不会有两套动画；② 灰块克隆前先摘掉 `data-row-key`（改挂 `data-ahig-ph`），进度带不会进灰块；③ 我们出灰块时隐藏宿主那条落点线 | 一条横向约束：**同一元素只保留一套动画，收尾交给宿主** |

## 2. 故意不做的事

- **不与 `dsh-plugin-liquid-glass` 抢全局材质**。那个插件占的是「整窗口贴膜」这一层；本插件只给 **composer 输入卡**一层玻璃（它是唯一浮在可滚动内容之上的控件），侧栏、状态栏只用 0.5px 线。HIG 的原话也是「Liquid Glass 只用于控件与导航层，内容层用 standard materials」。
- **不重排功能**：侧栏、标签栏、composer 的**位置、顺序、内容**不动。L3 只做「容器尺寸与控件形态」——顶栏压到 62px、视图标签换成分段控件、正文与输入卡统一宽度。拖动分栏、增删标签这些结构性改动一律不做。
- **不改字号**：`theme.setFontSize` 只有 text/code/terminal 三个角色、范围 10–22px，且 HIG 实测证明现值合规。
- **不改用户自己选的字体**：只覆盖 `--dsh-font-family-text-default`（兜底位），不动 `--dsh-font-family-text`（用户在设置里选过的）。
- **不依赖哈希类名**：只用宿主自己写死的钩子 —— `[data-shell-bottom]` 之类 `data-*` 结构属性（layout 源码里 `"data-shell-bottom": true`，是真实盒子），以及 `[data-slot="…"]` 锚点（renderer 通用产出）。锚点是 `display: contents`，**没有盒子**，所以视觉属性只能打在它的父级/子级上。

---

## 3. 开关（设置 → 插件 → Apple 规范）

每个开关都独立建/撤一层 token 覆盖，关掉就回到 DSH 原值：

| 开关 | 默认 | 说明 |
|------|------|------|
| 顶栏紧凑 + 分段标签（看得见） | 开 | 第 15、16 项（L3） |
| 阅读宽度对齐（看得见） | 开 | 第 17 项（L3） |
| 控件材质（看得见） | 开 | 第 9、10 项（composer 卡玻璃 + 两处分隔线） |
| 连续圆角梯度（看得见） | 开 | 第 11 项（6 个 radius token 一起换） |
| 间距节奏（看得见） | 开 | 第 12、13 项（行距、卡片内间距、侧栏内边距） |
| 焦点环 | 开 | 第 1、14 项 |
| 文字对比度 | 开 | 第 2、3 项（浅色/深色成对覆盖） |
| 品牌字体归一 | 开 | 第 4 项 |
| 字体预设 | `native`（Windows）/ `apple`（macOS） | 第 5 项；`off` = 不覆盖字体 |
| 底部读数行统一 | 开 | 第 6、18 项（读数字号/颜色/「费用明细」盒型） |
| 控件行统一（看得见） | 开 | 第 19 项（输入卡芯片行盒型统一） |
| 侧栏行高与命中区（看得见） | 开 | 第 20 项（侧栏行高/时间戳/命中区/选中态/用量卡数字） |
| 切换动画（看得见） | 开 | 第 21 项（侧栏收展缓动 + 换会话进场；关掉同时撤掉 MutationObserver） |
| 拖拽重排动画（看得见） | 开 | 第 22、23 项（会话树浮卡 + 灰块 + 让位 + 吸附；顺序由宿主提交） |
| 减少动态效果 | 开 | 第 7 项（只在系统开启 reduce 时生效） |
| squircle 圆角 | 关 | 第 8 项，Chromium 支持度不确定，默认不启用 |

偏好存在 `localStorage['dsh-apple-hig:v1']`，逐字段校验后使用（坏值回落默认，不会因为一条手改的 JSON 让插件起不来）。

---

## 4. 技术通道

只用宿主提供的两个官方通道，外加一层门控 CSS：

1. **`theme.overrideTokens(source, tokens)`** —— token 层叠加。`tokens` 是 `{ 变量名: { light, dark } }`，值必须是成对字符串，**给裸字符串会 throw**（`validateOverrides` 里明确抛 `TypeError`）。层按注册顺序叠，撤销走返回的 disposer。每个开关一个 source（`apple-hig/focus-ring` 等），切换时**先全量撤销旧层再建新层**，不留野层。
2. **`slots.register({ name: 'settings.section', id: 'apple-hig', order: 72 }, Component)`** —— 设置页那一节。
3. **一段 `<style data-plugin-css="dsh-apple-hig">`** —— 给没有 token 的东西（状态栏底色、reduced-motion、squircle）。样式全部由 `<html>` 上的 `data-ahig*` 属性门控，卸载时属性和样式表一起清掉。

`theme` 不可用时（理论上不会，它是核心服务）插件 warn 并降级：样式层仍生效，token 层跳过。

### 4.1 为什么有些间距「改不动」

`overrideTokens` 只改 `:root` / `body` 层的变量。宿主有三个间距变量是**组件在自己身上声明**的，元素自身声明比祖先更近，从根上覆盖会被压住：

| 变量 | 声明处 | 本插件的做法 |
|------|--------|--------------|
| `--dsh-composer-stack-gap: 6px` | `.an3WzG_composerStack` | 不碰（改它会让 composer 内部各行贴死） |
| `--dsh-composer-dock-inset: 8px` | `.an3WzG_body` / `.embeddedBody` | 不碰 |
| `--dsh-sidebar-inline-padding: 12px` | `.wtg9ga_root` | **走 CSS 层**：`[data-slot="sidebar"] > div { --dsh-sidebar-inline-padding: 14px }`（特异性 0,2,2 胜过 0,1,0；只改变量，padding 与 topStrip 的负 margin 一起跟着变，不会错位） |

**侧栏宽度改不了**（这是 L3 唯一没做的一项，原因是硬限制不是取舍）：`dsh-client-ui-layout` 的 `computeColumns(viewport, sidebar, rightbar, collapsedWidth)` 会把侧栏宽夹到 `clampWidth(sidebar, 264, 420)`，并作为**内联 `grid-template-columns`** 写到 frame 上（`${cols.sidebar}px minmax(...) ...`）。内联样式优先于任何样式表，而 `layout` 服务只暴露 `selectPanel / toggleSidebar / openRightbar / closeRightbar`，没有设置宽度的入口 —— 想改只能注入 JS 去动 React 的 state，那已经不属于「叠加层」。要宽一点请直接拖侧栏右边那条分界（宿主自带，且会记住）。

同理，对话流行距 `--dsh-chat-flow-gap` 在**子元素上按组另写**了 12px / 16px 的特例；本插件只在 `[data-slot="conversation.chat.flow"]` 锚点上抬默认值、**不写 `!important`**，让宿主自己的特例继续赢 —— 否则「一轮之内」和「轮与轮之间」的层级会被压平。

---

## 5. 安装 / 回滚

本机没有可用的 `dsh plugin` CLI，但 profile 里已有三个同款先例（`dsh-sidebar-layout`、`dsh-session-progress`、`dsh-web-auth-failed`，都是 `link:<源码目录>` + junction）。`install.mjs` 复刻这三步，并且**从哪个目录 clone 都行**（链接目标取脚本自身所在目录）：

```bash
git clone https://github.com/Yu-jianhai/dsh-apple-hig.git
cd dsh-apple-hig
node install.mjs            # dry-run，只打印计划
node install.mjs --apply    # dependencies + bundles + junction，先备份 package.json
node install.mjs --apply --uninstall   # 卸载
```

装完**必须完全退出并重启 DSH Desktop**（profile 里 hmr 是 `disabled: true`，改插件不热更新）。

回滚三层保险：profile `package.json` 有带时间戳的 `.bak`；`--uninstall` 反做三步；插件内所有改动都在运行期，进程一退即失效。

---

## 6. 验收

```bash
node tools/contrast.mjs      # 8 项 × 2 套主题，全部 ≥ 门槛才 exit 0
node test/boot-smoke.mjs     # 最小 DOM/React 替身跑真 bundle，60 项断言
```

`boot-smoke` 覆盖：bundle 形状 → apply 不抛 → 默认建 **7 层**（focus-ring / text-contrast / brand-font / radius / rhythm / measure / font-*）→ squircle 不建 token 层 → `<html data-ahig*>` 12 个属性 → 圆角、行距、阅读宽度的具体数值 → 设置分区注册 → 焦点环 token 成对非空 → 深色档写回 `var(` → 改偏好先回收旧层 → 关掉圆角后不再建层 → localStorage 落盘 → 切换动画的 MutationObserver 只挂 1 个且只监听 `data-conversation-session` → 关开关后 observer 全断开 → cleanup 回收。

`tools/contrast.mjs` 的 token 基线随包发布（`tools/palette.json`，由 `parse3.mjs` 从 `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 的内嵌 CSS 解析而来）。DSH 升级后想用新基线校准：`node tools/contrast.mjs --palette <新的 palette.json>`。

运行期调试口：`window.dshAppleHig`（`get()` / `layers()` / `patches()` / `set({...})` / `reset()`）。

**两条还没拿到运行期证据的**（本地 HIG 抓取把表格转成了 `[table]` 占位，且桌面端没开调试端口）：

- 焦点环不可见是**静态 CSS 推断**（token 唯一一次定义为 `transparent`，5 处 fallback 因此失效）。重启后按 Tab 走一遍能确认。
- 状态栏 `opacity: .8` 的实际观感需要截屏 A/B；数值上它会同时压低里面所有文字，若觉得太淡，把 `.8` 提到 `.9`（`lib/client.js` 的 `CSS` 常量）。

---

## 7. 已知边界

- 只覆盖浅/深两套内置主题；第三方主题若自己重定义了 `--dsw-alias-label-*`，本插件的覆盖仍在其上（`overrideTokens` 层序更高），这是刻意的。
- 深色档的三级/说明文字写法是**写回原值**（`var(--dsw-static-neutral-bluish-*)`），不是新颜色，所以深色模式视觉应与原来一致。
- 不处理 Windows 高对比度模式（`forced-colors`）。
- 底部读数行与芯片行的选择器认的是**别人家插件的类名**：`[data-composer-dock]` / `[data-composer-stat]`（宿主，稳定）、`.cm-btn` / `.cm-session-cost`（dsh-cost-meter）、`.dslt-btn`（dsh-literature-agents）、`.dsh-mem-pill-hit`（dsh-prime-memory）、`.aag-btn-wrap`（@michengai/dsh-agency-agents）。这几家升级若改名，对应规则会静默失效（不会报错，也不会误伤）；`[data-slot="conversation.input.*"]` 与 `button[aria-haspopup="listbox"]` 这两条是宿主契约，不受插件改名影响。
- 芯片行只统一几何与字体；「记忆·智能」开启态的流光走 `border-image`，颜色与动画保留原样。

---

## 8. 许可

MIT © 2026 Ne_Rn。见 [LICENSE](./LICENSE)。
