<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { flowSteps } from '@/config/flow'

/**
 * 流程步骤条：自动按当前路由高亮。
 * 只做导航，不承载业务状态，所以不需要传 props。
 */
const route = useRoute()
</script>

<template>
  <nav class="flow" aria-label="题目处理流程">
    <RouterLink
      v-for="(step, index) in flowSteps"
      :key="step.name"
      class="flow__step"
      :class="{ 'is-active': route.name === step.name }"
      :to="{ name: step.name }"
      :aria-current="route.name === step.name ? 'step' : undefined"
    >
      <span class="flow__index">{{ index + 1 }}</span>
      <span class="flow__label">{{ step.title }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.flow {
  display: flex;
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  scrollbar-width: none;
}

.flow::-webkit-scrollbar {
  display: none;
}

.flow__step {
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  gap: 8px;
  min-width: 128px;
  padding: 10px 14px;
  border-right: 1px solid var(--border-color);
  font-size: 12.5px;
  color: var(--text-muted);
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease);
}

.flow__step:last-child {
  border-right: none;
}

.flow__step:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.flow__index {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-muted);
  background: var(--bg-surface);
}

.flow__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow__step.is-active {
  font-weight: 600;
  color: var(--text-primary);
  background: var(--accent-soft);
}

.flow__step.is-active .flow__index {
  border-color: var(--accent);
  color: var(--text-inverse);
  background: var(--accent);
}
</style>
