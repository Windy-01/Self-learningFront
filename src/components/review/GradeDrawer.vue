<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { formatRate, formatScore } from '@/utils/format'
import type { ReviewSheetItem } from '@/api/types'
import type { ReviewGrade } from '@/utils/reviewDraft'

/**
 * 交卷前的自评抽屉。
 *
 * 接口把判分权交给客户端（`O4` 只校验 `0 <= score <= maxScore`），
 * 但让学生面对「得分 / 满分」两个空输入框是没法用的。
 * 所以每行给四个快捷档 —— 全对 / 半对 / 零分 / 不评分 —— 把「打分」降级成「判断对错」，
 * 滑块与数字框只负责微调。
 *
 * 分数数组由父组件持有（要写进本地草稿），这里直接改行对象的字段。
 * 不复制一份本地状态：抽屉关掉再打开时，用户刚调好的分数必须还在。
 */
const props = defineProps<{
  open: boolean
  items: ReviewSheetItem[]
  answers: Record<number, string>
  grades: ReviewGrade[]
  submitting: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

type QuickMode = 'full' | 'half' | 'zero' | 'skip'

const QUICK: { key: QuickMode; label: string }[] = [
  { key: 'full', label: '全对' },
  { key: 'half', label: '半对' },
  { key: 'zero', label: '零分' },
  { key: 'skip', label: '不评分' },
]

const error = ref('')

const rated = computed(() => props.grades.filter((grade) => !grade.skip))

const total = computed(() =>
  rated.value.reduce(
    (sum, grade) => ({ score: sum.score + grade.score, max: sum.max + grade.max }),
    { score: 0, max: 0 },
  ),
)

const rate = computed(() =>
  total.value.max > 0 ? total.value.score / total.value.max : null,
)

/** 父组件在打开抽屉前保证每道题都有评分行；这里兜底避免空指针。 */
function gradeOf(item: ReviewSheetItem): ReviewGrade {
  return (
    props.grades.find((grade) => grade.rsqId === item.reviewSheetQuestionId) ?? {
      rsqId: item.reviewSheetQuestionId,
      max: 5,
      score: 5,
      skip: false,
    }
  )
}

function answerText(item: ReviewSheetItem): string {
  const value = (props.answers[item.reviewSheetQuestionId] ?? '').trim()

  return value === '' ? '未作答' : value
}

function isOn(grade: ReviewGrade, mode: QuickMode): boolean {
  switch (mode) {
    case 'skip':
      return grade.skip
    case 'full':
      return !grade.skip && grade.score === grade.max
    case 'zero':
      return !grade.skip && grade.score === 0
    default:
      return !grade.skip && grade.score > 0 && grade.score < grade.max
  }
}

function applyQuick(grade: ReviewGrade, mode: QuickMode): void {
  error.value = ''

  if (mode === 'skip') {
    grade.skip = true
    grade.score = 0
    return
  }

  grade.skip = false
  grade.score = mode === 'full' ? grade.max : mode === 'half' ? grade.max / 2 : 0
}

function onMaxInput(grade: ReviewGrade, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)

  error.value = ''

  // 输入框被清空时 `Number('') === 0`，此时保持原值，等 blur 再回填，避免把满分改成 1。
  if ((event.target as HTMLInputElement).value.trim() === '') return
  if (!Number.isFinite(value) || value <= 0) return

  grade.max = value

  if (grade.score > grade.max) grade.score = grade.max
}

function onScoreInput(grade: ReviewGrade, event: Event): void {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)

  error.value = ''
  if (input.value.trim() === '' || !Number.isFinite(value)) return

  grade.skip = false
  grade.score = Math.min(grade.max, Math.max(0, value))
}

/** 滑块拖动只改数字，不重建列表 —— 重建会让拖动中断。 */
function onRangeInput(grade: ReviewGrade, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)

  error.value = ''
  if (!Number.isFinite(value)) return

  grade.skip = false
  grade.score = Math.min(grade.max, Math.max(0, value))
}

/** 失焦时把输入框拉回真实值，避免出现「框里是 99、实际是 5」。 */
function syncInput(event: Event, value: number): void {
  const input = event.target as HTMLInputElement

  if (input.disabled) return

  input.value = String(formatScore(value))
}

function confirm(): void {
  if (props.submitting) return

  const invalid = rated.value.find((grade) => !Number.isFinite(grade.max) || grade.max <= 0)

  if (invalid) {
    error.value = '满分必须大于 0。'
    return
  }

  emit('confirm')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open && !props.submitting) emit('close')
}

// 重新打开时清掉上一次的错误提示，否则会挂着一句和当前操作无关的话
watch(
  () => props.open,
  (open) => {
    if (open) error.value = ''
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="grade">
      <div v-if="open" class="grade-layer" @click.self="!submitting && emit('close')">
        <aside class="grade" role="dialog" aria-modal="true" aria-label="交卷评分">
          <header class="grade__head">
            <div class="grade__head-main">
              <h2 class="grade__title">交卷前，给每题打个分</h2>
              <p class="grade__desc">
                判分在客户端完成，接口只校验范围。选「不评分」的题不计入总分，但仍会留下作答记录。
              </p>
            </div>
            <button
              class="grade__close"
              type="button"
              aria-label="关闭"
              :disabled="submitting"
              @click="emit('close')"
            >
              <AppIcon name="close" :size="16" />
            </button>
          </header>

          <div class="grade__body">
            <div
              v-for="(item, index) in items"
              :key="item.reviewSheetQuestionId"
              class="grade-row"
            >
              <div class="grade-row__head">
                <span class="grade-row__no">{{ index + 1 }}</span>
                <span class="grade-row__ans">我的答案：{{ answerText(item) }}</span>
                <label class="grade-row__max">
                  满分
                  <input
                    class="mini-input"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="decimal"
                    :value="gradeOf(item).max"
                    @input="onMaxInput(gradeOf(item), $event)"
                    @blur="syncInput($event, gradeOf(item).max)"
                  />
                </label>
              </div>

              <div class="grade-row__ctrl">
                <input
                  class="grade-row__range"
                  type="range"
                  min="0"
                  step="0.5"
                  :max="gradeOf(item).max"
                  :value="gradeOf(item).score"
                  :disabled="gradeOf(item).skip"
                  @input="onRangeInput(gradeOf(item), $event)"
                />

                <input
                  class="mini-input"
                  type="number"
                  min="0"
                  :max="gradeOf(item).max"
                  step="0.5"
                  inputmode="decimal"
                  :value="gradeOf(item).skip ? '' : gradeOf(item).score"
                  :disabled="gradeOf(item).skip"
                  @input="onScoreInput(gradeOf(item), $event)"
                  @blur="syncInput($event, gradeOf(item).score)"
                />

                <div class="quick">
                  <button
                    v-for="mode in QUICK"
                    :key="mode.key"
                    class="quick__btn"
                    :class="{ 'is-on': isOn(gradeOf(item), mode.key) }"
                    type="button"
                    @click="applyQuick(gradeOf(item), mode.key)"
                  >
                    {{ mode.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <footer class="grade__foot">
            <div class="grade-total">
              <div class="grade-total__main">
                <b>{{ formatScore(total.score) }} / {{ formatScore(total.max) }}</b>
                <span>{{ rate === null ? '没有评分的题' : `得分率 ${formatRate(rate)}` }}</span>
              </div>
              <span class="grade-total__hint">满分默认 5，可改</span>
            </div>

            <p v-if="error" class="grade__error">{{ error }}</p>

            <div class="grade__actions">
              <button class="btn btn--ghost" type="button" :disabled="submitting" @click="emit('close')">
                再检查一下
              </button>
              <button class="btn btn--primary grade__submit" type="button" :disabled="submitting" @click="confirm">
                {{ submitting ? '提交中…' : '确认交卷' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.grade-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.32);
}

.grade {
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  height: 100%;
  border-left: 1px solid var(--border-color);
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.grade__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.grade__head-main {
  min-width: 0;
}

.grade__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.grade__desc {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.grade__close {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

.grade__close:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.grade__body {
  flex: 1;
  padding: 4px 20px 12px;
  overflow-y: auto;
}

.grade-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.grade-row:last-child {
  border-bottom: none;
}

.grade-row__head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.grade-row__no {
  flex: none;
  min-width: 16px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.grade-row__ans {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grade-row__max {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.grade-row__ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.grade-row__range {
  flex: 1;
  min-width: 60px;
  height: 4px;
  accent-color: var(--accent);
}

.mini-input {
  width: 54px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  outline: none;
  font-size: 11.5px;
  color: var(--text-primary);
  background: var(--bg-input);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.mini-input:focus {
  border-color: var(--accent);
}

.mini-input:disabled {
  opacity: 0.45;
}

.quick {
  display: flex;
  flex: none;
  gap: 4px;
}

.quick__btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.quick__btn:hover {
  border-color: var(--accent-border);
  color: var(--text-primary);
}

.quick__btn.is-on {
  border-color: var(--accent);
  color: var(--text-inverse);
  background: var(--accent);
}

.grade__foot {
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.grade-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.grade-total__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.grade-total__main b {
  font-size: 20px;
  letter-spacing: -0.4px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.grade-total__main span,
.grade-total__hint {
  font-size: 11.5px;
  color: var(--text-muted);
}

.grade__error {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-primary);
}

.grade__actions {
  display: flex;
  gap: 8px;
}

.grade__submit {
  flex: 1;
}

.grade-enter-active,
.grade-leave-active {
  transition: opacity 0.18s var(--ease);
}

.grade-enter-active .grade,
.grade-leave-active .grade {
  transition: transform 0.22s var(--ease);
}

.grade-enter-from,
.grade-leave-to {
  opacity: 0;
}

.grade-enter-from .grade,
.grade-leave-to .grade {
  transform: translateX(100%);
}

@media (max-width: 640px) {
  .grade-row__ctrl {
    flex-wrap: wrap;
  }

  .grade-row__range {
    flex-basis: 100%;
  }

  .quick {
    margin-left: auto;
  }
}
</style>
