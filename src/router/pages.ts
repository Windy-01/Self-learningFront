import type { RouteRecordRaw } from 'vue-router'

/**
 * 业务页面路由（AdminLayout 的子路由）。
 *
 * 约定：
 * - 页面组件一律懒加载，首屏只加载布局与当前页；
 * - meta.menu = true 的页面会自动出现在顶部导航，无需再单独维护菜单；
 * - meta.group 决定归入哪个导航分组，meta.icon 决定图标。
 */
export const pageRoutes: RouteRecordRaw[] = [
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: {
      title: '控制台主页',
      group: '导航',
      icon: 'dashboard',
      menu: true,
    },
  },

  /* ---------- 账号 ---------- */
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { title: '注册' },
  },
  {
    path: '/logout',
    name: 'logout',
    component: () => import('@/views/auth/LogoutView.vue'),
    meta: { title: '退出登录' },
  },
]
