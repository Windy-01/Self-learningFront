<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useMenuGroups } from '@/router/menu'
import { useTheme } from '@/composables/useTheme'
import { useAccount } from '@/composables/useAccount'
import { loggedIn } from '@/api/session'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const { accountLabel, displayName, avatarInitial, currentUser } = useAccount()

/* ---------- 顶部主导航：由路由 meta 推导 ---------- */
const menuGroups = useMenuGroups()
const navItems = computed(() => menuGroups.value.flatMap((group) => group.items))

/* ---------- 全局搜索（当前仅匹配导航项，后续可接后端检索） ---------- */
const keyword = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const searchResults = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return []
  return navItems.value.filter((item) => item.title.toLowerCase().includes(kw)).slice(0, 5)
})

function goSearch(name: string): void {
  keyword.value = ''
  searchInput.value?.blur()
  router.push({ name })
}

/* ---------- 用户菜单 ---------- */
const isUserMenuOpen = ref(false)
const userAreaRef = ref<HTMLElement | null>(null)

function toggleUserMenu(): void {
  isUserMenuOpen.value = !isUserMenuOpen.value
}

function closeUserMenu(): void {
  isUserMenuOpen.value = false
}

/** 点到用户区之外就收起菜单；点在按钮上时不收，交给 toggle 处理。 */
function closeUserMenuOnOutsideClick(event: MouseEvent): void {
  if (!isUserMenuOpen.value) return

  const target = event.target
  if (target instanceof Node && userAreaRef.value?.contains(target)) return

  closeUserMenu()
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }

  if (event.key === 'Escape') {
    searchInput.value?.blur()
    closeUserMenu()
  }
}

/* ---------- 刷新按钮的旋转反馈 ---------- */
const refreshing = ref(false)
function refresh(): void {
  if (refreshing.value) return
  refreshing.value = true
  window.setTimeout(() => (refreshing.value = false), 700)
}

// 路由一变就收起用户菜单，避免菜单挂在旧页面上
watch(
  () => route.fullPath,
  () => closeUserMenu(),
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', closeUserMenuOnOutsideClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', closeUserMenuOnOutsideClick)
})
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink class="brand" :to="{ name: 'dashboard' }">
        <span class="brand__logo">
          <AppIcon name="terminal" :size="16" :stroke-width="2.2" />
        </span>
        <span class="brand__name">Learning Hub</span>
      </RouterLink>

      <!-- 顶部横向导航：与参考站点一致，居中排布 -->
      <nav class="top-nav" aria-label="主导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          class="top-nav__link"
          :class="{ 'is-active': route.name === item.name }"
          :to="{ name: item.name }"
        >
          {{ item.title }}
        </RouterLink>
      </nav>

      <div class="app-header__actions">
        <div class="search">
          <AppIcon name="search" :size="15" class="search__icon" />
          <input
            ref="searchInput"
            v-model="keyword"
            class="search__input"
            type="text"
            placeholder="搜索页面"
            @keydown.enter="searchResults[0] && goSearch(searchResults[0].name)"
          />
          <kbd class="search__kbd">Ctrl K</kbd>

          <ul v-if="keyword && searchResults.length" class="search__panel">
            <li v-for="item in searchResults" :key="item.name">
              <RouterLink :to="{ name: item.name }" class="search__item" @click="keyword = ''">
                <AppIcon :name="item.icon" :size="15" />
                <span>{{ item.title }}</span>
                <code>{{ item.path }}</code>
              </RouterLink>
            </li>
          </ul>
          <p v-else-if="keyword" class="search__panel search__empty">没有匹配的页面</p>
        </div>

        <button
          class="icon-btn"
          type="button"
          :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
          @click="toggleTheme"
        >
          <AppIcon :name="isDark ? 'sun' : 'moon'" :size="17" />
        </button>

        <button class="icon-btn" type="button" title="刷新当前页" @click="refresh">
          <AppIcon name="refresh" :size="17" :class="{ 'is-spinning': refreshing }" />
        </button>

        <span class="app-header__divider"></span>

        <div ref="userAreaRef" class="user">
          <button
            class="user-chip"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="isUserMenuOpen"
            @click="toggleUserMenu"
          >
            <span class="user-chip__avatar">
              <img
                v-if="currentUser?.avatar"
                :src="currentUser.avatar"
                alt=""
                decoding="async"
              />
              <template v-else-if="avatarInitial">{{ avatarInitial }}</template>
              <AppIcon v-else name="user" :size="14" />
            </span>
            <span class="user-chip__name">{{ displayName }}</span>
            <AppIcon name="chevronDown" :size="14" class="user-chip__arrow" />
          </button>

          <Transition name="user-menu">
            <ul v-if="isUserMenuOpen" class="user-menu" role="menu">
              <li v-if="loggedIn && accountLabel" class="user-menu__account">
                <span class="user-menu__account-name">{{ accountLabel }}</span>
                <span class="user-menu__account-note">本地记录 · 资料接口未接入</span>
              </li>

              <template v-if="loggedIn">
                <li>
                  <RouterLink
                    class="user-menu__item"
                    role="menuitem"
                    :to="{ name: 'logout' }"
                    @click="closeUserMenu"
                  >
                    退出登录
                  </RouterLink>
                </li>
              </template>
              <template v-else>
                <li>
                  <RouterLink
                    class="user-menu__item"
                    role="menuitem"
                    :to="{ name: 'login' }"
                    @click="closeUserMenu"
                  >
                    登录
                  </RouterLink>
                </li>
                <li>
                  <RouterLink
                    class="user-menu__item"
                    role="menuitem"
                    :to="{ name: 'register' }"
                    @click="closeUserMenu"
                  >
                    注册
                  </RouterLink>
                </li>
              </template>
            </ul>
          </Transition>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 20;
  height: var(--header-height);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-header);
  backdrop-filter: blur(12px);
}

.app-header__inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
  padding: 0 24px;
}

/* ---------- 品牌 ---------- */
.brand {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border-radius: var(--radius-md);
  transition: background var(--duration) var(--ease);
}

.brand:hover {
  background: var(--bg-surface-hover);
}

.brand__logo {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  color: var(--text-inverse);
  background: var(--accent);
}

.brand__name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.1px;
  color: var(--text-primary);
  white-space: nowrap;
}

/* ---------- 顶部导航 ---------- */
.top-nav {
  position: absolute;
  left: 50%;
  display: flex;
  height: 100%;
  transform: translateX(-50%);
}

.top-nav__link {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 18px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  transition: color var(--duration) var(--ease);
}

.top-nav__link::after {
  content: '';
  position: absolute;
  right: 18px;
  bottom: 0;
  left: 18px;
  height: 2px;
  background: transparent;
  transition: background var(--duration) var(--ease);
}

.top-nav__link:hover {
  color: var(--text-primary);
}

.top-nav__link.is-active {
  color: var(--text-primary);
}

.top-nav__link.is-active::after {
  background: var(--accent);
}

/* ---------- 右侧动作区 ---------- */
.app-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease),
    border-color var(--duration) var(--ease);
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
  border-color: var(--border-color);
}

.is-spinning {
  animation: spin 0.7s var(--ease);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- 搜索 ---------- */
.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 220px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  transition:
    border-color var(--duration) var(--ease),
    box-shadow var(--duration) var(--ease);
}

.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search__icon {
  color: var(--text-muted);
}

.search__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 12.5px;
  background: transparent;
}

.search__input::placeholder {
  color: var(--text-muted);
}

.search__kbd {
  flex: none;
  padding: 1px 5px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-surface-hover);
}

.search__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 100%;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.search__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  color: var(--text-secondary);
}

.search__item:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.search__item span {
  flex: 1;
}

.search__item code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-muted);
}

.search__empty {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

/* ---------- 用户 ---------- */
.app-header__divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--border-color);
}

.user {
  position: relative;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 8px 0 4px;
  border-radius: var(--radius-md);
  transition: background var(--duration) var(--ease);
}

.user-chip:hover {
  background: var(--bg-surface-hover);
}

.user-chip__avatar {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  overflow: hidden;
  border-radius: var(--radius-full);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-inverse);
  background: var(--accent);
}

.user-chip__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-chip__name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.user-chip__arrow {
  color: var(--text-muted);
}

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  display: grid;
  min-width: 190px;
  max-width: 260px;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.user-menu__account {
  display: grid;
  gap: 2px;
  margin-bottom: 4px;
  padding: 7px 10px 9px;
  border-bottom: 1px solid var(--border-color);
}

.user-menu__account-name {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__account-note {
  font-size: 11px;
  color: var(--text-muted);
}

.user-menu__item {
  display: block;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease);
}

.user-menu__item:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.user-menu-enter-active,
.user-menu-leave-active {
  transition:
    opacity 0.15s var(--ease),
    transform 0.15s var(--ease);
}

.user-menu-enter-from,
.user-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 1100px) {
  .search {
    display: none;
  }
}

@media (max-width: 768px) {
  .app-header__inner {
    padding: 0 16px;
  }

  .brand__name,
  .app-header__divider,
  .user-chip__name {
    display: none;
  }

  .top-nav__link {
    padding: 0 12px;
  }

  .top-nav__link::after {
    right: 12px;
    left: 12px;
  }
}
</style>
