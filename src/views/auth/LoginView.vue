<script setup lang="ts">
import { useRouter } from 'vue-router'

/**
 * 登录页 —— **保留的空壳**。
 *
 * 后端 `AuthFilter` 给每个请求无条件写入 principal = 1，没有登录接口，
 * 所以这里不做任何请求：点「进入工作台」直接放行。
 * 保留页面是为了后端接上鉴权后不用重建路由与版式。
 */
const router = useRouter()

function enter(): void {
  void router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="login-page">
    <section class="login-card">
      <span class="login-card__mark">错</span>
      <h1 class="login-card__title">错题本</h1>
      <p class="login-card__desc">
        当前后端为 demo 阶段：没有登录接口，所有请求由服务端固定为同一个学生身份。
        这里先保留入口，等接上鉴权后再补表单。
      </p>

      <button class="btn btn--primary login-card__submit" type="button" @click="enter">
        进入工作台
      </button>

      <p class="login-card__hint">不需要账号密码，直接进。</p>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 24px;
  background: var(--bg-app);
}

.login-card {
  width: 100%;
  max-width: 380px;
  padding: 28px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.login-card__mark {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-inverse);
  background: var(--accent);
}

.login-card__title {
  margin-top: 12px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-primary);
}

.login-card__desc {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-secondary);
}

.login-card__submit {
  width: 100%;
  height: 36px;
  margin-top: 20px;
}

.login-card__hint {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--text-muted);
}
</style>
