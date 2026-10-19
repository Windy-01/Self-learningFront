import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'console-theme'
const root = document.documentElement

/**
 * 默认浅色（对齐 Kaggle 的白色基调）。
 * 初始值直接读 index.html 里预置的 data-theme，
 * 保证首屏渲染前主题就已确定，不会闪一下再变。
 */
const theme = ref<ThemeMode>(root.dataset.theme === 'dark' ? 'dark' : 'light')

function applyTheme(next: ThemeMode, persist: boolean): void {
  theme.value = next
  root.dataset.theme = next
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'dark' ? '#0a0a0a' : '#ffffff')

  if (!persist) return
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* 隐私模式下写入失败时忽略，不影响本次切换 */
  }
}

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')

  function toggleTheme(): void {
    applyTheme(isDark.value ? 'light' : 'dark', true)
  }

  function setTheme(next: ThemeMode): void {
    applyTheme(next, true)
  }

  return { theme, isDark, toggleTheme, setTheme }
}
