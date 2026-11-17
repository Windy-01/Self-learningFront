import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/** 开发期后端地址；用环境变量覆盖，避免把地址写死在配置里。 */
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 项目页部署在 https://<user>.github.io/<repo>/ 子路径下，
  // 因此构建时需要把 base 指向仓库名，否则 JS/CSS 会 404。
  // 本地 dev / 自定义域名场景下保持 '/'。
  base: process.env.GITHUB_ACTIONS ? '/Self-learningFront/' : '/',
  plugins: [vue()],
  resolve: {
    // 统一用 @ 指向 src，避免出现 ../../../ 之类的相对路径
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    /**
     * 开发期把 /api 代理到后端，前端就不需要配 CORS，
     * 设置里的「接口地址」留空（同源）即可。
     * 后端没开时，请求会得到 502 —— 页面会显示「连不上」而不是空白。
     */
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
})
