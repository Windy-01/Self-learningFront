<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useTheme } from '@/composables/useTheme'
import { useAccount } from '@/composables/useAccount'
import { loggedIn } from '@/api/session'

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void; (e: 'open-settings'): void }>()

const { isDark, toggleTheme } = useTheme()
const { accountLabel, displayName, avatarInitial } = useAccount()
</script>

<template>
  <aside class="aside" :class="{ 'aside--collapsed': collapsed }">
    <div class="aside__head">
      <button
        class="aside__toggle"
        type="button"
        :title="collapsed ? '展开侧栏' : '收起侧栏'"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        @click="emit('toggle')"
      >
        <AppIcon :name="collapsed ? 'chevronsRight' : 'chevronsLeft'" :size="14" />
      </button>
    </div>

    <div class="aside__account">
      <span class="aside__avatar">
        <template v-if="avatarInitial">{{ avatarInitial }}</template>
        <AppIcon v-else name="user" :size="14" />
      </span>
      <div class="aside__account-meta">
        <strong>{{ displayName }}</strong>
        <span>{{ loggedIn ? accountLabel || '已登录' : '未登录' }}</span>
      </div>
    </div>

    <nav class="aside__nav">
      <RouterLink
        v-if="!loggedIn"
        class="aside__action"
        :to="{ name: 'login' }"
        title="登录 / 注册"
      >
        <AppIcon name="user" :size="16" />
        <span class="aside__action-text">登录 / 注册</span>
      </RouterLink>
      <RouterLink
        v-else
        class="aside__action"
        :to="{ name: 'logout' }"
        title="退出登录"
      >
        <AppIcon name="logout" :size="16" />
        <span class="aside__action-text">退出登录</span>
      </RouterLink>

      <button
        class="aside__action"
        type="button"
        :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
        @click="toggleTheme"
      >
        <AppIcon :name="isDark ? 'sun' : 'moon'" :size="16" />
        <span class="aside__action-text">{{ isDark ? '浅色模式' : '深色模式' }}</span>
      </button>

      <button class="aside__action" type="button" title="设置" @click="emit('open-settings')">
        <AppIcon name="settings" :size="16" />
        <span class="aside__action-text">设置</span>
      </button>
    </nav>
  </aside>
</template>

<style scoped>
/**
 * 浮动侧栏：不占满屏幕高度，随页面滚动吸附在顶栏下方，
 * 和参考站点一样是一张「悬浮卡片」，而不是整列贴边的导航条。
 */
.aside {
  position: sticky;
  top: calc(var(--header-height) + 24px);
  flex: none;
  width: var(--aside-width);
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  transition: width var(--duration) var(--ease);
}

.aside__head {
  display: flex;
  justify-content: flex-end;
}

.aside__toggle {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease);
}

.aside__toggle:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

/* ---------- 账号 ---------- */
.aside__account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius-md);
}

.aside__avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-inverse);
  background: var(--accent);
}

.aside__account-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
  white-space: nowrap;
}

.aside__account-meta strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  text-overflow: ellipsis;
}

.aside__account-meta span {
  overflow: hidden;
  font-size: 11px;
  color: var(--text-muted);
  text-overflow: ellipsis;
}

/* ---------- 动作 ---------- */
.aside__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.aside__action {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 8px;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease);
}

.aside__action:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.aside__action-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 收起态 ---------- */
.aside--collapsed {
  width: var(--aside-width-collapsed);
  padding: 8px;
}

.aside--collapsed .aside__head {
  justify-content: center;
}

.aside--collapsed .aside__account {
  justify-content: center;
  padding: 8px 0;
}

.aside--collapsed .aside__account-meta,
.aside--collapsed .aside__action-text {
  display: none;
}

.aside--collapsed .aside__action {
  justify-content: center;
  gap: 0;
  padding: 0;
}

@media (max-width: 900px) {
  .aside {
    display: none;
  }
}
</style>
