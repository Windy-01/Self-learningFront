<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import ScoreMeter from '@/components/common/ScoreMeter.vue'
import { askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { deleteReviewSheet } from '@/api/review'
import { getQuestionHistory } from '@/api/question'
import { errorMessage } from '@/api/http'
import { contentOf } from '@/api/content'
import {
  formatDateTime,
  formatRate,
  formatScore,
  formatScorePair,
  previewStem,
  reviewSheetTitle,
} from '@/utils/format'
import { clearReviewDraft } from '@/utils/reviewDraft'
import type { AnswerRecordView, ReviewSheetDetail, ReviewSheetItem } from '@/api/types'

/**
 * 结果（`status = 2`，以及已作废的 `status = 3`）。
 *
 * 卷头与题干来自 `O2`，逐题得分与「我的答案」只能从 `Q14` 按
 * `reviewSheetQuestionId` 反查 —— 这是一个 N+1，所以限制并发 6，并且**允许部分失败**：
 * 取不到的题显示 `—`，取不到全部才降级成「明细暂时取不到 · 重试」。
 *
 * 不要伪造分数：`Q14` 挂了就直说，卷头总分仍然可信（它来自卷子本身）。
 */
const props = defineProps<{ detail: ReviewSheetDetail }>()

const emit = defineEmits<{
  (e: 'deleted'): void
  (e: 'refresh'): void
}>()

const router = useRouter()
const { push } = useToast()

const records = ref<Record<number, AnswerRecordView>>({})
const loading = ref(true)
const failedCount = ref(0)
const error = ref('')
const deleting = ref(false)

const sheet = computed(() => props.detail.sheet)
const items = computed(() => props.detail.items)
const title = computed(() => reviewSheetTitle(sheet.value.title, sheet.value.created_at))
const canceled = computed(() => sheet.value.status === 3)
/** 作废且从未交卷：没有成绩可看，也没必要去打 N 个 Q14 */
const neverSubmitted = computed(() => canceled.value && !sheet.value.submitted_at)

const rate = computed(() => sheet.value.score_rate)

const ungradedCount = computed(
  () =>
    items.value.filter((item) => {
      const record = records.value[item.reviewSheetQuestionId]

      return record !== undefined && record.score === null
    }).length,
)

function recordOf(item: ReviewSheetItem): AnswerRecordView | null {
  return records.value[item.reviewSheetQuestionId] ?? null
}

function stemOf(item: ReviewSheetItem): string {
  return previewStem(contentOf(item.content).stem, 80)
}

function answerText(item: ReviewSheetItem): string {
  const record = recordOf(item)

  if (!record) return '—'

  const value = (record.userAnswer ?? '').trim()

  return value === '' ? '未作答' : value
}

function isUnrated(item: ReviewSheetItem): boolean {
  const record = recordOf(item)

  return !record || record.score === null
}

function scoreText(item: ReviewSheetItem): string {
  const record = recordOf(item)

  if (!record) return '—'
  if (record.score === null) return '未评分'

  return `${formatScore(record.score)} / ${formatScore(record.maxScore)}`
}

function rateOf(item: ReviewSheetItem): number | null {
  const record = recordOf(item)

  if (!record || record.score === null || !record.maxScore) return null

  return record.score / record.maxScore
}

/**
 * 限并发地跑一组请求，返回每项的结果（成功或失败）。
 * 不用 `Promise.all`：一道题的 `Q14` 失败不该让整页明细消失。
 */
async function mapLimit<T, R>(
  list: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(list.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < list.length) {
      const index = cursor
      cursor += 1

      try {
        results[index] = { status: 'fulfilled', value: await task(list[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, () => worker()))

  return results
}

async function loadRecords(): Promise<void> {
  if (neverSubmitted.value || items.value.length === 0) {
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  failedCount.value = 0

  try {
    const outcomes = await mapLimit(items.value, 6, (item) => getQuestionHistory(item.questionId))
    const next: Record<number, AnswerRecordView> = {}
    let failed = 0

    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'rejected') {
        failed += 1
        return
      }

      const rsqId = items.value[index].reviewSheetQuestionId
      // 同一题可能被别的卷子做过，只认本卷的作答记录
      const matched = (Array.isArray(outcome.value) ? outcome.value : []).filter(
        (record) => record.reviewSheetQuestionId === rsqId,
      )

      if (matched.length > 0) next[rsqId] = matched[matched.length - 1]
    })

    records.value = next
    failedCount.value = failed

    if (failed === items.value.length) error.value = '逐题明细暂时取不到'
  } finally {
    loading.value = false
  }
}

async function remove(): Promise<void> {
  if (deleting.value) return

  const ok = await askConfirm({
    title: '删除这份卷子？',
    body: '卷子删掉后，这次作答的成绩不再单独保留（题目本身的作答记录还在）。',
    confirmText: '删除',
    danger: true,
  })

  if (!ok) return

  deleting.value = true

  try {
    const result = await deleteReviewSheet(sheet.value.review_sheet_id)

    if (!result.deleted) {
      push('没有删除成功，这份卷子可能已经不在了')
      emit('refresh')
      return
    }

    clearReviewDraft(sheet.value.review_sheet_id)
    push('已删除')
    emit('deleted')
  } catch (cause) {
    push(errorMessage(cause))
  } finally {
    deleting.value = false
  }
}

onMounted(loadRecords)
</script>

<template>
  <div class="result">
    <div>
      <RouterLink class="back" :to="{ name: 'review' }">‹ 复习卷</RouterLink>
      <PageHeader :title="title" :tag="canceled ? '已作废' : '已完成'">
        <template #actions>
          <button class="btn btn--sm" type="button" @click="router.push({ name: 'review-new' })">
            再生成一份
          </button>
          <button class="btn btn--sm btn--danger" type="button" :disabled="deleting" @click="remove">
            {{ deleting ? '删除中…' : '删除这份卷子' }}
          </button>
        </template>
      </PageHeader>
    </div>

    <p v-if="canceled" class="banner">这份卷子已作废，成绩不计入统计。</p>

    <section class="hero">
      <div class="hero__rate">{{ rate === null ? '—' : formatRate(rate) }}</div>
      <div class="hero__meta">
        <b>{{ neverSubmitted ? '—' : formatScorePair(sheet.total_score, sheet.total_max_score) }}</b>
        <span>
          {{ sheet.question_count }} 题 ·
          {{ sheet.submitted_at ? `${formatDateTime(sheet.submitted_at)} 交卷` : '未交卷' }}
        </span>
        <span v-if="ungradedCount > 0">{{ ungradedCount }} 题未评分，不计入总分</span>
      </div>
    </section>

    <EmptyState
      v-if="neverSubmitted"
      icon="fileText"
      title="这份卷子没有交卷"
      description="作废发生在交卷之前，所以没有成绩与逐题明细。"
    />

    <section v-else class="panel">
      <div class="panel__head">
        <h2 class="panel__title">逐题明细</h2>
        <span class="panel__hint">答案不在这里 —— 点「原题」看</span>
      </div>

      <ErrorBar v-if="error" :message="error" @retry="loadRecords" />

      <div v-else-if="failedCount > 0 && !loading" class="notice notice--inline">
        <span>{{ failedCount }} 道题的明细暂时取不到，其余照常显示</span>
        <button class="notice__link" type="button" @click="loadRecords">重试</button>
      </div>

      <SkeletonList v-if="loading" :rows="5" />

      <template v-else-if="!error">
        <div v-if="items.length > 0" class="rows">
          <div
            v-for="(item, index) in items"
            :key="item.reviewSheetQuestionId"
            class="result-row"
          >
            <span class="result-row__no">{{ index + 1 }}</span>
            <span class="result-row__stem">{{ stemOf(item) }}</span>
            <span class="result-row__ans">{{ answerText(item) }}</span>
            <span class="result-row__score" :class="{ 'is-skip': isUnrated(item) }">
              {{ scoreText(item) }}
            </span>
            <ScoreMeter class="result-row__meter" :rate="rateOf(item)" :label="false" />
            <RouterLink
              class="result-row__link"
              :to="{ name: 'question-detail', params: { id: item.questionId } }"
            >
              原题 ›
            </RouterLink>
          </div>
        </div>

        <EmptyState
          v-else
          icon="fileText"
          title="这份卷子里没有题目"
          description="抽题时题目可能已被删除。"
        />
      </template>
    </section>
  </div>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.banner {
  padding: 9px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-app);
}

.hero {
  display: flex;
  align-items: flex-end;
  gap: 26px;
  padding: 22px 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.hero__rate {
  font-size: 44px;
  font-weight: 700;
  letter-spacing: -2px;
  line-height: 1;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.hero__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-muted);
}

.hero__meta b {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.notice--inline {
  border-bottom: 1px solid var(--border-color);
}

.notice__link {
  font-size: 11.5px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-strong);
}

.notice__link:hover {
  color: var(--text-primary);
}

.rows {
  display: flex;
  flex-direction: column;
}

.result-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 110px 92px 76px 52px;
  gap: 12px;
  align-items: center;
  padding: 11px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.result-row:last-child {
  border-bottom: none;
}

.result-row__no {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.result-row__stem {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row__ans {
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row__score {
  font-weight: 600;
  color: var(--text-primary);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.result-row__score.is-skip {
  font-weight: 400;
  color: var(--text-muted);
}

.result-row__meter {
  min-width: 0;
}

.result-row__link {
  font-size: 11.5px;
  color: var(--text-muted);
  text-align: right;
  white-space: nowrap;
}

.result-row__link:hover {
  color: var(--text-primary);
}

@media (max-width: 720px) {
  .hero {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .result-row {
    grid-template-columns: 26px minmax(0, 1fr) 78px 44px;
  }

  .result-row__ans,
  .result-row__meter {
    display: none;
  }
}
</style>
