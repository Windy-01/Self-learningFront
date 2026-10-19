import { computed } from 'vue'
import { pageRoutes } from './pages'
import type { MenuGroup, MenuItem } from '@/types/menu'

/** 从路由表推导导航分组：菜单与路由只有一处数据源，不会出现两处不一致 */
function buildMenuGroups(): MenuGroup[] {
  const groups = new Map<string, MenuItem[]>()

  for (const record of pageRoutes) {
    const { meta, name } = record
    if (!meta?.menu || !meta.title || !meta.icon || !name) continue

    const groupTitle = meta.group ?? '导航'
    const items = groups.get(groupTitle) ?? []

    items.push({
      path: record.path,
      name: String(name),
      title: meta.title,
      icon: meta.icon,
    })
    groups.set(groupTitle, items)
  }

  return [...groups].map(([title, items]) => ({ title, items }))
}

export function useMenuGroups() {
  return computed(buildMenuGroups)
}
