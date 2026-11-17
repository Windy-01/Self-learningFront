<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { isApiBaseUrlInvalid, normalizeApiBaseUrl, useConfig } from '@/config'
import { useTheme } from '@/composables/useTheme'
import { useToast } from '@/composables/useToast'

/**
 * 设置弹窗。
 *
 * 只有四件事：接口地址、外观、本地作答草稿、当前身份说明。
 * 不做成独立页面 —— 内容太少，跳页反而增加一次导航成本。
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { config, saveConfig, resetConfig } = useConfig()
const { theme, setTheme } = useTheme()
const { push } = useToast()

const draft = ref('')
const error = ref('')
const notice = ref('')
const testing = ref(false)
const draftCount = ref(0)

/** 本地草稿的键前缀：`sheet:` 是作答草稿（P3），`capture:draft` 是录入草稿（P2）。 */
const DRAFT_PREFIXES = ['sheet:', 'capture:draft']

function isDraftKey(key: string): boolean {
  return DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function countDrafts(): number {
  try {
    let count = 0

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)

      if (key && isDraftKey(key)) count += 1
    }

    return count
  } catch {
    return 0
  }
}

function clearDrafts(): void {
  try {
    const keys: string[] = []

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)

      if (key && isDraftKey(key)) keys.push(key)
    }

    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    /* 存储不可用时忽略 */
  }

  draftCount.value = countDrafts()
  push('已清除本地草稿')
}

watch(
  () => props.open,
  (open) => {
    if (!open) return

    draft.value = config.apiBaseUrl
    error.value = ''
    notice.value = ''
    draftCount.value = countDrafts()
  },
  { immediate: true },
)

/** 用**输入框里的地址**探测，而不是已保存的地址 —— 否则「测试」测的是旧的。 */
async function testConnection(): Promise<void> {
  error.value = ''
  notice.value = ''

  if (isApiBaseUrlInvalid(draft.value)) {
    error.value = '地址需要以 http:// 或 https:// 开头。'
    return
  }

  testing.value = true

  try {
    const base = normalizeApiBaseUrl(draft.value)
    const response = await fetch(`${base}/api/label`, { headers: { Accept: 'application/json' } })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data: unknown = await response.json()
    const count = Array.isArray(data) ? data.length : 0

    notice.value = `连接成功，读到 ${count} 个标签。`
  } catch (cause) {
    error.value = cause instanceof Error ? `连不上：${cause.message}` : '连不上服务。'
  } finally {
    testing.value = false
  }
}

function handleSave(): void {
  error.value = ''
  notice.value = ''

  const value = draft.value.trim()

  if (isApiBaseUrlInvalid(value)) {
    error.value = '地址需要以 http:// 或 https:// 开头。'
    return
  }

  if (!saveConfig({ apiBaseUrl: value })) {
    error.value = '浏览器拒绝写入 cookie，配置未保存。'
    return
  }

  push('设置已保存')
  emit('close')
}

function handleReset(): void {
  resetConfig()
  draft.value = config.apiBaseUrl
  error.value = ''
  notice.value = '已恢复默认地址。'
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) {
    emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="dialog">
    <div v-if="open" class="settings-layer" @click.self="emit('close')">
      <section class="settings" role="dialog" aria-modal="true" aria-label="设置">
        <header class="settings__head">
          <h2 class="settings__title">设置</h2>
          <button class="settings__close" type="button" aria-label="关闭" @click="emit('close')">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <label class="settings__field">
          <span class="settings__label">接口地址</span>
          <input
            v-model="draft"
            class="settings__input"
            type="text"
            placeholder="http://localhost:8080"
            spellcheck="false"
          />
          <span class="settings__hint">留空表示与站点同源（走相对路径，适合 vite 代理）。</span>
        </label>

        <div class="settings__row">
          <button class="btn btn--sm" type="button" :disabled="testing" @click="testConnection">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <button class="btn btn--sm btn--ghost" type="button" @click="handleReset">恢复默认</button>
        </div>

        <p v-if="error" class="settings__error">{{ error }}</p>
        <p v-else-if="notice" class="settings__notice">{{ notice }}</p>

        <div class="settings__block">
          <span class="settings__label">外观</span>
          <div class="segmented">
            <button
              class="segmented__item"
              :class="{ 'is-active': theme === 'light' }"
              type="button"
              @click="setTheme('light')"
            >
              浅色
            </button>
            <button
              class="segmented__item"
              :class="{ 'is-active': theme === 'dark' }"
              type="button"
              @click="setTheme('dark')"
            >
              深色
            </button>
          </div>
        </div>

        <div class="settings__block">
          <span class="settings__label">本地数据</span>
          <div class="settings__line">
            <span class="settings__hint">本地草稿 {{ draftCount }} 份（存在本机，不上传）</span>
            <button class="btn btn--sm btn--ghost" type="button" :disabled="draftCount === 0" @click="clearDrafts">
              清除
            </button>
          </div>
        </div>

        <p class="settings__source">
          当前学生：1 · demo 环境无登录，所有请求由服务端固定为该身份。
        </p>

        <footer class="settings__actions">
          <button class="btn" type="button" @click="emit('close')">取消</button>
          <button class="btn btn--primary" type="button" @click="handleSave">保存</button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.settings-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
}

.settings {
  width: 100%;
  max-width: 460px;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.settings__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.settings__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.settings__close {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

.settings__close:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.settings__field {
  display: block;
}

.settings__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.settings__input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12.5px;
  outline: none;
  transition:
    border-color var(--duration) var(--ease),
    box-shadow var(--duration) var(--ease);
}

.settings__input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.settings__hint {
  display: block;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.settings__row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.settings__error {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-primary);
}

.settings__notice {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.settings__block {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}

.settings__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.settings__line .settings__hint {
  margin-top: 0;
}

.settings__source {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  font-size: 11.5px;
  color: var(--text-muted);
}

.settings__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.15s var(--ease);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
