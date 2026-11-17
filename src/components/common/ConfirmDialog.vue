<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { confirmState, settleConfirm } from '@/composables/useConfirm'

/** 全局确认弹窗，配合 `askConfirm()` 使用。 */
function cancel(): void {
  settleConfirm(false)
}

function confirm(): void {
  settleConfirm(true)
}

function onKeydown(event: KeyboardEvent): void {
  if (!confirmState.open) return

  if (event.key === 'Escape') cancel()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="confirmState.open" class="confirm-layer" @click.self="cancel">
        <section class="confirm" role="alertdialog" aria-modal="true">
          <h2 class="confirm__title">{{ confirmState.title }}</h2>
          <p v-if="confirmState.body" class="confirm__body">{{ confirmState.body }}</p>

          <footer class="confirm__actions">
            <button class="btn" type="button" @click="cancel">{{ confirmState.cancelText }}</button>
            <button class="btn btn--primary" type="button" @click="confirm">
              {{ confirmState.confirmText }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
}

.confirm {
  width: 100%;
  max-width: 400px;
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.confirm__title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-primary);
}

.confirm__body {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
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
