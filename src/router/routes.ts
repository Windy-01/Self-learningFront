import type { RouteRecordRaw } from 'vue-router'
import AdminLayout from '@/layouts/AdminLayout.vue'

/**
 * 路由表。
 *
 * 约定：
 * - 布局只实例化一次，业务页面作为子路由渲染在 `<RouterView>` 里；
 * - 页面组件一律懒加载，首屏只加载布局与当前页；
 * - 导航项在 `nav.ts` 里单独维护（顺序与分组是产品决策，不塞进 meta）。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: AdminLayout,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '工作台' },
      },
      {
        path: 'questions',
        name: 'questions',
        component: () => import('@/views/questions/QuestionListView.vue'),
        meta: { title: '题库' },
      },
      {
        path: 'questions/:id(\\d+)',
        name: 'question-detail',
        component: () => import('@/views/questions/QuestionDetailView.vue'),
        meta: { title: '题目详情' },
      },
      {
        path: 'capture',
        name: 'capture',
        component: () => import('@/views/capture/CaptureView.vue'),
        meta: { title: '录入题目' },
      },
      {
        path: 'review',
        name: 'review',
        component: () => import('@/views/review/ReviewListView.vue'),
        meta: { title: '复习卷' },
      },
      {
        path: 'review/new',
        name: 'review-new',
        component: () => import('@/views/review/ReviewCreateView.vue'),
        meta: { title: '生成复习卷' },
      },
      {
        path: 'review/:id(\\d+)',
        name: 'review-detail',
        component: () => import('@/views/review/ReviewDetailView.vue'),
        meta: { title: '复习卷' },
      },
      {
        path: 'analysis',
        name: 'analysis',
        component: () => import('@/views/analysis/AnalysisView.vue'),
        meta: { title: '学情分析' },
      },
      {
        path: 'organize',
        name: 'organize',
        component: () => import('@/views/organize/OrganizeView.vue'),
        meta: { title: '整理' },
      },
      {
        path: ':pathMatch(.*)*',
        redirect: { name: 'dashboard' },
      },
    ],
  },
]
