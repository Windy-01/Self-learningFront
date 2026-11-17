<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useTheme } from '@/composables/useTheme'
import { useConfig } from '@/config'
import { navAlias, primaryNav, secondaryNav } from '@/router/nav'

/**
 * 顶栏：品牌 + 主导航 + 全局主行动 + 主题 + 设置。
 *
 * 导航放顶栏而不是侧栏：本站只有 5 个目的地，一层就放得下。
 * 侧栏 240px 宽，为了 5 个链接长期占掉 17% 的横向空间，不划算。
 *
 * 仍然不放搜索（搜索只对题库有意义，题库页自己有），
 * 不放「已登录」之类后端根本没有的东西。
 */
const emit = defineEmits<{ (e: 'open-settings'): void }>()

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const { config } = useConfig()

/** 详情页要把所属的一级导航点亮。 */
const activeName = computed(() => {
  const name = String(route.name ?? '')

  return navAlias[name] ?? name
})

/** 接口地址原本在侧栏底部，侧栏没了就挂到设置按钮的 title 上，不额外占地方。 */
const settingsTitle = computed(() => `设置 · 接口 ${config.apiBaseUrl || '与站点同源'}`)

function goCapture(): void {
  void router.push({ name: 'capture' })
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink class="brand" :to="{ name: 'dashboard' }">
        <span class="brand__mark">错</span>
        <span class="brand__name">错题本</span>
      </RouterLink>

      <nav class="header-nav" aria-label="主导航">
        <RouterLink
          v-for="item in primaryNav"
          :key="item.name"
          class="header-nav__item"
          :class="{ 'is-active': activeName === item.name }"
          :to="{ name: item.name }"
          :title="item.label"
          :aria-label="item.label"
        >
          <AppIcon :name="item.icon" :size="15" />
          <span class="header-nav__text">{{ item.label }}</span>
        </RouterLink>

        <span class="header-nav__divider" aria-hidden="true" />

        <RouterLink
          v-for="item in secondaryNav"
          :key="item.name"
          class="header-nav__item"
          :class="{ 'is-active': activeName === item.name }"
          :to="{ name: item.name }"
          :title="item.label"
          :aria-label="item.label"
        >
          <AppIcon :name="item.icon" :size="15" />
          <span class="header-nav__text">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="app-header__actions">
        <button class="btn btn--sm btn--primary capture-btn" type="button" title="录入题目" @click="goCapture">
          <AppIcon name="plus" :size="14" :stroke-width="2.2" />
          <span class="capture-btn__text">录入题目</span>
        </button>

        <button
          class="icon-btn"
          type="button"
          :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
          :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
          @click="toggleTheme"
        >
          <AppIcon :name="isDark ? 'sun' : 'moon'" :size="16" />
        </button>

        <button
          class="icon-btn"
          type="button"
          :title="settingsTitle"
          aria-label="设置"
          @click="emit('open-settings')"
        >
          <AppIcon name="settings" :size="16" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 40;
  height: var(--header-height);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-header);
  backdrop-filter: blur(8px);
}

.app-header__inner {
  display: flex;
  align-items: center;
  gap: 22px;
  height: 100%;
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: 0 24px;
}

.brand {
  display: flex;
  flex: none;
  align-items: center;
  gap: 9px;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-md);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-inverse);
  background: var(--accent);
}

.brand__name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

/* ---------- 导航 ---------- */
.header-nav {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.header-nav__item {
  display: flex;
  flex: none;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease);
}

.header-nav__item:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.header-nav__item.is-active {
  color: var(--text-primary);
  font-weight: 600;
  background: var(--accent-soft);
}

.header-nav__divider {
  flex: none;
  width: 1px;
  height: 16px;
  margin: 0 6px;
  background: var(--border-color);
}

/* ---------- 右侧动作 ---------- */
.app-header__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease);
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

/* ---------- 收窄：导航退化为图标 ---------- */
@media (max-width: 900px) {
  .app-header__inner {
    gap: 12px;
    padding: 0 16px;
  }

  .header-nav__text {
    display: none;
  }

  .header-nav__item {
    justify-content: center;
    gap: 0;
    width: 34px;
    padding: 0;
  }

  .header-nav__divider {
    margin: 0 4px;
  }
}

@media (max-width: 560px) {
  .app-header__inner {
    gap: 8px;
    padding: 0 12px;
  }

  .header-nav__item {
    width: 32px;
  }

  .brand__name {
    display: none;
  }

  .capture-btn__text {
    display: none;
  }

  .capture-btn {
    width: 28px;
    padding: 0;
  }
}

/* 极窄（<380px）：导航改成横向滚动，宁可少看一项，也不要整页横向溢出 */
@media (max-width: 380px) {
  .header-nav {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .header-nav::-webkit-scrollbar {
    display: none;
  }
}
</style>
