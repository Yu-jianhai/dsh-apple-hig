/**
 * dsh-apple-hig — 宿主半边。
 *
 * 这个插件是纯客户端 UI（`dsh.client.platform = "web"`）：所有逻辑都在
 * `lib/client.js` 里 —— 通过官方 `theme.overrideTokens()` 覆盖设计 token，
 * 通过注入一段样式表处理 token 表达不了的部分（状态栏、动效偏好、圆角形状），
 * 再在 `settings.section` 里提供逐项开关。
 *
 * 宿主这边故意什么都不做：
 *   1. bundle 的 patch 需要一条可加载的入口（`name: dsh-apple-hig`）；
 *   2. 让 web 端能按包名解析到 `./client` 导出，从而加载 `lib/client.js`。
 *
 * 不注册工具、不开路由、不读写任何文件，所以卸载后宿主侧零残留；
 * 客户端侧的所有 token 层都由 disposer 回收，卸载即回到 DSH 原样。
 */

export const name = 'dsh-apple-hig'

export function apply() {
  /* client-only plugin: see lib/client.js */
}
