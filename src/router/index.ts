import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'

const APP_TITLE = '错题本'

/**
 * history 模式：地址不带 `#`。
 *
 * `BASE_URL` 由 vite 注入（本地 `/`，GitHub Pages 项目页为 `/Self-learningFront/`），
 * 保证子路径部署时路由前缀自动正确。
 *
 * ⚠️ 静态托管没有服务端 rewrite，刷新 `/questions` 会 404 ——
 * 部署流程里把 `index.html` 复制成 `404.html` 兜底。
 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * 全局前置守卫只做一件事：维护页面标题。
 *
 * 没有登录拦截 —— 后端 `AuthFilter` 把 principal 固定为 1，
 * 任何请求都通过，前端再拦一道只会造出「登不进去也用不了」的死路。
 */
router.beforeEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_TITLE}` : APP_TITLE

  return true
})

export default router
