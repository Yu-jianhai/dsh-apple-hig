# 会话区拖拽引擎 · 职责与特性

> 适用范围：`lib/client.js` 里「会话区拖拽」这一档（v0.8.0 起为纯核心 + DOM 薄包装两层）。
> 这份文档回答两个问题：**这块代码负责什么、不负责什么**；**它对外表现出哪些特性**（每条都能在界面上验）。

## 1. 边界：只做表现层

| 事项 | 归谁 |
| --- | --- |
| 最终顺序的写入 | **宿主** `dsh-client-ui-workspace` 的 `setSessionOrder`（全仓唯一写入方） |
| 原生拖拽的发起/接收 | **宿主** 行的 `draggable` + `onDragStart/onDragOver/onDrop` |
| 只认同组、同 pinned 换位 | **宿主** `compatibleTarget`（我们照它的规则提前夹住落点） |
| 浮卡、灰块、让位、吸附 | **本插件** |
| 原生落点线 | **宿主**（我们不再盖掉它；灰块是额外的一层） |

因此有一条硬规则：**插件从不写顺序**。它只决定「这次松手要不要让宿主提交」——落点在本组内就放行，否则自己收场。

## 2. 一次拖拽的数据流

```
pointerdown ──► press 计数（探针）
dragstart   ──► begin()：量行、定分组、建浮卡+灰块、打标记
dragover    ──► over()：重量几何 → 算槽位 → 夹到本组 → 移动灰块 → 让位 → 跟手 → 自动滚动
drop        ──► 判定落点是否本组 → end(commit=true/false)
dragend     ──► end(commit=false)（已 drop 过则空转）
```

`end()` 的两条路径：

- **提交**：立刻清自己的位移（`transition:none`），把行交给宿主的 FLIP（200ms ease-out）去动；浮卡自己飞向灰块的实测矩形。
- **取消**：行用 180ms 滑回原位（不是瞬间弹回），浮卡飞回源行位置。

## 3. 特性清单（每条都能肉眼验）

### 3.1 浮卡（跟着指针的那一张）

| 特性 | 参数 | 备注 |
| --- | --- | --- |
| 尺寸等同源行 | 宽高取源行 rect | 不是内容宽，曾被退回一次 |
| 抬升 | 30px（`DRAG_LIFT`） | 让灰块不会被卡片完全盖住 |
| 侧栏内锁列 | 左边缘 = 源行左边缘 | 避免压住相邻行的字 |
| 拖出侧栏 | 横向自由跟手，夹在视口内 | 落点冻结在最后一次在栏内的位置 |
| 内容 | 行克隆，摘掉 `data-row-key`/按钮/`id`，并把继承的排版抄成内联 | 否则缩进变量丢失 → 文字左移 |
| 不糊 | 实底 `#31333a`，无 `backdrop-filter`/`scale`/`rotate` | 曾因模糊+缩放被退回 |

### 3.2 灰块（预览格）

| 特性 | 参数 |
| --- | --- |
| 三种形态 | `solid` 实块 / `dashed` 虚线空槽 / `ghost` 幽灵卡（含淡影文字） |
| 位置 | 槽位行顶（组内），组首/组末用 `slotTopIn` 特殊处理 |
| 过渡 | `transform 180ms cubic-bezier(.22,.8,.24,1)` |
| 越界提示 | 指针越过本组上下边界时 `opacity:.45` |
| 坐标系 | **全程 viewport**（`position:fixed` + `translate3d`），与浮卡同源 |

### 3.3 让位与吸附

| 特性 | 参数 |
| --- | --- |
| 让位 | 源→目标之间的行各移一格，180ms 同上曲线 |
| 吸附 | 轻回弹 `cubic-bezier(.34,1.22,.64,1)` / 无回弹 `cubic-bezier(.22,.8,.24,1)`，280ms |
| 吸附目标 | **量灰块此刻的 `getBoundingClientRect()`**，不按公式重算 |
| 取消 | 行滑回 180ms，卡片飞回源行 |
| 假拖拽 | 指针没动过就 dragend → 不播动画，静默收拾 |

### 3.4 分组（工作区）

- 组边界 = 宿主写有内联 `--dsh-workspace-indent` 的分组 section（或 class 含 `groupSection`）；
- 拿不到时退回「竖向间距 ≤ 1.5 倍行高」的连续性判定；
- 落点被夹在本组 `[first, last+1]`，**跨组不提交**（探针会写「落点不在本工作区」）。

### 3.5 其它

- 自动滚动：指针进入滚动容器上下 28px 内，`±12px/帧`；
- `prefers-reduced-motion`：所有时长压到 0.01ms；
- 诊断浮层（`probe`）：press/start/over/drop/end 计数、slot、分组、步长、灰块与浮卡的实测盒、异常、最近 6 条事件、一句话结论；
- `window.dshAppleHig.drag()` 返回当前状态快照，`window.dshAppleHig.core` 暴露纯核心。

## 4. 纯核心 API（`CORE`，无 DOM）

| 函数 | 输入 | 输出 | 用途 |
| --- | --- | --- | --- |
| `stepOf(rows)` | 行数组 | 步长（px） | 同组相邻间距中位数，跨组大空隙不算 |
| `slotAt(rows, y)` | 行数组、指针 y | 插入位下标 | 行中线为界 |
| `groupRange(rows, index, sameGroup?)` | 行数组、源下标、可选谓词 | `{first,last}` | 有谓词按宿主分组，无谓词按竖向连续性 |
| `clampSlot(raw, group, len)` | 原始槽位、组、行数 | 夹取后的槽位 | 组首…组末+1 |
| `slotTopIn(rows, slot, step, group)` | 槽位 | 灰块顶坐标 | 组首取行顶，组末后取末行底+补白 |
| `slotTop(rows, slot, step)` | 同上（无组） | 顶坐标 | 兼容路径 |
| `phRect(rows, sourceIndex, slot, step, group)` | — | `{top,left,width,height}` | 灰块/吸附目标 |
| `boundsOf(rows, edge)` | 行数组、外扩量 | `{left,right,top,bottom}` | 侧栏锚点 `display:contents`，只能用行拼 |
| `shiftOf(i, source, slot, step)` | 行下标等 | 该行位移 | 源行 0，区间内 ±step |

纯核心不含 DOM、不读全局，所以能被 `test/unit-drag-core.mjs` 直接断言。

## 5. 不变量（改代码时别破坏）

1. **源行不移动**：`shiftOf(source, …) === 0`；它只在「落点仍是原位」时显示 35% 淡影，
   一旦让位发生（`<html data-ahig-gap="1">`）必须真正隐藏，否则让位的行会压到它身上叠字。
2. **灰块与浮卡同一坐标系**（viewport），否则吸附落点必然错。
3. **提交前清位移、取消时滑回**：顺序不能反，否则同一行两套动画。
4. **落点只能落在本组**：`first ≤ slot ≤ last+1`；其中 `last+1` 表示「组末那一格」= **最后一行原来的格**，
   不是「末行底下」——按末行底算会落到组末的「展开其余 N 个会话」那一行上，把它的字盖住。
5. **克隆必须摘 `data-row-key`**：`dsh-session-progress` 靠它画进度带，否则灰块里会多一条。
6. **克隆必须抄继承样式**：`--dsh-workspace-indent`、padding、字体、颜色。
7. **不 `preventDefault` 原生事件**：宿主还要接这次拖拽。
8. **清理有代次守卫**：`rt.dragEpoch`，旧定时器不许动新拖拽的 DOM。

## 6. 测试三层

| 文件 | 层次 | 断言数 | 跑法 |
| --- | --- | --- | --- |
| `test/unit-drag-core.mjs` | 纯核心（数组进、数字出） | 32 | `npm run test:unit` |
| `test/run-drag-fixture.mjs` | 集成（无头 Edge + 真 `DragEvent` + 真 bundle） | 17 | `npm run test:drag` |
| `test/boot-smoke.mjs` | 插件生命周期（bundle/apply/卸载） | 全部 | `npm run test:boot` |

新增断言必须做**反向验证**：复制一份去掉补丁的副本跑出 FAIL，再删掉副本。

## 7. 已知边界

- 宿主在拖拽中重渲染会换掉行元素：靠 `data-row-key` 重新找回；找不回就整次放弃（不报错）。
- 跨工作区拖拽永远不提交（宿主也不接收），表现为卡片飞回源位。
- HTML5 拖拽在触屏上不触发，本层不支持触摸。
- 一级导航（插件/更多/…）的换序归 `dsh-sidebar-layout`，不在本文档范围内。
