<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import SettingsDialog from '@/components/common/SettingsDialog.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

/**
 * 布局骨架：固定顶栏 + 单列主内容。
 *
 * 导航全部在顶栏里，所以主内容区不再分栏 ——
 * 页面宽度只有一处约束（`.admin-main` 的 max-width），
 * 页面自己不用再算「我旁边还有 240px 侧栏」。
 */

/** 设置弹窗：配置读写见 `config/` */
const isSettingsOpen = ref(false)
</script>

<template>
  <div class="admin-layout">
    <AppHeader @open-settings="isSettingsOpen = true" />

    <main class="admin-main">
      <RouterView v-slot="{ Component, route }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </main>

    <SettingsDialog :open="isSettingsOpen" @close="isSettingsOpen = false" />

    <!-- 全局反馈：任何页面 push 的提示与确认都从这里出 -->
    <ToastHost />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100dvh;
  background: var(--bg-app);
}

/**
 * 顶栏是 fixed 的，这里用 padding-top 让出高度；页面滚动交给窗口。
 */
.admin-main {
  width: 100%;
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: calc(var(--header-height) + 24px) 24px 40px;
}

@media (max-width: 900px) {
  .admin-main {
    padding: calc(var(--header-height) + 16px) 16px 32px;
  }
}
</style>
