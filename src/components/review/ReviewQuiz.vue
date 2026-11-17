<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import QuestionBody from '@/components/question/QuestionBody.vue'
import GradeDrawer from './GradeDrawer.vue'
import { askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { cancelReviewSheet, submitReviewSheet } from '@/api/review'
import { ApiError, errorMessage } from '@/api/http'
import { contentOf, isChoiceType, typeLabel } from '@/api/content'
import { reviewSheetTitle } from '@/utils/format'
import {
  clearReviewDraft,
  loadReviewDraft,
  saveReviewDraft,
  type ReviewGrade,
} from '@/utils/reviewDraft'
import type { ReviewSheetDetail, ReviewSheetEntity, ReviewSheetItem } from '@/api/types'

/**
 * 作答（`status = 0 / 1`）。
 *
 * 三条硬约束直接决定了这一页的形态：
 * 1. `O2` **不返回答案** → 页面上没有「看答案」，只留「在题库中打开原题」的出口；
 * 2. 作答过程**没有保存接口** → 答案、题号、自评分数全部写进本地草稿，刷新不丢；
 * 3. 判分在客户端 → 交卷必须经过评分抽屉，不能一键提交一个假分数。
 *
 * 一次只显示一题：长列表在手机上要滚很久，而做题本来就是线性的。
 */
const props = defineProps<{ detail: ReviewSheetDetail }>()

const emit = defineEmits<{
  (e: 'submitted', sheet: ReviewSheetEntity): void
  /** 状态在别处变了（409 已交卷 / 已作废），请容器重新拉一次详情 */
  (e: 'refresh'): void
}>()

const { push } = useToast()

const sheetId = computed(() => props.detail.sheet.review_sheet_id)
const items = computed(() => props.detail.items)
const title = computed(() => reviewSheetTitle(props.detail.sheet.title, props.detail.sheet.created_at))

const index = ref(0)
const answers = ref<Record<number, string>>({})
const grades = ref<ReviewGrade[]>([])

const drawerOpen = ref(false)
const submitting = ref(false)
const restored = ref(false)
const imageErrors = ref<string[]>([])

/** 交卷 / 作废之后不再回写草稿：否则组件卸载时会把刚清掉的草稿又写回去。 */
let finished = false
let saveTimer: number | undefined

const current = computed<ReviewSheetItem | null>(() => items.value[index.value] ?? null)

const currentView = computed(() => contentOf(current.value?.content ?? null))

const isChoice = computed(() =>
  isChoiceType(currentView.value.type, currentView.value.choiceMode),
)

const isMultiple = computed(
  () => currentView.value.choiceMode === 'multiple' || currentView.value.type === 'multiple_choice',
)

const answeredCount = computed(
  () =>
    items.value.filter((item) => (answers.value[item.reviewSheetQuestionId] ?? '').trim() !== '')
      .length,
)

const images = computed(() => current.value?.imageUrls ?? [])

function answerOf(item: ReviewSheetItem | null): string {
  if (!item) return ''

  return answers.value[item.reviewSheetQuestionId] ?? ''
}

function isAnswered(item: ReviewSheetItem): boolean {
  return (answers.value[item.reviewSheetQuestionId] ?? '').trim() !== ''
}

function setAnswer(value: string): void {
  if (!current.value) return

  answers.value = {
    ...answers.value,
    [current.value.reviewSheetQuestionId]: value,
  }
}

/**
 * 补齐评分行：保留已有分数，丢掉不属于这份卷子的旧行。
 * 打开抽屉前调用，保证抽屉里每道题都有对应的行。
 */
function seedGrades(): void {
  const existing = new Map(grades.value.map((grade) => [grade.rsqId, grade]))

  grades.value = items.value.map(
    (item) =>
      existing.get(item.reviewSheetQuestionId) ?? {
        rsqId: item.reviewSheetQuestionId,
        max: 5,
        score: 5,
        skip: false,
      },
  )
}

function writeDraft(): void {
  if (finished) return

  // 只是进来看看、什么都没填：不留草稿，否则设置页的「本地草稿」会被空记录撑大
  const hasAnswer = Object.keys(answers.value).length > 0
  const hasGradeChange = grades.value.some(
    (grade) => grade.skip || grade.score !== 5 || grade.max !== 5,
  )

  if (!hasAnswer && !hasGradeChange) {
    clearReviewDraft(sheetId.value)
    return
  }

  saveReviewDraft(sheetId.value, {
    answers: answers.value,
    grades: grades.value,
    index: index.value,
  })
}

function scheduleSave(): void {
  if (finished) return

  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(writeDraft, 400)
}

/**
 * 立即落盘。刷新 / 切到后台 / 离开页面时调用：
 * 最后一次输入可能还在 400ms 的防抖窗口里，不补这一下就丢了。
 */
function flushDraft(): void {
  window.clearTimeout(saveTimer)
  writeDraft()
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') flushDraft()
}

function restoreDraft(): void {
  const draft = loadReviewDraft(sheetId.value)

  if (!draft) return

  answers.value = draft.answers
  grades.value = draft.grades
  index.value = Math.min(Math.max(0, draft.index), Math.max(0, items.value.length - 1))
  restored.value = Object.keys(draft.answers).length > 0
}

function goTo(target: number): void {
  if (target < 0 || target >= items.value.length) return

  index.value = target
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openDrawer(): void {
  seedGrades()
  drawerOpen.value = true
}

function onAnswerInput(event: Event): void {
  setAnswer((event.target as HTMLTextAreaElement).value)
}

function onImageError(url: string): void {
  if (!imageErrors.value.includes(url)) imageErrors.value = [...imageErrors.value, url]
}

async function submit(): Promise<void> {
  if (submitting.value) return

  submitting.value = true

  try {
    const payload = items.value.map((item) => {
      const grade = grades.value.find((row) => row.rsqId === item.reviewSheetQuestionId)
      const answer = (answers.value[item.reviewSheetQuestionId] ?? '').trim()

      return {
        reviewSheetQuestionId: item.reviewSheetQuestionId,
        questionId: item.questionId,
        userAnswer: answer === '' ? null : answer,
        // 不评分 = 两个字段都给 null，服务端不计入总分
        score: grade && !grade.skip ? grade.score : null,
        maxScore: grade && !grade.skip ? grade.max : null,
      }
    })

    const sheet = await submitReviewSheet(sheetId.value, payload)

    finished = true
    window.clearTimeout(saveTimer)
    clearReviewDraft(sheetId.value)
    drawerOpen.value = false
    push('已交卷')
    emit('submitted', sheet)
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) {
      // 已交卷 / 已作废：本地草稿已经没有意义，清掉并让容器按真实状态重渲染
      finished = true
      window.clearTimeout(saveTimer)
      clearReviewDraft(sheetId.value)
      drawerOpen.value = false
      push('这份卷子已经交过或已作废，正在刷新…')
      emit('refresh')
      return
    }

    push(errorMessage(cause))
  } finally {
    submitting.value = false
  }
}

async function cancel(): Promise<void> {
  const ok = await askConfirm({
    title: '作废这份卷子？',
    body: '作废后不能继续作答，也不能交卷。已提交的卷子不允许作废。',
    confirmText: '作废',
    danger: true,
  })

  if (!ok) return

  try {
    const result = await cancelReviewSheet(sheetId.value)

    if (!result.cancelled) {
      push('没有作废成功，这份卷子可能已经不在了')
      emit('refresh')
      return
    }

    finished = true
    window.clearTimeout(saveTimer)
    clearReviewDraft(sheetId.value)
    push('已作废')
    emit('refresh')
  } catch (cause) {
    push(errorMessage(cause))
  }
}

watch([answers, index, grades], scheduleSave, { deep: true })

onMounted(() => {
  restoreDraft()
  seedGrades()

  window.addEventListener('beforeunload', flushDraft)
  window.addEventListener('pagehide', flushDraft)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', flushDraft)
  window.removeEventListener('pagehide', flushDraft)
  document.removeEventListener('visibilitychange', onVisibilityChange)

  // 最后一次输入可能还在防抖窗口里，离开前补一次
  flushDraft()
})
</script>

<template>
  <div class="quiz">
    <div>
      <RouterLink class="back" :to="{ name: 'review' }">‹ 复习卷</RouterLink>
      <PageHeader
        :title="title"
        :description="`${items.length} 题 · 答案自动暂存在本机`"
        :tag="detail.sheet.status === 1 ? '作答中' : undefined"
      >
        <template #actions>
          <button class="btn btn--sm btn--ghost" type="button" @click="cancel">作废</button>
          <button class="btn btn--primary" type="button" :disabled="items.length === 0" @click="openDrawer">
            交卷
          </button>
        </template>
      </PageHeader>
    </div>

    <EmptyState
      v-if="items.length === 0"
      icon="fileText"
      title="这份卷子里没有题目"
      description="可能是抽题时题目已被删除。删掉这份卷子，重新生成一份。"
    />

    <template v-else>
      <div class="dots" aria-label="题号">
        <button
          v-for="(item, itemIndex) in items"
          :key="item.reviewSheetQuestionId"
          class="dot"
          :class="{ 'is-done': isAnswered(item), 'is-current': itemIndex === index }"
          type="button"
          :aria-current="itemIndex === index ? 'true' : undefined"
          :aria-label="`第 ${itemIndex + 1} 题${isAnswered(item) ? '（已答）' : ''}`"
          @click="goTo(itemIndex)"
        >
          {{ itemIndex + 1 }}
        </button>
      </div>

      <section v-if="current" class="card">
        <div class="card__no">
          第 {{ index + 1 }} 题 · {{ typeLabel(currentView.type, currentView.choiceMode) }}
        </div>

        <QuestionBody
          :content="current.content"
          :pickable="isChoice"
          :multiple="isMultiple"
          :model-value="answerOf(current)"
          @update:model-value="setAnswer"
        >
          <template #after-stem>
            <div v-if="images.length > 0" class="images">
              <template v-for="url in images" :key="url">
                <img
                  v-if="!imageErrors.includes(url)"
                  class="images__item"
                  :src="url"
                  alt="题目配图"
                  loading="lazy"
                  @error="onImageError(url)"
                />
                <div v-else class="images__broken">
                  图片已过期（预签名地址 30 分钟失效），原图请到题库查看
                </div>
              </template>
            </div>
          </template>
        </QuestionBody>

        <textarea
          v-if="!isChoice"
          class="input answer"
          rows="6"
          placeholder="写下你的解答…"
          :value="answerOf(current)"
          @input="onAnswerInput"
        />

        <div class="card__foot">
          <RouterLink
            class="card__link"
            :to="{ name: 'question-detail', params: { id: current.questionId } }"
            target="_blank"
            rel="noopener"
          >
            在题库中打开这道题 ›
          </RouterLink>
          <span class="card__hint">标准答案只在题库详情里，作答页不显示</span>
        </div>
      </section>

      <div class="quiz-foot">
        <span class="quiz-foot__note">
          已答 {{ answeredCount }} / {{ items.length }} 题 · 答案自动暂存在本机
          <span v-if="restored"> · 已恢复上次的作答</span>
        </span>

        <div class="quiz-foot__actions">
          <button class="btn btn--sm" type="button" :disabled="index === 0" @click="goTo(index - 1)">
            上一题
          </button>
          <button
            class="btn btn--sm btn--primary"
            type="button"
            :disabled="index >= items.length - 1"
            @click="goTo(index + 1)"
          >
            下一题
          </button>
        </div>
      </div>
    </template>

    <GradeDrawer
      :open="drawerOpen"
      :items="items"
      :answers="answers"
      :grades="grades"
      :submitting="submitting"
      @close="drawerOpen = false"
      @confirm="submit"
    />
  </div>
</template>

<style scoped>
.quiz {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
  margin: 0 auto;
}

.dots {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dot {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.dot:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.dot.is-done {
  border-color: var(--accent-border);
  color: var(--text-primary);
  background: var(--accent-soft);
}

.dot.is-current {
  border-color: var(--accent);
  color: var(--text-inverse);
  background: var(--accent);
}

.card {
  padding: 22px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.card__no {
  margin-bottom: 10px;
  font-size: 11px;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.images {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.images__item {
  max-width: 100%;
  max-height: 260px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  object-fit: contain;
}

.images__broken {
  padding: 10px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.answer {
  height: auto;
  min-height: 120px;
  margin-top: 14px;
  padding: 10px;
  line-height: 1.7;
  resize: vertical;
}

.card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.card__link {
  font-size: 11.5px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-strong);
}

.card__link:hover {
  color: var(--text-primary);
}

.card__hint {
  font-size: 11px;
  color: var(--text-muted);
}

.quiz-foot {
  position: sticky;
  bottom: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}

.quiz-foot__note {
  font-size: 11.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.quiz-foot__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

@media (max-width: 640px) {
  .quiz-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .quiz-foot__actions {
    justify-content: flex-end;
  }
}
</style>
