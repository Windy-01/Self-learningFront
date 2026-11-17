<script setup lang="ts">
/** 页内错误条：一句可读的原因 + 一个重试按钮，不遮挡页面其余内容。 */
defineProps<{ message: string }>()
defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <div class="error-bar" role="alert">
    <span class="error-bar__text">{{ message }}</span>
    <button class="btn btn--sm" type="button" @click="$emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.error-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-surface-hover);
}

.error-bar__text {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
