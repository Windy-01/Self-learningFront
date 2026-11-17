<script setup lang="ts">
import { useToast } from '@/composables/useToast'

/** 全局提示容器：挂在布局里，任何页面 push 都会出现在这里。 */
const { items } = useToast()
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <TransitionGroup name="toast">
      <p v-for="item in items" :key="item.id" class="toast">{{ item.message }}</p>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%);
  pointer-events: none;
}

.toast {
  max-width: min(520px, calc(100vw - 32px));
  padding: 9px 15px;
  border-radius: var(--radius-md);
  font-size: 12.5px;
  color: var(--text-inverse);
  background: var(--accent);
  box-shadow: var(--shadow-md);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s var(--ease),
    transform 0.18s var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
