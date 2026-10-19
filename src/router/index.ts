import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '@/api/session'
import { routes } from './routes'

const APP_TITLE = '学习控制台'

/**
 * history 模式：地址不带 `#`，与站点其它页面风格一致。
 *
 * `BASE_URL` 由 vite 注入（本地 `/`，GitHub Pages 项目页为 `/Self-learningFront/`），
 * 保证子路径部署时路由前缀自动正确。
 *
 * ⚠️ 静态托管没有服务端 rewrite，刷新 `/dashboard` 会 404 ——
 * 部署流程里把 `index.html` 复制成 `404.html` 兜底（见 .github/workflows/deploy.yml），
 * 页面加载后由路由按真实地址解析回对应页面。
 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // 页面滚动交给窗口，切页后回到顶部
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * 全局前置守卫：
 * 1. 统一维护页面标题，页面里不要再各自写 document.title；
 * 2. 需要登录态的入口做拦截。
 */
router.beforeEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_TITLE}` : APP_TITLE

  // 未登录时点「退出登录」没有意义，直接引导去登录页。
  if (to.name === 'logout' && !isLoggedIn()) {
    return { name: 'login' }
  }

  return true
})

export default router
