<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { isApiBaseUrlInvalid, useConfig } from '@/config'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { config, configSource, saveConfig, resetConfig } = useConfig()

const draft = ref('')
const error = ref('')
const notice = ref('')

/** 当前配置来源，展示在弹窗里方便确认「继承有没有生效」。 */
const sourceLabel = computed(() => {
  switch (configSource.value) {
    case 'own':
      return '本项目配置（console-settings）'
    case 'inherited':
      return '继承自父站点（windy-settings）'
    default:
      return '默认值（与站点同源）'
  }
})

watch(
  () => props.open,
  (open) => {
    if (!open) return

    draft.value = config.apiBaseUrl
    error.value = ''
    notice.value = ''
  },
  { immediate: true },
)

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

  notice.value = '已保存到 console-settings。'
}

function handleReset(): void {
  resetConfig()
  draft.value = config.apiBaseUrl
  error.value = ''
  notice.value = '已删除 console-settings，重新读取配置。'
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

        <p class="settings__desc">
          配置存在 cookie <code>console-settings</code> 里，与父站点的
          <code>windy-settings</code> 分开保存。本项目没有配置内容时，会自动继承父站点的
          <code>apiBaseUrl</code>。
        </p>

        <label class="settings__field">
          <span class="settings__label">API 地址</span>
          <input
            v-model="draft"
            class="settings__input"
            type="text"
            placeholder="https://api.example.com"
            spellcheck="false"
          />
          <span class="settings__hint">留空表示与站点同源，请求走相对路径。</span>
        </label>

        <p v-if="error" class="settings__error">{{ error }}</p>
        <p v-else-if="notice" class="settings__notice">{{ notice }}</p>

        <p class="settings__source">当前来源：{{ sourceLabel }}</p>

        <footer class="settings__actions">
          <button class="settings__btn" type="button" @click="handleReset">恢复默认</button>
          <button class="settings__btn settings__btn--primary" type="button" @click="handleSave">
            保存
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.settings-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
}

.settings {
  width: 100%;
  max-width: 440px;
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
  margin-bottom: 10px;
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

.settings__desc {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.settings__desc code {
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-hover);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.settings__field {
  display: block;
  margin-top: 16px;
}

.settings__label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.settings__input {
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  transition:
    border-color var(--duration) var(--ease),
    box-shadow var(--duration) var(--ease);
}

.settings__input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.settings__hint {
  display: block;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.settings__error {
  margin-top: 10px;
  font-size: 12px;
  color: var(--danger);
}

.settings__notice {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.settings__source {
  margin-top: 14px;
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

.settings__btn {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-surface);
  transition:
    color var(--duration) var(--ease),
    border-color var(--duration) var(--ease);
}

.settings__btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.settings__btn--primary {
  border-color: transparent;
  color: var(--text-inverse);
  background: var(--accent);
}

.settings__btn--primary:hover {
  color: var(--text-inverse);
  opacity: 0.88;
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
