import type { RouteRecordRaw } from 'vue-router'

/**
 * 业务页面路由（AdminLayout 的子路由）。
 *
 * 约定：
 * - 页面组件一律懒加载，首屏只加载布局与当前页；
 * - meta.menu = true 的页面会自动出现在顶部导航，无需再单独维护菜单；
 * - meta.group 决定归入哪个导航分组，meta.icon 决定图标；
 * - 主流程的顺序与 `config/flow.ts` 保持一致。
 */
export const pageRoutes: RouteRecordRaw[] = [
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: {
      title: '主页',
      group: '导航',
      icon: 'dashboard',
      menu: true,
    },
  },

  /* ---------- 主流程：拍照 → 识别 → 标签 → 题库 → 复习 ---------- */
  {
    path: '/capture',
    name: 'capture',
    component: () => import('@/views/capture/CaptureView.vue'),
    meta: {
      title: '拍照上传',
      group: '学习流程',
      icon: 'camera',
      menu: true,
    },
  },
  {
    path: '/questions/edit',
    name: 'question-edit',
    component: () => import('@/views/questions/QuestionEditView.vue'),
    meta: {
      title: '题目编辑',
      group: '学习流程',
      icon: 'edit',
      menu: true,
    },
  },
  {
    path: '/tags',
    name: 'tags',
    component: () => import('@/views/tags/TagManageView.vue'),
    meta: {
      title: '标签管理',
      group: '学习流程',
      icon: 'tag',
      menu: true,
    },
  },
  {
    path: '/questions',
    name: 'questions',
    component: () => import('@/views/questions/QuestionManageView.vue'),
    meta: {
      title: '题目管理',
      group: '学习流程',
      icon: 'layers',
      menu: true,
    },
  },
  {
    path: '/review',
    name: 'review',
    component: () => import('@/views/review/ReviewView.vue'),
    meta: {
      title: '复习卷',
      group: '学习流程',
      icon: 'fileText',
      menu: true,
    },
  },

  /* ---------- 学习分析 ---------- */
  {
    path: '/stats',
    name: 'stats',
    component: () => import('@/views/stats/StatsView.vue'),
    meta: {
      title: '掌握统计',
      group: '学习分析',
      icon: 'target',
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
