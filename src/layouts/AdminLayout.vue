<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import AppAside from './components/AppAside.vue'
import AppHeader from './components/AppHeader.vue'
import SettingsDialog from '@/components/common/SettingsDialog.vue'

const ASIDE_STORAGE_KEY = 'console-aside-collapsed'

/** 侧栏收起状态：用户手动切换后由 localStorage 记住 */
const collapsed = ref(window.localStorage.getItem(ASIDE_STORAGE_KEY) === 'true')

/** 设置弹窗：配置读写见 `config/` */
const isSettingsOpen = ref(false)

function toggleAside(): void {
  collapsed.value = !collapsed.value
  window.localStorage.setItem(ASIDE_STORAGE_KEY, String(collapsed.value))
}
</script>

<template>
  <div class="admin-layout">
    <AppHeader />

    <div class="admin-body">
      <AppAside
        :collapsed="collapsed"
        @toggle="toggleAside"
        @open-settings="isSettingsOpen = true"
      />

      <main class="admin-main">
        <RouterView v-slot="{ Component, route }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <SettingsDialog :open="isSettingsOpen" @close="isSettingsOpen = false" />
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100dvh;
  background: var(--bg-app);
}

/**
 * 顶栏是 fixed 的，这里用 padding-top 让出高度；
 * 页面滚动交给窗口，侧栏用 sticky 跟随，和参考站点一致。
 */
.admin-body {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  width: 100%;
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: calc(var(--header-height) + 24px) 24px 24px;
}

.admin-main {
  flex: 1;
  min-width: 0;
}

@media (max-width: 900px) {
  .admin-body {
    gap: 0;
    padding: calc(var(--header-height) + 16px) 16px 16px;
  }
}
</style>
