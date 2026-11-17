import type { IconName } from '@/components/common/icons'

/**
 * 扩展 vue-router 的 RouteMeta，让 route.meta 在模板和脚本里都有类型提示。
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题：用于 document.title */
    title?: string
    /** 导航图标（仅侧栏项使用） */
    icon?: IconName
  }
}

export {}
