<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import ScoreMeter from '@/components/common/ScoreMeter.vue'
import { listQuestions } from '@/api/question'
import { listReviewHistory } from '@/api/review'
import { knowledgeStatistics } from '@/api/knowledge'
import { learningOverview } from '@/api/statistics'
import { errorMessage } from '@/api/http'
import { formatDateTime, formatRate, previewStem } from '@/utils/format'
import type { KnowledgeStat, LearningStat, QuestionSummary, ReviewSheetEntity } from '@/api/types'

/**
 * 工作台。
 *
 * 只回答一个问题：**现在该干什么**。
 * 所以只放「待办 + 最薄弱 + 最近」，不放任何需要二次点击才能理解的图表。
 *
 * 数据源：S1（总览计数）、Q4（最近入库）、O6（待完成卷）、K3（最薄弱知识点）。
 * 计数一律取 S1，不在前端对 Q4 全量列表再数一遍 ——
 * 那样一旦 Q4 加了分页就会静默数错。
 */
const router = useRouter()

const learning = ref<LearningStat | null>(null)
const questions = ref<QuestionSummary[]>([])
const sheets = ref<ReviewSheetEntity[]>([])
const stats = ref<KnowledgeStat[]>([])

const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    const [overview, questionList, sheetList, knowledgeList] = await Promise.all([
      learningOverview(),
      listQuestions(),
      listReviewHistory(0),
      knowledgeStatistics(),
    ])

    learning.value = overview
    questions.value = questionList
    sheets.value = sheetList
    stats.value = knowledgeList
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

const ratedStats = computed(() => stats.value.filter((stat) => stat.score_rate !== null))

/** K3 已按得分率升序返回，这里**不再排序**。 */
const weakStats = computed(() => ratedStats.value.slice(0, 3))

/** 待完成卷的**全部**数量：下面的列表只展示 3 条，但计数不能跟着截断。 */
const pendingCount = computed(() => sheets.value.length)

const pendingSheets = computed(() => sheets.value.slice(0, 3))

const recentQuestions = computed(() =>
  [...questions.value]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5),
)

const isEmpty = computed(
  () => !loading.value && (learning.value?.total_questions ?? 0) === 0 && sheets.value.length === 0,
)

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="工作台"
      :description="`今天有 ${pendingCount} 份卷子没做，${learning?.unresolved_count ?? 0} 道题待解决。`"
    >
      <template #actions>
        <button class="btn btn--sm" type="button" @click="router.push({ name: 'review' })">
          <AppIcon name="fileText" :size="14" />
          复习卷
        </button>
      </template>
    </PageHeader>

    <ErrorBar v-if="error" :message="error" @retry="load" />

    <template v-if="loading">
      <div class="metrics">
        <div v-for="index in 3" :key="index" class="metric metric--skeleton" />
      </div>
      <section class="panel">
        <SkeletonList :rows="4" />
      </section>
    </template>

    <template v-else-if="isEmpty">
      <section class="panel">
        <EmptyState
          icon="camera"
          title="题库还是空的"
          description="拍一张试卷，框出题目并填写题干，就能存进题库。之后可以按知识点组卷复习。"
        >
          <template #action>
            <button class="btn btn--sm btn--primary" type="button" @click="router.push({ name: 'capture' })">
              录入第一道题
            </button>
          </template>
        </EmptyState>
      </section>
    </template>

    <template v-else>
      <div class="metrics">
        <button class="metric" type="button" @click="router.push({ name: 'questions' })">
          <span class="metric__label">待解决题目</span>
          <span class="metric__value">{{ learning?.unresolved_count ?? 0 }}</span>
          <span class="metric__meta">
            共 {{ learning?.total_questions ?? 0 }} 题 · 已解决 {{ learning?.resolved_count ?? 0 }}
          </span>
        </button>

        <button class="metric" type="button" @click="router.push({ name: 'review' })">
          <span class="metric__label">待完成复习卷</span>
          <span class="metric__value">{{ pendingCount }}</span>
          <span class="metric__meta">接着上次继续做</span>
        </button>

        <div class="metric">
          <span class="metric__label">累计得分率</span>
          <span class="metric__value">{{ formatRate(learning?.score_rate ?? null) }}</span>
          <span class="metric__meta">
            做过 {{ learning?.attempted_questions ?? 0 }} 题 · {{ learning?.attempt_count ?? 0 }} 次作答
          </span>
        </div>
      </div>

      <div class="split">
        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">继续学习</h2>
            <span class="panel__hint">没做完的复习卷</span>
          </div>

          <div v-if="pendingSheets.length > 0" class="rows">
            <button
              v-for="sheet in pendingSheets"
              :key="sheet.review_sheet_id"
              class="row"
              type="button"
              @click="router.push({ name: 'review-detail', params: { id: sheet.review_sheet_id } })"
            >
              <span class="row__body">
                <span class="row__title">{{ sheet.title || `复习卷 · ${formatDateTime(sheet.created_at)}` }}</span>
                <span class="row__meta">{{ sheet.question_count }} 题 · {{ formatDateTime(sheet.created_at) }}</span>
              </span>
              <span class="row__go">继续作答 ›</span>
            </button>
          </div>

          <EmptyState
            v-else
            icon="fileText"
            title="没有待完成的卷子"
            description="去生成一份，系统会挑你得分率最低的题。"
          >
            <template #action>
              <button class="btn btn--sm" type="button" @click="router.push({ name: 'review-new' })">
                生成复习卷
              </button>
            </template>
          </EmptyState>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">最薄弱的知识点</h2>
            <button class="panel__hint panel__link" type="button" @click="router.push({ name: 'analysis' })">
              全部 ›
            </button>
          </div>

          <div v-if="weakStats.length > 0" class="rows">
            <button
              v-for="stat in weakStats"
              :key="stat.knowledge_point_id"
              class="row"
              type="button"
              @click="router.push({ name: 'review-new', query: { knowledgePointId: stat.knowledge_point_id } })"
            >
              <span class="row__body">
                <span class="row__title">{{ stat.name }}</span>
                <span class="row__meta">{{ stat.question_count }} 题 · {{ stat.attempt_count }} 次作答</span>
              </span>
              <span class="row__side">
                <ScoreMeter :rate="stat.score_rate" :label="true" />
              </span>
            </button>
          </div>

          <EmptyState
            v-else
            icon="chart"
            title="还没有得分数据"
            description="做完一份卷子并交卷后，这里会列出最薄弱的知识点。"
          />
        </section>
      </div>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">最近入库</h2>
          <button class="panel__hint panel__link" type="button" @click="router.push({ name: 'questions' })">
            题库 ›
          </button>
        </div>

        <div v-if="recentQuestions.length > 0" class="rows">
          <button
            v-for="question in recentQuestions"
            :key="question.questionId"
            class="row"
            type="button"
            @click="router.push({ name: 'question-detail', params: { id: question.questionId } })"
          >
            <span class="row__body">
              <span class="row__title">{{ previewStem(question.stemMarkup) }}</span>
              <span class="row__meta">
                <span :class="question.status === 'resolved' ? 'badge badge--muted' : 'badge'">
                  {{ question.status === 'resolved' ? '已解决' : '待解决' }}
                </span>
                <span>{{ formatDateTime(question.createdAt) }}</span>
              </span>
            </span>
            <span class="row__go">打开 ›</span>
          </button>
        </div>

        <EmptyState
          v-else
          icon="layers"
          title="还没有题目"
          description="录入第一道题后，这里会显示最近入库的题目。"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.metric--skeleton {
  height: 92px;
  background: var(--bg-surface-hover);
  animation: metric-pulse 1.4s var(--ease) infinite;
}

@keyframes metric-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

.rows {
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  transition: background var(--duration) var(--ease);
}

.row:last-child {
  border-bottom: none;
}

.row:hover {
  background: var(--bg-surface-hover);
}

.row__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row__title {
  overflow: hidden;
  font-size: 12.5px;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
}

.row__side {
  flex: none;
  width: 118px;
}

.row__go {
  flex: none;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.row:hover .row__go {
  color: var(--text-primary);
}

.panel__link {
  color: var(--text-secondary);
  font-size: 11.5px;
}

.panel__link:hover {
  color: var(--text-primary);
}

@media (max-width: 720px) {
  .row__side {
    width: 84px;
  }
}
</style>
