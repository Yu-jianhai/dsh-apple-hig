# dsh-apple-hig

按 Apple Human Interface Guidelines 校正 DeepSeek Harness 桌面端配色、字体与状态栏的一个**叠加层插件**：
不改宿主代码、不碰功能布局、每一档都能单独关掉，卸载即完全还原。

- 仓库：<https://github.com/Yu-jianhai/dsh-apple-hig>
- 版本：0.10.2
- 作用面：客户端（`module.exports.inject: ['slots','theme']`）；宿主半边是空操作
- 范围：方案里的 **L0（token）+ L1（排版）+ L2（材质与形状）+ L3（布局）**
- **v0.9.2 改成 DSH 自己的分段控件规格**（依据仓库 `packages/client/ui-primitives/src/SegmentedTabs.module.css`）：轨道 inset 4px / `radius-lg` / `bg-module-platform`；标签高 34、`padding 0 12`、14px·20px；选中块 `radius-md` + 0.5px `border-l3` + `bg-layer-3`，用轨道 `::before` + `transform 180ms ease` 滑动；未选 400 次级色、选中 600 主色；窄容器自动退到 sm 档（inset 2 / 高 30 / 选中 500），再窄就整条退回宿主下划线。同名标签加右上角序号（`上下文 1 / 2`，tooltip 注明来源插件），不改文案。夹具 22 项（含滑轨索引、同名序号、轨道宽 = 5 段 + 8px）。
- **v0.9.1 按 HIG 的 Segmented Control 规格校准尺寸**：控件高 **24pt**（原 26）、分段**等宽**（取最宽文本 + 2×10px，且不小于 44px）、段间 **1px**（原 2px）、轨道内边距 **2px**、轨道圆角 **7px**、选中块圆角 **5px**（比轨道小一圈）、标签 13px/Medium；未选中用次级色、选中项**浮起一块底色**（不靠改文字色表达选中）；轨道垂直居中，行内上下留白 6/6 对称。夹具补三条断言：分段等宽、选中段与轨道底色不同、24px 高。
- **v0.9.0 删掉旧的分段控件实现，按真实结构重写**：前几版一直在猜「哪条规则没命中」——子代/后代、按钮/``[role=tab]``、`width:max-content`、内联样式都试过，实测仍是「轨道被压到 190px、5 个标签要 284px」。按用户要求先**归档再删除**（git tag `archive/tabs-0.8.13` 指向旧实现），然后重新取证：
  ① 宿主源码 `viewTabs()` 直接产出 `div[role=tablist][data-conversation-tabs] > button[role=tab]`，**按钮是 tablist 的直接子节点、没有包装层**（旧夹具里那层 `<span class="hc">` 是我自己臆造的，已删）；
  ② 现场 diag 里 `tl=2`：页面上还有一个来自右栏面板的 `role=tablist`，旧的「后代匹配」会把它也画成轨道；
  ③ 根因是**装不下**：`.tabs` 是 flex 行、`.viewTabs` 自带 `min-width:0`，一旦可用宽度不足，整条轨道会被压到比内容窄，按钮又不肯缩 → 溢出、文字互压。
  新实现改成**先量后画**：算出「标签自然宽度 + 内边距 + 间隙」，与「这一行扣掉兄弟元素后的可用宽度」比较；装得下才把几何写成元素的内联样式（压过任何非 `!important` 规则），装不下就整条退回宿主原样、一个内联属性都不留。伪元素下划线与选中态这类 CSS 独有的部分挂在 `[data-ahig-tabs="1"]` 上，只在真正画上时才生效。`test/chrome-fixture.html` 重写为真实结构（按钮直接是 tablist 子节点）+ 12 项断言：宽容器画上、压到 200px 自动退回且无残留、恢复宽度再画上。
- **v0.8.4 撤回按文案去重 + 修分段控件的重叠**：实测两个「上下文」分别是 `dsh-context` 的 `context`（order 20）与 `billion-context` 的 `bili-context`（order 30）——**两个插件各自合法的视图**，按文案隐藏会把后者整个吃掉，所以 `tabDedupe` 改为**默认关闭**（开关保留，只给「同一插件重复注册」的极端情况）。
  同时修掉标签条的重叠：按钮规则原用子代选择器 `[data-conversation-tabs] > button[role="tab"]`，一旦 tablist 与按钮之间夹了包装层（提示层/HoverCard 都会），整组按钮规则全部落空——只剩轨道生效、按钮没有内边距，文字零间距挤在一起。改成**后代选择器**，并给按钮 `flex:0 0 auto` + `white-space:nowrap`、轨道 `flex-wrap:wrap`。
  回归：`test/tab-fixture.html` 改断言「默认两个上下文都保留、hidden=0」，新增 `test/tab-dedupe-fixture.html`（手动打开去重后只剩一个）；`test/chrome-fixture.html` 给每个 tab 套一层 `<span class="hc">` 复刻包装层，断言「按钮拿到 12px 内边距」——把选择器改回 `>` 会跑出 `0px/0px/0px/0px`。
- **v0.8.3 标签条去重补齐带图标的 label**：v0.8.2 的判重取的是按钮里第一个 `<span>`，而宿主给 view 的 label 可能是 `<span class="icon"/><span>上下文</span>`（图标 span 在前且为空）→ 拿到空串被跳过，两个「上下文」照样并排。改成取「最后一个非空 span」、全空再退回整按钮文本；新增 `test/tab-fixture.html` 覆盖两种 label 形态，去掉修复会跑出两个「上下文」。
- **v0.8.2 标签条去重**：宿主把同一个 `conversation.view` 注册两次时（标题行会出现两个「上下文」），表现层把后出现的同文案标签隐藏、重复消失后自动还原；不移除节点（React 仍持有 fiber），默认开，可在设置里关。
- **v0.8.1 修松手后的重影与压行**：源行只在「还占着原位」时显示 35% 淡影，一旦让位发生就真正隐藏（否则让位行会压到它身上叠字）；组末落点改停「末行原格」，不再落到「展开其余 N 个会话」那一行上把字盖住。夹具新增 3 条断言（让位后源行隐藏 / 组末落点停在末行原格 / 灰块不压「展开其余」）。
- v0.2.0 起 L2 三档（材质 / 圆角 / 间距节奏）默认开；v0.3.0 起 L3 两档（顶栏与分段标签 / 阅读宽度）默认开；v0.4.0 起底部读数行与输入卡控件行统一（默认开）；v0.5.0 起侧栏（行高/时间戳/命中区/选中态/用量卡数字）也纳入（默认开）；v0.6.0 起切换动画（侧栏收展缓动 + 换会话进场）（默认开）；v0.6.1 修掉 v0.6.0 引入的「模型位 High 被裁」——芯片行行高从 `1` 改成 18px，并让推理档位不参与收缩；**v0.7.0 起会话树拖拽重排有了表现层**（浮卡 / 灰块 / 让位 / 吸附，顺序仍由宿主提交）；v0.7.1 修掉 v0.7.0 拖拽的三个缺陷——浮卡只建了空壳没放内容（拖起来是一块空白灰）、松手后 280ms 的清理定时器会误伤紧接着的下一次拖拽、行克隆带着「⋯/删除/收藏」按钮一起飞；v0.7.2 把「被拖行」从完全隐藏改成 35% 淡影（隐藏拖拽源在部分 WebView 里会让浏览器直接 abort 拖拽，表现为「跳一下就回原位」），并对 abort 做静默处理、在设置页显示拖拽事件日志；v0.7.3 把灰块改为 fixed 定位、与浮卡共用 viewport 坐标，并在每次 dragover 重新量行几何（滚动/自动滚动/宿主重渲染后落点不再偏），吸附落点即灰块所在处；v0.7.4 是**诊断版**：右上角浮层实时显示「按下 / dragstart / dragover / drop / dragend」计数与结论（临时，可在设置里关掉），用来定位「拖拽没被接管」到底断在哪一环；v0.7.5 让探针多显示两行实测值——灰块与浮卡的盒子（宽x高@x,y、浮卡是否已显示）与最近一次拖拽异常（err=…），异常也改为捕获后上屏而不是静默丢弃；v0.7.6 按宿主规则把落点限制在源行所属工作区内（DOM 同父 + 竖向连续性双重判定，跨组时灰块停在边界并变淡、松手不提交），并把「取消要回源行」和「提交才去灰块处」分开；v0.7.7 修掉 v0.7.6 的分组判定缺陷——会话行外面裹着 HoverCard 的 span 包装层，每行父节点各不相同，「DOM 同父 与 竖向连续」取交集后退化成单行分组，落点被钉死不动（观感就是「没有效果」）；改为**纯按 1.5 倍行高间距**判分组，并把宿主自己的落点线放出来（它由宿主算，永远是对的），自动滚动也改成向上找真正的滚动容器；v0.7.8 又抓到更早的一处根因——侧栏锚点 `[data-slot="sidebar"]` 是 `display:contents`，`getBoundingClientRect()` 全为 0，于是「指针在不在树里」恒为 false，`slot` 从不更新、灰块钉在源行不动；边界改用行的实测矩形拼。**新增 `test/run-drag-fixture.mjs`：用无头 Edge 加载真实 bundle，按宿主结构（行被 HoverCard 的 span 包一层 + display:contents 锚点）驱动真实 DragEvent，直接断言灰块跳到哪一格、行有没有让位**——这类几何坑以后由它兜底；v0.7.9 修「拖起来文字错位」——会话行的左缩进是 `padding-inline-start: calc(8px + var(--dsh-workspace-indent))`，而 `--dsh-workspace-indent` 由宿主内联写在**工作区分组 section** 上，克隆一离开那个祖先就回落成 0，卡片里的文字整体左移（夹具实测 card=8 而原行=20）；克隆时把行上实测的缩进与字体/内边距抄成内联，夹具新增「浮卡内文字缩进与原行一致」断言（去掉修复即 FAIL）。同时修掉两处连带问题：`step` 改用同组相邻间距中位数（跨组大空隙不再撑大步长、行不会多移几十像素），`drop` 目标按 `data-row-key` 匹配（宿主拖拽中重渲染换节点后不再误判成「落点不在本工作区」而永不提交）；v0.7.10 修三处衔接问题——①分组改按宿主的工作区分组 section 祖先判定（原来靠竖向间距，两组之间只隔一个组标题，会并成一组），并把「组第一格」直接取该行自然顶部（原来会算成上一组末尾，灰块就跑到别的组）；②松手吸附目标改用灰块此刻的**实测矩形**，不再按公式重算（重算差一格就是「飞回上一次预览位置」）；③取消时行滑回（180ms）而不是瞬间清空，卡片过渡先结算当前位再起步，曲线放缓一档；**v0.8.0 重构拖拽引擎**：把槽位/步长/分组/位移/落点判定抽成不碰 DOM 的纯核心 `CORE`（9 个函数），DOM 侧只留薄包装与渲染，`window.dshAppleHig.core` 可直接断言；新增 `test/unit-drag-core.mjs`（32 项，数组进数字出）与 `npm test`（三层：单元 → 冒烟 → 夹具）。（这一整套自绘拖拽引擎在 v0.10.0 被整体移除，原因见顶部条目）

---

- **v0.9.3 修「轨道右侧多出一截空白」**：宿主把标签包在 `.tabLabel{display:block;max-width:88px}` 里，块级 + 上限让 `Range` 量宽恒等于 88px，分段被撑到 88+24=112px。改成 `display:inline-block;max-width:none;overflow:visible` 后按真实文字量宽（63px），轨道宽 5×63+8=323。夹具复刻该包装层并新增断言（23 项）。
- **v0.9.4 让控件与文字绑定（滑轨不再按 n 等分）**：滑轨的位置与宽度改成取「选中按钮的实测矩形」，轨道宽度也改成「各按钮实测宽之和 + 2×inset」。之前滑轨按 `(100% - 2*inset)/n` 等分，一旦宿主在下一帧替换按钮节点（我们写的内联宽度被清掉）或文字宽与等分值不等，滑轨就会与文字错位。夹具加三条断言（滑轨左缘贴住选中按钮、宽度等于按钮宽、点第 3 个后跟过去），26 项全过。
- **v0.9.5 修「分段被撑到 112px、控件与文字仍错位」**：v0.9.3 那条 CSS 写的是 `.tabLabel`，而宿主的类名是哈希前缀的 `an3WzG_tabLabel`，选择器从来没命中；量宽又走 `Range` 打在 `display:block` 的标签上，量出来恒是盒宽 88 → 每段 88+24=112。改成 `[class*="tabLabel"]` + 离屏 span 用按钮同一套字体量文字（63px），`dshAppleHig.tabs()` 现在返回 `{on,buttons,seg,track,rail}` 便于核对。夹具同步改成哈希类名，26 项全过。
- **v0.10.0 拖拽层改回「只装饰、不接管」**：v0.7–v0.9 那套自绘浮卡 / 灰块 / 让位 / 吸附整体删除（约 860 行，连同 `test/unit-drag-core.mjs`、`test/drag-fixture.html`、`DRAG-ENGINE.md`）。理由是宿主 `dsh-client-ui-workspace` 早已把这件事做完整了：`useRowDragPreview` 克隆整行后 `setDragImage`、`dropBefore/dropAfter` 类画落点线、`commitSessionDrag → sessionDragOrder → setSessionOrder` 提交顺序，`rowHalf(e)` 算行的一半、`withinGroup` 拒跨组。插件再画一套就是同场抢 `setDragImage`、抢 `dragover`、抢 drop 判定——同场两次调用谁赢是浏览器实现细节，而 `visibility:hidden` 隐藏源行会直接把原生拖拽打断。现在只留三个 capture 的**只读**监听：`dragstart` 给源行打 `data-ahig-src="1"`（压到 45% 不透明），`dragend` / `drop` 清掉；拖影只在宿主自己生成的那份克隆体上补圆角与阴影（`[class*="_dragPreview"]`）。不碰 `dataTransfer`、不 `preventDefault`、不 `setDragImage`、不隐藏源行。`dshAppleHig.drag()` 改成只读快照（`active / source / over / marker / previews / dimmed / order`）。设置页相应去掉「落点形态」「松手吸附」两处枚举和「诊断浮层（临时）」开关，`package.json` 的 `test` / `test:tabs` 改为 `boot-smoke` + `run-fixture.mjs test/chrome-fixture.html`。
- **v0.10.2 落点提示（拖拽时看得见会落在哪）**：v0.10.1 的浮卡只回答了「我拖的是什么」，没回答「松手会插在哪一格」。现在拖拽期间多画一层 fixed 的落点提示：一个与行同高的**槽**（主色 12% 填充 + 主色 42% 的 1px 描边 + `radius-sm`）外加一条 2px 主色**插入线**，两者都以插入边界为中心。判定**只有一个来源**——宿主在 `dragover` 里用 `rowHalf(e)` 给目标行挂 `dropBefore`/`dropAfter`（跨组时 `withinGroup` 干脆不挂），插件只读这两个类再画，所以「画出来的位置」与「提交的位置」不可能不一致；宿主拒绝时（跨组）提示自动收起，不留假落点。动画按 HIG 的减速曲线：槽与线的位移走 `170ms cubic-bezier(.32,.72,0,1)`，出现时 2px 下沉 + 140ms 淡入，`prefers-reduced-motion` 下全部关掉过渡。时序上我们挂在 document 的 capture 阶段、先于宿主的 React 处理器跑，因此读到的是**上一帧**的标记：先按它画（保证跟手），再排一个**微任务**等本次标记落好重画一次——用微任务而不是 rAF，事件派发一结束就执行、不被后台窗口节流。落点层 `pointer-events:none`、`z-index` 比浮卡低一层，绝不插手宿主的 `rowHalf` 判定。`dshAppleHig.drag()` 增 `landing`（`before:session:xxx`）与 `slot`（实测矩形）。新增 `test/drop-fixture.html`（22 项：槽高=行高、槽以边界为中心、线压边界、左右对齐、落点翻转、宿主拒绝时收起、动画收敛、松手摘层），`package.json` 加 `test:drop` 并纳入 `test`。
- **v0.10.1 浮卡（V2，默认关）**：在 v0.10.0 的纯装饰之上补一层可选的「真浮卡」——把宿主那张位图拖影换成 1×1 透明图，另画一张 `position:fixed` 的卡片跟着指针走，源行同时压到 45%。关键在于**次序**：宿主的 `setDragImage` 在它自己的 `onDragStart` 里同步调用（React 委托在根容器上），同一次 `dragstart` 里后一次 `setDragImage` 生效，所以覆盖必须挂在**冒泡阶段**（capture 阶段会被宿主随后盖回去）；压暗则推迟到下一帧（`requestAnimationFrame` + 48ms 兜底定时器，后台窗口里 rAF 会被节流），否则宿主克隆整行时会连压暗一起快照。卡片内容是去掉 `data-row-key`/`draggable`/tab 序的整行克隆，宽度高度取源行实测矩形，`pointer-events:none` 不吃指针，`aria-hidden` 不进读屏。仍不 `preventDefault`、不写 `dataTransfer`、不隐藏源行——提交依旧只归宿主。新增 `test/card-fixture.html`（25 项，含「宿主先调、我们后调」的顺序断言与跟手位移断言），`package.json` 加 `test:card` 并纳入 `test`。
- **v0.9.12 设置页按宿主设置面板重做**：原来是「描边卡片套卡片 + 原生 checkbox/radio + 长段 why 铺在页面上 + opacity 降级配色」。现在改成 HIG 的分组列表：分组标签（11px/600/tertiary）+ 圆角分组容器（`--dsw-alias-bg-layer-2`）+ 行间 0.5px 发丝分隔 + 44px 行高 + 15/13/11 三级字号；开关换成 38×22 轨道 + 18 圆点的自绘 switch（关态用填充色、开态走 `--dsw-alias-state-business-primary`）；三处枚举（落点形态 / 松手吸附 / 字体族）从单选项列表改成与顶栏视图标签同规格的分段控件；行内说明只留一句话（完整解释挂 `title`）；主题状态、token 层、拖拽日志收进「诊断」折叠区，默认收起；页脚「恢复默认设置」改用 0.5px 描边按钮。颜色全部走 `--dsw-alias-label-primary/secondary/tertiary` 与 `bg-layer-2`，不再依赖 opacity。
- **v0.9.11 启动期根本没起标签条 pipeline（真正的根因）**：`apply()` 里手抄了一份初始化子集（installStyle / syncAttrs / 令牌层 / 切换动画 / 拖拽），**唯独漏了 `startTabs()`**——它只在 `applyPrefs()`（用户动设置时）里被调用。于是全新启动或每次宿主重建 tablist 节点后，没有任何人再画，真机就一直是宿主的下划线标签；只有动过一次设置才会画上，而 bundle 一重载（每次 apply）计时器就丢。这也是「夹具全过、真机不生效」的根源：夹具首条断言 `api.tabs()` 内部会调 `syncTabs()`，等于自证。修法：`apply()` 改为直呼 `applyPrefs()`（单源），夹具加「启动期即已上色（不靠测试钩子触发）」断言，先测属性再调钩子。
- **v0.9.10 间隙改由 JS 写在 tablist 上（并带一次性自证探针）**：v0.9.9 把 10px 加在 CSS 的 `div:has(> div > [data-conversation-tabs])` 上，真机无变化——真机顶栏一直只有 52px 高，而那条规则里带着 `min-height:62px`，说明**该选择器根本没有匹配到宿主顶栏**（宿主 DOM 深度变了，`:has()` 静默失效）。改为在 `paintTabs` 里给 tablist 内联 `margin-bottom:10px`（`SEG_GAP`），与轨道其余几何同源，不再依赖 DOM 结构；`margin-bottom` 进 `TABS_TRACK_PROPS`，卸载时一并清理，CSS 那条 `padding-bottom` 撤回避免双份留白。
- **v0.9.9 修「轨道贴着顶栏分隔线」**：宿主的下划线式标签靠 `.tab` 自己的 `padding:10px 10px 9px` 撑出下沿空白（2px 下划线还画在 `bottom:-1px`），换成分段控件后按钮只剩 34px、那段 padding 被清掉，轨道下沿离分隔线只剩 0.5px（发丝线本身，真机截图实测间隙 0）。顶栏那条 `div:has(> div > [data-conversation-tabs])` 规则补上 `padding-bottom:10px`（宿主在没有标签时用的就是 10px，与上方 `.tabs` 的 `margin-top:10px` 对称）。**夹具也修了同一类漏检**：原来把分隔线挂在 `.frame` 上、header 自己不带边框，「轨道离分隔线多远」根本没人量；现在分隔线移到 `.hdr`（与宿主 `.an3WzG_header{border-bottom}` 一致），并新增断言「轨道下沿与分隔线留出余量（≥6px）」——去掉这条 padding 立刻 FAIL 0.5px。
- **v0.9.8 修真机上「分段控件被压扁」（宿主负边距没清）与「选中块只有空心框」**：①宿主 `.tab` 为了扩大点击区写了 `margin:-10px -10px 0`、`padding:10px 10px 9px`、`min-height:35px`，我们只覆盖了 padding/height、没清 margin → 每段实际占位变成「文字+24-20」、行高变成「34-10」，于是轨道只有 188×32、相邻标签互相压 20px（真机截图实测 189×32，与算式一致）。改成内联 `margin:0` 后回到 296×42、段 57.6×34。**夹具改成逐字抄宿主 CSS**（旧夹具把它简化成 `min-height:25px; padding:0 0 9px`，所以夹具 30 项全过而真机照坏）：去掉这条修复，夹具立刻跑出「轨道高 32px」「相邻标签重叠 20px」「滑轨左缘 −10」。②深色主题下 `bg-layer-3` 与 `bg-module-platform` 同为 `#353638`，选中块与轨道**完全同色**，只剩 0.5px 描边——看起来就是个空心框。新增 token `--dsw-ahig-seg-pill`（浅色 = `bg-layer-3` 白，深色 = 轨道色 + 8% 白），夹具令牌也改回宿主的真实同值，并让 theme 桩真的把 token 落到 `:root`，这样「选中块浮起」这条断言才不是靠夹具自己造出来的色差恒过。③夹具那条「退回后没有残留内联内边距」改成断言内联样式为空（原来断言 computed padding = 0，在真实宿主 `padding:10px` 下必然误报）。
- **v0.9.7 按设计稿把分段控件对齐（等分改由 flex 完成）**：①段宽改成「自然宽的等分」——`flex:1 1 0` + 轨道 `max-content`，与宿主 `SegmentedTabs` 走同一条布局路径；写死的「最宽文字+24」会得到 66/段、轨道 338，比设计稿（57.6/段、轨道 296）胖出一圈。②量文字宽改用**目标字号 14px**（原来量的是宿主 `.tab` 的 13px，少 3px/段；量完再按 14px 渲染，「上下文」就被压扁）。③未选中字重 500→**400**（选中仍 600）：字重差本身就是选中信号，两边都粗整条偏重。④同名标签不再画角标数字，只留 `title` 注明来源（角标会顶到轨道上沿，设计稿里没有）。⑤`--dsw-radius-lg/-md` 补 16/12 兜底，令牌缺失时圆角不再整个掉成 0。夹具补 4 条断言（字重 600/400、无角标、轨道高 42、段宽 57.6），30 项全过。
- **v0.9.6 修隐藏/折叠时滑轨宽度被写成 0**：矩形全 0（面板收起、会话隐藏）时跳过这一帧的绘制，并在字体就绪后重算字宽。
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
| 16 | **视图标签 → 分段控件（看得见）** | 下划线式：5 个文字标签、`gap:32px`、选中项靠 `:after` 2px 主色条 | **先量后画 + 分段控件**：装得下才改成分段（轨道高 42 = 标签 34 + inset 4×2、段宽 = 自然宽等分 57.6、选中块 radius-md + 0.5px 描边浮起并 180ms 滑轨跟随、未选 400 / 选中 600），装不下就整条退回原样（v0.9.0 重写、v0.9.2 规格、v0.9.7 对齐设计稿） | HIG：macOS 里同级视图切换用 **segmented control**；只动样式，`role`/`aria-selected`/键盘导航全部保留 |
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

| 22 | **会话树拖拽时的反馈（看得见）** | 宿主 `dsh-client-ui-workspace` 已实现完整拖拽：行上 `draggable`、`useRowDragPreview` 克隆整行后 `setDragImage`、`dragover` 用 `rowHalf(e)` 决定 before/after、`drop` 走 `commitSessionDrag → sessionDragOrder → setSessionOrder`（全仓唯一写入方）。唯一的空白是「被拿起的源行没有任何视觉变化」，拖影也缺圆角与阴影 | 只做两件装饰：`dragstart`（capture，只读）给源行打 `data-ahig-src="1"` 压到 45% 不透明，`dragend`/`drop` 清掉；宿主生成的拖影克隆体（`[class*="_dragPreview"]`）补 `--dsw-radius-md` 圆角与 `--dsw-elevation-panel` 阴影。**不接管** `dataTransfer` / `preventDefault` / `setDragImage`，也不隐藏源行（隐藏会中止原生拖拽） | HIG Motion：直接操纵的物体要有拿起感；HIG Layout：让落点可预览——但这两件事的**几何**归宿主，表现层不重复实现。v0.10.1 起可选「浮卡」（默认关）：透明 `setDragImage` + 自绘 fixed 卡片跟手 |
| 23 | **不碰宿主的拖拽状态机** | 宿主在 `dragover` 里 `drag.hover(rowHalf(e))`、在 `drop` 里提交，中间会重渲染行；插件若在 capture 阶段 `preventDefault` 或 `setDragImage`，就会和宿主同场竞争（同场两次调用谁生效是浏览器实现细节），而隐藏源行等于让 Chromium 判定拖拽被取消 | 三个监听全部只读：不 `preventDefault`、不写 `dataTransfer`、不改行几何、不隐藏源行；只在 `dragstart` 打属性、`dragend`/`drop` 清理。属性用 `data-ahig-src` 而不是 `data-ahig-ph`，与旧引擎的类名彻底断开 | 一条横向约束：**状态机只能有一个主人**——拖拽的提交权在宿主，表现层只加不抢 |

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
| 标签条去重（看得见） | 开 | 宿主重复注册同一视图时的兜底：隐藏后出现的同文案标签，重复消失自动还原 |
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
| 拖拽时的视觉反馈 | 开 | 第 22、23 项（源行 45% 淡出 + 宿主拖影补圆角阴影；落点与顺序全归宿主） |
| 浮卡跟手（实验） | 关 | 第 22 项的可选形态：透明 `setDragImage` + 自绘 fixed 卡片跟手（多接管一步 `setDragImage`，默认不开） |
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
