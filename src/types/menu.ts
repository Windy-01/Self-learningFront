import type { IconName } from '@/components/common/icons'

/** 单个导航项：由路由 meta 推导而来，不手工维护 */
export interface MenuItem {
  /** 路由地址，用于展示 */
  path: string
  /** 路由名称，跳转时优先用 name，避免硬编码 URL */
  name: string
  title: string
  icon: IconName
}

/** 导航分组 */
export interface MenuGroup {
  title: string
  items: MenuItem[]
}
