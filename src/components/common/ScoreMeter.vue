<script setup lang="ts">
import { computed } from 'vue'
import { formatRate, rateWidth } from '@/utils/format'

/**
 * 得分率条。
 *
 * `rate = null` 表示「从未作答」，显示成虚线空条 + `—`，
 * 和「考了 0 分」必须区分开 —— 这两种状态在学情里含义完全相反。
 */
const props = withDefaults(
  defineProps<{
    rate: number | null | undefined
    /** 是否在右侧显示百分比 */
    label?: boolean
  }>(),
  { label: true },
)

const width = computed(() => rateWidth(props.rate))
const isEmpty = computed(() => props.rate === null || props.rate === undefined)
</script>

<template>
  <div class="score-meter">
    <span class="score-meter__track" :class="{ 'is-empty': isEmpty }">
      <span class="score-meter__fill" :style="{ width: `${width}%` }" />
    </span>
    <span v-if="label" class="score-meter__value">{{ isEmpty ? '未练习' : formatRate(rate) }}</span>
  </div>
</template>

<style scoped>
.score-meter {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.score-meter__track {
  position: relative;
  flex: 1;
  height: 6px;
  min-width: 48px;
  border-radius: var(--radius-full);
  background: var(--border-color);
  overflow: hidden;
}

.score-meter__track.is-empty {
  background: transparent;
  border: 1px dashed var(--border-strong);
}

.score-meter__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.score-meter__value {
  flex: none;
  min-width: 42px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  text-align: right;
}
</style>
