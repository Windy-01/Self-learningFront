<script setup lang="ts">
/**
 * 页面页头：标题 + 描述 + 可选徽标与右侧动作区。
 * 样式取自全局 `styles/page.css`，各页面只传文案，不重复写排版。
 */
defineProps<{
  title: string
  description?: string
  /** 右侧或标题旁的短标记，例如「步骤 1 / 5」 */
  tag?: string
}>()
</script>

<template>
  <header class="page-head">
    <div class="page-head__main">
      <div class="page-head__row">
        <h1 class="page-head__title">{{ title }}</h1>
        <span v-if="tag" class="badge">{{ tag }}</span>
      </div>
      <p v-if="description" class="page-head__desc">{{ description }}</p>
    </div>

    <div v-if="$slots.actions" class="page-head__side">
      <slot name="actions" />
    </div>
  </header>
</template>
