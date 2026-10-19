import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

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
})
