<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import { listQuestions, searchQuestions } from '@/api/question'
import { errorMessage } from '@/api/http'
import { typeLabel } from '@/api/content'
import { formatDateTime, previewStem } from '@/utils/format'
import type { QuestionSummary, SearchResponse } from '@/api/types'

/**
 * 题库列表。
 *
 * 两个数据源，必须分清：
 * - `Q4` 全量列表（不分页、不带标签、只认 status）→ 前端分页 20 条；
 * - `Q1` ES 搜索（分页、只搜题干与选项、**不认 status**）→ 服务端分页。
 *
 * 所以「搜索」和「状态筛选」互斥：搜索时把状态按钮禁用并说明原因，
 * 而不是让用户点一个不会生效的按钮。
 */
const router = useRouter()

const PAGE_SIZE = 20

const keyword = ref('')
const status = ref<'' | 'unresolved' | 'resolved'>('')

const listItems = ref<QuestionSummary[]>([])
const searchResult = ref<SearchResponse | null>(null)

const mode = ref<'list' | 'search'>('list')
const page = ref(1)
const searchPage = ref(0)

const loading = ref(true)
const error = ref('')

const total = computed(() =>
  mode.value === 'search' ? (searchResult.value?.total ?? 0) : listItems.value.length,
)

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const currentPage = computed(() => (mode.value === 'search' ? searchPage.value + 1 : page.value))

/**
 * 两个数据源字段不同（`Q1` 没有 status / imageUrls / createdAt），
 * 在这里归一成一套展示模型，模板里就不用写 `'x' in item` 这种判断。
 */
interface RowView {
  id: number
  stem: string | null
  type: string | null
  choiceMode: string | null
  status: string | null
  createdAt: string | null
  thumb: string | null
}

const rows = computed<RowView[]>(() => {
  if (mode.value === 'search') {
    return (searchResult.value?.items ?? []).map((item) => ({
      id: item.questionId,
      stem: item.stemMarkup,
      type: item.type,
      choiceMode: item.choiceMode,
      status: null,
      createdAt: null,
      thumb: null,
    }))
  }

  const start = (page.value - 1) * PAGE_SIZE

  return listItems.value.slice(start, start + PAGE_SIZE).map((summary) => ({
    id: summary.questionId,
    stem: summary.stemMarkup,
    type: summary.type,
    choiceMode: summary.choiceMode,
    status: summary.status,
    createdAt: summary.createdAt,
    thumb: summary.imageUrls.length > 0 ? summary.imageUrls[0] : null,
  }))
})

/** 页码只显示一个窗口，避免 100 页时把工具栏挤爆。 */
const pageNumbers = computed(() => {
  const count = pageCount.value
  const current = currentPage.value

  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)

  const start = Math.max(1, Math.min(current - 2, count - 4))

  return Array.from({ length: 5 }, (_, index) => start + index)
})

async function loadList(): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    listItems.value = await listQuestions(status.value || undefined)
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function runSearch(targetPage = 0): Promise<void> {
  const value = keyword.value.trim()

  if (value === '') {
    mode.value = 'list'
    searchResult.value = null
    await loadList()
    return
  }

  loading.value = true
  error.value = ''
  mode.value = 'search'
  searchPage.value = targetPage

  try {
    searchResult.value = await searchQuestions({ keyword: value, page: targetPage, size: PAGE_SIZE })
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

let searchTimer: number | undefined

watch(keyword, (value) => {
  window.clearTimeout(searchTimer)

  if (value.trim() === '') {
    mode.value = 'list'
    searchResult.value = null
    page.value = 1
    void loadList()
    return
  }

  // 400ms 防抖：每敲一个字都打 ES 既慢又没必要。
  searchTimer = window.setTimeout(() => {
    void runSearch(0)
  }, 400)
})

watch(status, () => {
  if (mode.value !== 'list') return

  page.value = 1
  void loadList()
})

watch(total, () => {
  if (mode.value === 'list' && page.value > pageCount.value) {
    page.value = pageCount.value
  }
})

function exitSearch(): void {
  keyword.value = ''
}

function goPage(target: number): void {
  if (target < 1 || target > pageCount.value) return

  if (mode.value === 'search') {
    void runSearch(target - 1)
    return
  }

  page.value = target
}

function retry(): void {
  if (mode.value === 'search') {
    void runSearch(searchPage.value)
    return
  }

  void loadList()
}

onMounted(loadList)

onBeforeUnmount(() => window.clearTimeout(searchTimer))
</script>

<template>
  <div class="page">
    <PageHeader title="题库" :description="`共 ${total} 道题 · 按入库时间倒序`" />

    <section class="panel">
      <div class="toolbar">
        <label class="toolbar__search">
          <AppIcon class="toolbar__search-icon" name="search" :size="14" />
          <input
            v-model="keyword"
            class="input"
            type="search"
            placeholder="搜题干或选项…"
            spellcheck="false"
          />
        </label>

        <div class="segmented" :title="mode === 'search' ? '搜索接口不支持按状态筛选' : ''">
          <button
            class="segmented__item"
            :class="{ 'is-active': status === '' }"
            type="button"
            :disabled="mode === 'search'"
            @click="status = ''"
          >
            全部
          </button>
          <button
            class="segmented__item"
            :class="{ 'is-active': status === 'unresolved' }"
            type="button"
            :disabled="mode === 'search'"
            @click="status = 'unresolved'"
          >
            待解决
          </button>
          <button
            class="segmented__item"
            :class="{ 'is-active': status === 'resolved' }"
            type="button"
            :disabled="mode === 'search'"
            @click="status = 'resolved'"
          >
            已解决
          </button>
        </div>
      </div>

      <div v-if="mode === 'search'" class="notice">
        <span>搜索模式 · 共 {{ total }} 条 · 只匹配题干与选项，且不含状态筛选</span>
        <button class="notice__link" type="button" @click="exitSearch">退出搜索</button>
      </div>

      <ErrorBar v-if="error" :message="error" @retry="retry" />

      <SkeletonList v-if="loading" :rows="6" />

      <template v-else-if="!error">
        <div v-if="rows.length > 0" class="rows">
          <RouterLink
            v-for="item in rows"
            :key="item.id"
            class="row"
            :to="{ name: 'question-detail', params: { id: item.id } }"
          >
            <span class="row__thumb">
              <img v-if="item.thumb" class="row__image" :src="item.thumb" alt="" loading="lazy" />
            </span>

            <span class="row__body">
              <span class="row__title">{{ previewStem(item.stem) }}</span>
              <span class="row__meta">
                <span>{{ typeLabel(item.type, item.choiceMode) }}</span>
                <span v-if="item.status" :class="item.status === 'resolved' ? 'badge badge--muted' : 'badge'">
                  {{ item.status === 'resolved' ? '已解决' : '待解决' }}
                </span>
                <span v-if="item.createdAt">{{ formatDateTime(item.createdAt) }}</span>
              </span>
            </span>

            <span class="row__go">打开 ›</span>
          </RouterLink>
        </div>

        <EmptyState
          v-else-if="mode === 'search'"
          icon="search"
          title="没搜到匹配的题目"
          description="换个关键词，或者退出搜索看全部。刚保存的题目可能需要 1 秒后才搜得到。"
        >
          <template #action>
            <button class="btn btn--sm" type="button" @click="exitSearch">退出搜索</button>
          </template>
        </EmptyState>

        <EmptyState
          v-else
          icon="layers"
          :title="status === '' ? '这里还没有题目' : '这个状态下没有题目'"
          :description="
            status === ''
              ? '拍一张试卷、框出题目就能存进题库。录入页在 P2 阶段上线。'
              : '换个状态看看，或者去录入新题。'
          "
        >
          <template #action>
            <button class="btn btn--sm btn--primary" type="button" @click="router.push({ name: 'capture' })">
              <AppIcon name="camera" :size="14" />
              去录入
            </button>
          </template>
        </EmptyState>
      </template>

      <div v-if="!loading && !error && pageCount > 1" class="pager">
        <span>第 {{ currentPage }} / {{ pageCount }} 页 · 每页 {{ PAGE_SIZE }} 条</span>

        <div class="pager__btns">
          <button class="pager__btn" type="button" :disabled="currentPage === 1" @click="goPage(currentPage - 1)">
            ‹
          </button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="pager__btn"
            :class="{ 'is-active': number === currentPage }"
            type="button"
            @click="goPage(number)"
          >
            {{ number }}
          </button>
          <button
            class="pager__btn"
            type="button"
            :disabled="currentPage === pageCount"
            @click="goPage(currentPage + 1)"
          >
            ›
          </button>
        </div>
      </div>
    </section>

    <p class="note">
      搜索走 Elasticsearch，只搜题干与选项，不搜答案。题库不支持按标签筛选 ——
      标签与知识点的下钻入口是「生成复习卷」。
    </p>
  </div>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  transition: background var(--duration) var(--ease);
}

.row:last-child {
  border-bottom: none;
}

.row:hover {
  background: var(--bg-surface-hover);
}

.row__thumb {
  flex: none;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-app);
  background-image:
    linear-gradient(var(--border-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-color) 1px, transparent 1px);
  background-size: 9px 9px;
}

.row__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row__title {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-primary);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}

.row__go {
  flex: none;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.row:hover .row__go {
  color: var(--text-primary);
}

.notice__link {
  font-size: 11.5px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-strong);
}

.notice__link:hover {
  color: var(--text-primary);
}

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
  font-size: 11.5px;
  color: var(--text-muted);
}

.pager__btns {
  display: flex;
  gap: 4px;
}

.pager__btn {
  min-width: 26px;
  height: 26px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.pager__btn:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.pager__btn.is-active {
  border-color: var(--accent);
  color: var(--text-inverse);
  background: var(--accent);
}

.pager__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .row__thumb {
    display: none;
  }
}
</style>
