<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import { askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { deleteReviewSheet, listReviewHistory } from '@/api/review'
import { errorMessage } from '@/api/http'
import {
  formatDateTime,
  formatRate,
  formatScorePair,
  reviewSheetTitle,
} from '@/utils/format'
import { clearReviewDraft } from '@/utils/reviewDraft'
import type { ReviewSheetEntity } from '@/api/types'

/**
 * 复习卷列表。
 *
 * `O6` 一次返回全部状态（不分页），所以在客户端按状态分组：
 * 三个 Tab 的计数需要全量数据，分三次请求反而更慢、更容易不一致。
 *
 * 卡片点哪儿都进同一个地址 —— `/review/:id` 会按卷子状态自己分流成作答或结果，
 * 列表不需要替用户判断「该去哪」。
 */
type TabKey = 'pending' | 'done' | 'canceled'

const TABS: { key: TabKey; label: string; statuses: number[] }[] = [
  { key: 'pending', label: '待完成', statuses: [0, 1] },
  { key: 'done', label: '已完成', statuses: [2] },
  { key: 'canceled', label: '已作废', statuses: [3] },
]

const { push } = useToast()

const sheets = ref<ReviewSheetEntity[]>([])
const loading = ref(true)
const error = ref('')
const active = ref<TabKey>('pending')
const deletingId = ref<number | null>(null)

const grouped = computed<Record<TabKey, ReviewSheetEntity[]>>(() => {
  const result: Record<TabKey, ReviewSheetEntity[]> = {
    pending: [],
    done: [],
    canceled: [],
  }

  for (const sheet of sheets.value) {
    const tab = TABS.find((item) => item.statuses.includes(sheet.status))

    if (tab) result[tab.key].push(sheet)
  }

  return result
})

const counts = computed<Record<TabKey, number>>(() => ({
  pending: grouped.value.pending.length,
  done: grouped.value.done.length,
  canceled: grouped.value.canceled.length,
}))

const visible = computed(() =>
  [...grouped.value[active.value]].sort((a, b) => b.review_sheet_id - a.review_sheet_id),
)

function goText(sheet: ReviewSheetEntity): string {
  if (sheet.status === 2) return '查看结果 ›'
  if (sheet.status === 3) return '查看 ›'

  return '继续作答 ›'
}

function metaText(sheet: ReviewSheetEntity): string {
  const count = `${sheet.question_count} 题`

  if (sheet.status === 2) {
    return `${count} · ${formatDateTime(sheet.submitted_at)} 交卷`
  }

  return `${count} · 创建于 ${formatDateTime(sheet.created_at)}`
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    sheets.value = await listReviewHistory()
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function remove(sheet: ReviewSheetEntity): Promise<void> {
  if (deletingId.value !== null) return

  const ok = await askConfirm({
    title: '删除这份卷子？',
    body: '卷子删掉后，这次作答的成绩不再单独保留（题目本身的作答记录还在）。',
    confirmText: '删除',
    danger: true,
  })

  if (!ok) return

  deletingId.value = sheet.review_sheet_id

  try {
    const result = await deleteReviewSheet(sheet.review_sheet_id)

    if (!result.deleted) {
      push('没有删除成功，可能已经不在了')
      await load()
      return
    }

    clearReviewDraft(sheet.review_sheet_id)
    sheets.value = sheets.value.filter((item) => item.review_sheet_id !== sheet.review_sheet_id)
    push('已删除')
  } catch (cause) {
    push(errorMessage(cause))
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="复习卷"
      description="系统按得分率从低到高抽题，越薄弱越先出现。"
    >
      <template #actions>
        <RouterLink class="btn btn--primary" :to="{ name: 'review-new' }">
          <AppIcon name="plus" :size="14" :stroke-width="2" />
          生成复习卷
        </RouterLink>
      </template>
    </PageHeader>

    <section class="panel">
      <div class="tabs" role="tablist" aria-label="复习卷状态">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="tab"
          :class="{ 'is-active': active === tab.key }"
          type="button"
          role="tab"
          :aria-selected="active === tab.key"
          @click="active = tab.key"
        >
          {{ tab.label }}
          <span class="tab__count">{{ counts[tab.key] }}</span>
        </button>
      </div>

      <ErrorBar v-if="error" :message="error" @retry="load" />

      <SkeletonList v-if="loading" :rows="4" />

      <template v-else-if="!error">
        <div v-if="visible.length > 0" class="sheets">
          <div v-for="sheet in visible" :key="sheet.review_sheet_id" class="sheet">
            <RouterLink
              class="sheet__link"
              :to="{ name: 'review-detail', params: { id: sheet.review_sheet_id } }"
            >
              <div class="sheet__body">
                <div class="sheet__title">
                  {{ reviewSheetTitle(sheet.title, sheet.created_at) }}
                </div>
                <div class="sheet__meta">{{ metaText(sheet) }}</div>
              </div>

              <div v-if="sheet.status === 2" class="sheet__rate">
                <b>{{ formatRate(sheet.score_rate) }}</b>
                <span>{{ formatScorePair(sheet.total_score, sheet.total_max_score) }}</span>
              </div>
              <!-- 状态由 Tab 表达；只有「作答中」需要额外说明，因为它混在待完成里 -->
              <span v-else-if="sheet.status === 1" class="badge">作答中</span>

              <span class="sheet__go">{{ goText(sheet) }}</span>
            </RouterLink>

            <button
              class="sheet__del"
              type="button"
              aria-label="删除这份卷子"
              :disabled="deletingId === sheet.review_sheet_id"
              @click="remove(sheet)"
            >
              <AppIcon name="trash" :size="14" :stroke-width="1.6" />
            </button>
          </div>
        </div>

        <EmptyState
          v-else-if="active === 'pending'"
          icon="fileText"
          title="没有待完成的卷子"
          description="生成一份复习卷，系统会按得分率从低到高抽题。"
        >
          <template #action>
            <RouterLink class="btn btn--sm btn--primary" :to="{ name: 'review-new' }">
              生成复习卷
            </RouterLink>
          </template>
        </EmptyState>

        <EmptyState
          v-else-if="active === 'done'"
          icon="fileText"
          title="还没有交过卷"
          description="做完一份卷子并交卷后，成绩会出现在这里。"
        />

        <EmptyState
          v-else
          icon="fileText"
          title="没有作废的卷子"
          description="作废只发生在作答页，作废后不能继续作答，也不能交卷。"
        />
      </template>
    </section>

    <p class="note">
      删除卷子不会删掉题目本身；题目被修改或删除后，这张卷的判分依据仍是抽题当时的快照。
    </p>
  </div>
</template>

<style scoped>
.sheets {
  display: flex;
  flex-direction: column;
}

.sheet {
  display: flex;
  align-items: center;
  padding-right: 14px;
  border-bottom: 1px solid var(--border-color);
  transition: background var(--duration) var(--ease);
}

.sheet:last-child {
  border-bottom: none;
}

.sheet:hover {
  background: var(--bg-surface-hover);
}

.sheet__link {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 14px 0 14px 16px;
  outline: none;
}

.sheet__link:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent-border);
}

.sheet__body {
  flex: 1;
  min-width: 0;
}

.sheet__title {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet__meta {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.sheet__rate {
  flex: none;
  min-width: 64px;
  text-align: right;
}

.sheet__rate b {
  display: block;
  font-size: 16px;
  letter-spacing: -0.3px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.sheet__rate span {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.sheet__go {
  flex: none;
  min-width: 62px;
  font-size: 11.5px;
  color: var(--text-secondary);
  text-align: right;
  white-space: nowrap;
}

.sheet:hover .sheet__go {
  color: var(--text-primary);
}

.sheet__del {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

.sheet__del:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-app);
}

.sheet__del:disabled {
  opacity: 0.4;
}

@media (max-width: 640px) {
  .sheet {
    padding-right: 10px;
  }

  .sheet__link {
    gap: 10px;
    padding: 12px 0 12px 12px;
  }

  .sheet__go {
    display: none;
  }
}
</style>
