import type { RouteRecordRaw } from 'vue-router'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { pageRoutes } from './pages'

/**
 * 根路由：布局只实例化一次，业务页面作为子路由渲染在 <RouterView> 中。
 * 布局组件保持同步引入（首屏必需），页面组件在 pages.ts 中懒加载。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AdminLayout,
    redirect: { name: 'dashboard' },
    children: [
      ...pageRoutes,
      // 未实现的路径统一回到主页，避免出现空白路由
      {
        path: '/:pathMatch(.*)*',
        redirect: { name: 'dashboard' },
      },
    ],
  },
]
