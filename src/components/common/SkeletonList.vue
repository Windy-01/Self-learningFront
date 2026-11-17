<script setup lang="ts">
/**
 * 列表骨架屏。
 *
 * 只在「第一次加载」时用；已经有数据再刷新时保持旧内容，
 * 否则页面会闪一下再回来，比不显示还难受。
 */
withDefaults(defineProps<{ rows?: number; compact?: boolean }>(), {
  rows: 5,
  compact: false,
})
</script>

<template>
  <div class="skeleton" :class="{ 'skeleton--compact': compact }">
    <div v-for="row in rows" :key="row" class="skeleton__row">
      <span class="skeleton__bar skeleton__bar--wide" />
      <span class="skeleton__bar skeleton__bar--short" />
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  display: flex;
  flex-direction: column;
}

.skeleton__row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.skeleton__row:last-child {
  border-bottom: none;
}

.skeleton--compact .skeleton__row {
  padding: 10px 16px;
}

.skeleton__bar {
  height: 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-hover);
  animation: skeleton-pulse 1.4s var(--ease) infinite;
}

.skeleton__bar--wide {
  width: 72%;
}

.skeleton__bar--short {
  width: 34%;
  height: 8px;
  animation-delay: 0.2s;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
</style>
