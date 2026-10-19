import type { IconName } from '@/components/common/icons'

/**
 * 扩展 vue-router 的 RouteMeta，让 route.meta 在模板和脚本里都有类型提示。
 * 新增 meta 字段时在这里补充即可。
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题：用于 document.title 与面包屑 */
    title?: string
    /** 所属导航分组，决定菜单归组 */
    group?: string
    /** 导航图标 */
    icon?: IconName
    /** 是否在侧边导航中展示，默认不展示 */
    menu?: boolean
  }
}

export {}
