<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import ScoreMeter from '@/components/common/ScoreMeter.vue'
import { knowledgeStatistics } from '@/api/knowledge'
import { labelStatistics } from '@/api/label'
import { errorMessage } from '@/api/http'
import { formatRate } from '@/utils/format'
import type { KnowledgeStat, LabelStat } from '@/api/types'

/**
 * 学情分析。
 *
 * 主表**直接消费 `K3` 的顺序**：接口已经按 `score_rate` 升序（最弱在前）、
 * 未练习的排最后。前端再排一次只会把「未练习」排到中间，把最该练的挤下去。
 *
 * 标签区用 `L7`：它同时给题目数、做过多少题、**通过率**。
 * 所以标签不是「分布图」，而是和知识点并列的第二个掌握度视图 ——
 * 两者的差别是维度不同（自由标签 vs 结构化知识点），不是「一个能看、一个不能看」。
 *
 * 两个下钻动作都指向「生成复习卷」而不是题库 —— `Q4` 不支持按标签 / 知识点筛题，
 * `O1` 才是接口真正能兑现「按这个范围练一次」的地方。
 */
const stats = ref<KnowledgeStat[]>([])
const tags = ref<LabelStat[]>([])

const loading = ref(true)
const error = ref('')

const tagLoading = ref(true)
const tagError = ref('')

const totalPoints = computed(() => stats.value.length)

/** 「练过」按作答次数判断：`score_rate` 为 null 与「考了 0 分」是两回事 */
const practiced = computed(() => stats.value.filter((point) => point.attempt_count > 0).length)

/** 加权平均：分母是各知识点的满分之和，不是简单平均各知识点的百分比 */
const averageRate = computed(() => {
  const score = stats.value.reduce((sum, point) => sum + (point.total_score ?? 0), 0)
  const max = stats.value.reduce((sum, point) => sum + (point.total_max_score ?? 0), 0)

  return max > 0 ? score / max : null
})

/** 专项练习 / 按此组卷：题量预填该范围题数，最多 10 题。 */
function practiceLink(query: { knowledgePointId?: number; tagId?: number }, count: number) {
  const params: Record<string, string> = {
    number: String(Math.min(Math.max(count, 1), 10)),
  }

  if (query.knowledgePointId) params.knowledgePointId = String(query.knowledgePointId)
  if (query.tagId) params.tagId = String(query.tagId)

  return { name: 'review-new', query: params }
}

async function loadStats(): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    stats.value = await knowledgeStatistics()
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

/** 标签区独立加载：`L7` 挂了不该让主表跟着消失。 */
async function loadTags(): Promise<void> {
  tagLoading.value = true
  tagError.value = ''

  try {
    tags.value = await labelStatistics()
  } catch (cause) {
    tagError.value = errorMessage(cause)
  } finally {
    tagLoading.value = false
  }
}

onMounted(() => {
  void loadStats()
  void loadTags()
})
</script>

<template>
  <div class="page">
    <PageHeader title="学情分析" description="按知识点掌握度排序，最薄弱的在最前面。" />

    <ErrorBar v-if="error" :message="error" @retry="loadStats" />

    <template v-else>
      <section class="summary">
        <div class="summary__item">
          <span class="summary__label">知识点</span>
          <b class="summary__value">{{ totalPoints }}</b>
        </div>
        <div class="summary__item">
          <span class="summary__label">练过</span>
          <b class="summary__value">{{ practiced }}</b>
        </div>
        <div class="summary__item">
          <span class="summary__label">平均得分率</span>
          <b class="summary__value">{{ averageRate === null ? '—' : formatRate(averageRate) }}</b>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">知识点掌握度</h2>
          <span class="panel__hint">最弱优先 · 共 {{ totalPoints }} 个</span>
        </div>

        <SkeletonList v-if="loading" :rows="4" />

        <template v-else-if="stats.length > 0">
          <div
            v-for="point in stats"
            :key="point.knowledge_point_id"
            class="kp"
          >
            <div class="kp__main">
              <span class="kp__name">{{ point.name }}</span>
              <span class="kp__meta">
                {{ point.question_count }} 题 ·
                {{ point.attempt_count > 0 ? `${point.attempt_count} 次作答` : '未作答' }}
              </span>
            </div>

            <ScoreMeter class="kp__meter" :rate="point.score_rate" />

            <RouterLink
              v-if="point.question_count > 0"
              class="btn btn--sm kp__action"
              :to="practiceLink({ knowledgePointId: point.knowledge_point_id }, point.question_count)"
            >
              专项练习
            </RouterLink>
            <span v-else class="kp__action kp__action--none">没有题目</span>
          </div>
        </template>

        <EmptyState
          v-else
          icon="target"
          title="还没有知识点"
          description="录入题目时给题目挂上知识点，这里就会按掌握度从弱到强排序。"
        >
          <template #action>
            <RouterLink class="btn btn--sm btn--primary" :to="{ name: 'capture' }">去录入</RouterLink>
          </template>
        </EmptyState>
      </section>

    </template>

    <section class="panel">
      <div class="panel__head">
        <h2 class="panel__title">标签掌握情况</h2>
        <span class="panel__hint">按题目数倒序 · 共 {{ tags.length }} 个</span>
      </div>

      <ErrorBar v-if="tagError" :message="tagError" @retry="loadTags" />

      <SkeletonList v-if="tagLoading" :rows="3" />

      <template v-else-if="tags.length > 0">
        <div v-for="tag in tags" :key="tag.tag_id" class="tag-row">
          <span class="tag-row__name">{{ tag.name }}</span>
          <span class="tag-row__meta">{{ tag.question_count }} 题</span>
          <ScoreMeter class="tag-row__meter" :rate="tag.score_rate" />
          <RouterLink
            v-if="tag.question_count > 0"
            class="btn btn--sm btn--ghost tag-row__action"
            :to="practiceLink({ tagId: tag.tag_id }, tag.question_count)"
          >
            按此组卷
          </RouterLink>
          <span v-else class="tag-row__action tag-row__action--none">没有题目</span>
        </div>
      </template>

      <EmptyState
        v-else
        icon="tag"
        title="还没有标签"
        description="标签是自由维度，录入或编辑题目时可以随手挂上。"
      />
    </section>

    <p class="note">
      得分率 = 该维度下所有已评分作答的得分 ÷ 满分。没做过的题不计入，
      所以「未练习」不等于 0%。标签与知识点是两套独立维度，同一道题可以同时挂在两边。
    </p>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  padding: 14px 18px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.summary__item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.summary__label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.summary__value {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.kp {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px 92px;
  gap: 16px;
  align-items: center;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-color);
  transition: background var(--duration) var(--ease);
}

.kp:last-child {
  border-bottom: none;
}

.kp:hover {
  background: var(--bg-surface-hover);
}

.kp__main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.kp__name {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kp__meta {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.kp__meter {
  min-width: 0;
}

.kp__action {
  justify-self: end;
}

.kp__action--none {
  font-size: 11px;
  color: var(--text-muted);
}

.tag-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px 190px 88px;
  gap: 14px;
  align-items: center;
  padding: 11px 16px;
  border-bottom: 1px solid var(--border-color);
}

.tag-row:last-child {
  border-bottom: none;
}

.tag-row:hover {
  background: var(--bg-surface-hover);
}

.tag-row__name {
  overflow: hidden;
  font-size: 12.5px;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-row__meta {
  font-size: 11.5px;
  color: var(--text-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.tag-row__meter {
  min-width: 0;
}

.tag-row__action {
  justify-self: end;
}

.tag-row__action--none {
  font-size: 11px;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .summary {
    gap: 20px;
  }

  .kp {
    grid-template-columns: minmax(0, 1fr) 92px;
    gap: 10px 12px;
  }

  .kp__meter {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .kp__action {
    grid-column: 2;
    grid-row: 1;
  }

  .tag-row {
    grid-template-columns: minmax(0, 1fr) 88px;
    gap: 8px 12px;
  }

  .tag-row__meta {
    display: none;
  }

  .tag-row__meter {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .tag-row__action {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
