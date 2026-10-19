<template>
  <section class="auth-card">
    <header class="auth-card__header">
      <h1 class="auth-card__title">{{ title }}</h1>
      <p v-if="hint" class="auth-card__hint">{{ hint }}</p>
    </header>

    <slot />

    <p
      v-if="status"
      class="auth-card__status"
      :class="{ 'is-error': statusIsError }"
      role="status"
    >
      {{ status }}
    </p>

    <footer v-if="$slots.footer" class="auth-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * 登录 / 注册 / 退出三个页面共用的卡片外壳。
 *
 * 只负责版式：标题 + 状态行 + 底部链接区，并通过 `:deep()` 下发一套统一的
 * 表单控件样式（`.auth-form` / `.auth-field` / `.auth-submit` …），
 * 页面里直接写这些类名即可，不必各自重复写样式。
 */
withDefaults(
  defineProps<{
    title: string
    hint?: string
    status?: string
    statusIsError?: boolean
  }>(),
  {
    hint: '',
    status: '',
    statusIsError: false,
  },
)
</script>

<style scoped>
.auth-card {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 28px 28px 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.auth-card__header {
  margin-bottom: 20px;
}

.auth-card__title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.auth-card__hint {
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.auth-card__status {
  margin-top: 14px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.auth-card__status.is-error {
  color: var(--danger);
}

.auth-card__footer {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-muted);
}

/* ---------- 下发给页面使用的表单控件样式 ---------- */
.auth-card :deep(.auth-form) {
  display: grid;
  gap: 14px;
}

.auth-card :deep(.auth-field) {
  display: block;
}

.auth-card :deep(.auth-field__label) {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.auth-card :deep(.auth-field__input) {
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

.auth-card :deep(.auth-field__input:focus) {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.auth-card :deep(.auth-field__error) {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--danger);
}

.auth-card :deep(.auth-submit) {
  min-height: 38px;
  margin-top: 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--text-inverse);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  transition: opacity var(--duration) var(--ease);
}

.auth-card :deep(.auth-submit:hover:not(:disabled)) {
  opacity: 0.85;
}

.auth-card :deep(.auth-submit:disabled) {
  cursor: not-allowed;
  opacity: 0.45;
}

.auth-card :deep(.auth-link) {
  color: var(--text-primary);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.auth-card :deep(.auth-note) {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-secondary);
}

.auth-card :deep(.auth-note code) {
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-hover);
  font-family: var(--font-mono);
  font-size: 11.5px;
}
</style>
