/**
 * 站点配置的类型定义。
 *
 * 只放「需要持久化、且多个模块共用」的设置；主题、侧栏收起这类纯 UI 偏好
 * 仍留在各自的 composable 里，避免一个 cookie 承担所有状态。
 */
export interface SiteConfig {
  /**
   * 后端接口地址。
   * 留空表示与站点同源（相对路径请求），也是默认值。
   */
  apiBaseUrl: string
}

/** 会写进 cookie 的字段。当前与 SiteConfig 一致，独立出来便于以后加只读字段。 */
export type PersistedConfig = SiteConfig

/**
 * 配置的来源：
 * - `own`：本项目自己的 cookie（`console-settings`）里有有效内容；
 * - `inherited`：自己的 cookie 没有设置内容，从父项目的 cookie（`windy-settings`）继承；
 * - `default`：两处都没有，使用内置默认值。
 */
export type ConfigSource = 'own' | 'inherited' | 'default'
