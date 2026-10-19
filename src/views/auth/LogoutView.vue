<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthCard from '@/components/common/AuthCard.vue'
import { logout } from '@/api/auth'

const router = useRouter()
const submitting = ref(false)

async function handleSubmit(): Promise<void> {
  submitting.value = true

  try {
    // 只尝试通知后端、不校验结果；本地会话在 logout() 里无条件清除。
    await logout()
    await router.push({ name: 'dashboard' })
  } catch {
    // 退出本身不会失败（后端结果已被 logout() 吞掉），这里只兜底导航异常。
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <AuthCard title="退出登录" hint="退出接口已按后端契约接好，服务端尚未就绪。">
      <p class="auth-note">
        点击按钮会带着当前的 <code>Authorization: Bearer</code> 令牌请求
        <code>GET /logout</code>。这里<strong>只尝试通知后端、不校验结果</strong>：
        无论服务端返回成功还是失败，本地会话都会被清除。
      </p>

      <form class="auth-form" novalidate @submit.prevent="handleSubmit">
        <button class="auth-submit" type="submit" :disabled="submitting">
          {{ submitting ? '退出中…' : '退出登录' }}
        </button>
      </form>

      <template #footer>
        暂时不想退出？<RouterLink class="auth-link" :to="{ name: 'dashboard' }">返回控制台</RouterLink>
      </template>
    </AuthCard>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  padding: 32px 0 48px;
}
</style>
