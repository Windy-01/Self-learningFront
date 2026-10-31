<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

/**
 * 空状态：页面骨架阶段的统一占位，后续接入数据后替换为真实内容。
 */
defineProps<{
  icon: IconName
  title: string
  description?: string
}>()
</script>

<template>
  <div class="empty">
    <span class="empty__icon">
      <AppIcon :name="icon" :size="22" :stroke-width="1.6" />
    </span>
    <p class="empty__title">{{ title }}</p>
    <p v-if="description" class="empty__desc">{{ description }}</p>
    <div v-if="$slots.action" class="empty__action">
      <slot name="action" />
    </div>
  </div>
</template>
