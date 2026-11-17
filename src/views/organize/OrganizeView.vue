<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import { askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import {
  createLabel,
  deleteLabel,
  labelStatistics,
  listLabels,
  mergeLabels,
  renameLabel,
  searchLabels,
} from '@/api/label'
import {
  createKnowledgePoint,
  deleteKnowledgePoint,
  knowledgeStatistics,
  listKnowledgePoints,
  renameKnowledgePoint,
  searchKnowledgePoints,
} from '@/api/knowledge'
import { errorMessage } from '@/api/http'
import { formatRate } from '@/utils/format'

/**
 * 整理：标签与知识点的维护。
 *
 * 三条来自接口的事实决定了这一页的形态：
 * 1. `L4` 改成重名会**直接 500**（后端没有前置校验）→ 前端必须先查重，不能等报错；
 * 2. `userid = 0` 是系统预置，改名 / 删除 / 合并一律返回 `false` → 按钮置灰，不让用户白点；
 * 3. `L2` / `K4` 空关键词等于全量 → 清空搜索框时不发请求，直接回列表。
 *
 * 所有写操作都只动「分类与题目的关联」，题目本身不受影响 —— 文案里要说清楚。
 */
type TabKey = 'tag' | 'knowledge'

interface Row {
  id: number
  name: string
  /** `userid = 0`：系统预置，只读 */
  system: boolean
  /** 题目数；搜索结果里如果基础列表没加载出来会是 `null` */
  count: number | null
  /** 通过率，标签（L7）与知识点（K3）都有；没挂题目时为 `null` */
  rate: number | null
}

const { push } = useToast()

const tab = ref<TabKey>('tag')

const tagRows = ref<Row[]>([])
const kpRows = ref<Row[]>([])

const tagLoading = ref(true)
const tagError = ref('')
const kpLoading = ref(true)
const kpError = ref('')

const keyword = ref('')
const searchRows = ref<Row[] | null>(null)
const searchLoading = ref(false)
const searchError = ref('')

const newName = ref('')
const creating = ref(false)
const createInput = ref<HTMLInputElement | null>(null)

const editingRow = ref<Row | null>(null)
const editingName = ref('')
const renaming = ref(false)
const renameInput = ref<HTMLInputElement | null>(null)

const deletingId = ref<number | null>(null)

const mergeSource = ref<Row | null>(null)
const mergeTargetId = ref<number | null>(null)
const merging = ref(false)

let searchTimer: number | undefined

const label = computed(() => (tab.value === 'tag' ? '标签' : '知识点'))

const loading = computed(() => (tab.value === 'tag' ? tagLoading.value : kpLoading.value))
const error = computed(() => (tab.value === 'tag' ? tagError.value : kpError.value))
const baseRows = computed(() => (tab.value === 'tag' ? tagRows.value : kpRows.value))
const rows = computed(() => searchRows.value ?? baseRows.value)

const mergeTargets = computed(() =>
  tagRows.value.filter((row) => row.id !== mergeSource.value?.id),
)

const mergeTarget = computed(
  () => mergeTargets.value.find((row) => row.id === mergeTargetId.value) ?? null,
)

const mergeDesc = computed(() => {
  const source = mergeSource.value
  if (!source) return ''

  const scope = source.count === null ? '它名下的题目' : `它名下的 ${source.count} 道题`
  const target = mergeTarget.value ? `「${mergeTarget.value.name}」` : '目标标签'

  return `「${source.name}」${scope}会并入${target}，「${source.name}」将被删除。题目本身不受影响。`
})

/** 题目数倒序；数量相同按名称排，避免每次刷新顺序乱跳。 */
function sortRows(list: Row[]): Row[] {
  return [...list].sort((a, b) => {
    const left = a.count ?? -1
    const right = b.count ?? -1

    if (right !== left) return right - left

    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
}

/** 标签和知识点的统计字段现在一致（题目数 + 通过率），提示文案也就一致了。 */
function metaText(row: Row): string {
  if (row.count === null) return '题目数未知'
  if (row.count === 0) return '0 题'

  return `${row.count} 题 · ${row.rate === null ? '未练习' : `得分率 ${formatRate(row.rate)}`}`
}

async function loadTags(): Promise<void> {
  tagLoading.value = true
  tagError.value = ''

  try {
    const [list, stats] = await Promise.all([listLabels(), labelStatistics()])
    const byId = new Map(stats.map((item) => [item.tag_id, item]))

    tagRows.value = sortRows(
      list.map((tag) => {
        const stat = byId.get(tag.tag_id)

        return {
          id: tag.tag_id,
          name: tag.name,
          system: tag.userid === 0,
          count: stat?.question_count ?? 0,
          rate: stat?.score_rate ?? null,
        }
      }),
    )
  } catch (cause) {
    tagError.value = errorMessage(cause)
  } finally {
    tagLoading.value = false
  }
}

async function loadKnowledge(): Promise<void> {
  kpLoading.value = true
  kpError.value = ''

  try {
    const [list, stats] = await Promise.all([listKnowledgePoints(), knowledgeStatistics()])
    const byId = new Map(stats.map((item) => [item.knowledge_point_id, item]))

    kpRows.value = sortRows(
      list.map((point) => {
        const stat = byId.get(point.knowledge_point_id)

        return {
          id: point.knowledge_point_id,
          name: point.name,
          system: point.userid === 0,
          count: stat?.question_count ?? 0,
          rate: stat?.score_rate ?? null,
        }
      }),
    )
  } catch (cause) {
    kpError.value = errorMessage(cause)
  } finally {
    kpLoading.value = false
  }
}

function reloadCurrent(): Promise<void> {
  return tab.value === 'tag' ? loadTags() : loadKnowledge()
}

/**
 * 服务端搜索。结果里的题目数从已加载的全量列表里 join ——
 * 搜索接口只返回 id / name，不带统计。
 */
async function runSearch(value: string): Promise<void> {
  if (value === '') return

  const currentTab = tab.value

  searchLoading.value = true
  searchError.value = ''

  try {
    if (currentTab === 'tag') {
      const list = await searchLabels(value)
      if (tab.value !== currentTab) return

      const byId = new Map(tagRows.value.map((row) => [row.id, row]))

      searchRows.value = sortRows(
        list.map((tag) => ({
          id: tag.tag_id,
          name: tag.name,
          system: tag.userid === 0,
          count: byId.get(tag.tag_id)?.count ?? null,
          rate: byId.get(tag.tag_id)?.rate ?? null,
        })),
      )
    } else {
      const list = await searchKnowledgePoints(value)
      if (tab.value !== currentTab) return

      const byId = new Map(kpRows.value.map((row) => [row.id, row]))

      searchRows.value = sortRows(
        list.map((point) => {
          const known = byId.get(point.knowledge_point_id)

          return {
            id: point.knowledge_point_id,
            name: point.name,
            system: point.userid === 0,
            count: known?.count ?? null,
            rate: known?.rate ?? null,
          }
        }),
      )
    }
  } catch (cause) {
    if (tab.value === currentTab) searchError.value = errorMessage(cause)
  } finally {
    if (tab.value === currentTab) searchLoading.value = false
  }
}

watch(keyword, () => {
  window.clearTimeout(searchTimer)
  searchError.value = ''

  const value = keyword.value.trim()

  // 空关键词等于全量，直接回列表，不发请求
  if (value === '') {
    searchRows.value = null
    searchLoading.value = false
    return
  }

  searchTimer = window.setTimeout(() => void runSearch(value), 300)
})

function switchTab(next: TabKey): void {
  if (tab.value === next) return

  tab.value = next
  keyword.value = ''
  searchRows.value = null
  searchError.value = ''
  editingRow.value = null
  mergeSource.value = null
}

async function create(): Promise<void> {
  const name = newName.value.trim()

  if (name === '') {
    push('名称不能为空')
    return
  }

  if (creating.value) return

  creating.value = true

  // 请求期间用户可能切 Tab，后续一律按发起时的 Tab 处理
  const currentTab = tab.value

  try {
    if (currentTab === 'tag') {
      const created = await createLabel(name)
      const existed = tagRows.value.some((row) => row.id === created.tag_id)

      push(existed ? '已存在同名标签' : '已创建标签')
    } else {
      const created = await createKnowledgePoint(name)
      const existed = kpRows.value.some((row) => row.id === created.knowledge_point_id)

      push(existed ? '已存在同名知识点' : '已创建知识点')
    }

    newName.value = ''
    keyword.value = ''
    await (currentTab === 'tag' ? loadTags() : loadKnowledge())
  } catch (cause) {
    push(errorMessage(cause))
  } finally {
    creating.value = false
  }
}

function setRenameInput(el: Element | ComponentPublicInstance | null): void {
  renameInput.value = el instanceof HTMLInputElement ? el : null
}

async function startRename(row: Row): Promise<void> {
  editingRow.value = row
  editingName.value = row.name

  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

function cancelRename(): void {
  editingRow.value = null
  editingName.value = ''
}

async function saveRename(): Promise<void> {
  const row = editingRow.value

  if (!row || renaming.value) return

  const name = editingName.value.trim()

  if (name === '') {
    push('名称不能为空')
    return
  }

  if (name === row.name) {
    cancelRename()
    return
  }

  // `L4` 重名会 500，这里先挡掉
  if (baseRows.value.some((item) => item.id !== row.id && item.name === name)) {
    push(tab.value === 'tag' ? '已有同名标签' : '已有同名知识点')
    return
  }

  renaming.value = true

  const currentTab = tab.value

  try {
    const result =
      currentTab === 'tag'
        ? await renameLabel(row.id, name)
        : await renameKnowledgePoint(row.id, name)

    if (!result.renamed) {
      push('改名失败，可能已经不存在')
      await (currentTab === 'tag' ? loadTags() : loadKnowledge())
      return
    }

    row.name = name

    // 搜索态下 `row` 是搜索结果里的副本，全量列表里的那条也要跟着改，
    // 否则清空搜索后会看到旧名字
    const base = (currentTab === 'tag' ? tagRows.value : kpRows.value).find(
      (item) => item.id === row.id,
    )

    if (base) base.name = name

    push('已改名')
    cancelRename()

    // 名字变了，重新跑一次搜索，避免结果里留着旧名字或旧匹配
    if (searchRows.value !== null && tab.value === currentTab) {
      void runSearch(keyword.value.trim())
    }
  } catch (cause) {
    push(errorMessage(cause))
  } finally {
    renaming.value = false
  }
}

async function remove(row: Row): Promise<void> {
  if (deletingId.value !== null) return

  const ok = await askConfirm({
    title: `删除${label.value}「${row.name}」？`,
    body: `只解除${label.value}与题目的关联，题目本身不会被删除。`,
    confirmText: '删除',
    danger: true,
  })

  if (!ok) return

  deletingId.value = row.id

  const currentTab = tab.value

  try {
    const result =
      currentTab === 'tag' ? await deleteLabel(row.id) : await deleteKnowledgePoint(row.id)

    if (!result.deleted) {
      push('没有删除成功，可能已经不存在')
      await (currentTab === 'tag' ? loadTags() : loadKnowledge())
      return
    }

    if (currentTab === 'tag') {
      tagRows.value = tagRows.value.filter((item) => item.id !== row.id)
    } else {
      kpRows.value = kpRows.value.filter((item) => item.id !== row.id)
    }

    if (searchRows.value !== null) {
      searchRows.value = searchRows.value.filter((item) => item.id !== row.id)
    }

    push('已删除')
  } catch (cause) {
    push(errorMessage(cause))
  } finally {
    deletingId.value = null
  }
}

function openMerge(row: Row): void {
  const candidates = tagRows.value.filter((item) => item.id !== row.id)

  if (candidates.length === 0) {
    push('没有可合并的目标标签')
    return
  }

  mergeSource.value = row
  mergeTargetId.value = candidates[0].id
}

function closeMerge(): void {
  if (merging.value) return

  mergeSource.value = null
}

async function confirmMerge(): Promise<void> {
  const source = mergeSource.value
  const target = mergeTarget.value

  if (!source || !target || merging.value) return

  merging.value = true

  try {
    const result = await mergeLabels(source.id, target.id)

    if (!result.merged) {
      push('合并失败：源标签必须是自己创建的，且目标标签仍然存在')
      return
    }

    push(`已把「${source.name}」并入「${target.name}」`)
    mergeSource.value = null
    await loadTags()

    if (searchRows.value !== null) void runSearch(keyword.value.trim())
  } catch (cause) {
    push(errorMessage(cause))
  } finally {
    merging.value = false
  }
}

function focusCreate(): void {
  createInput.value?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mergeSource.value) closeMerge()
}

onMounted(() => {
  void loadTags()
  void loadKnowledge()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="整理"
      description="改名、合并、删除都不会动题目本身，只调整分类与题目的关联。"
    />

    <section class="panel">
      <div class="tabs" role="tablist" aria-label="整理对象">
        <button
          class="tab"
          :class="{ 'is-active': tab === 'tag' }"
          type="button"
          role="tab"
          :aria-selected="tab === 'tag'"
          @click="switchTab('tag')"
        >
          标签
          <span v-if="!tagLoading" class="tab__count">{{ tagRows.length }}</span>
        </button>
        <button
          class="tab"
          :class="{ 'is-active': tab === 'knowledge' }"
          type="button"
          role="tab"
          :aria-selected="tab === 'knowledge'"
          @click="switchTab('knowledge')"
        >
          知识点
          <span v-if="!kpLoading" class="tab__count">{{ kpRows.length }}</span>
        </button>
      </div>

      <div class="toolbar">
        <label class="toolbar__search">
          <AppIcon class="toolbar__search-icon" name="search" :size="14" />
          <input
            v-model="keyword"
            class="input"
            type="search"
            :placeholder="`搜${label}…`"
            :disabled="loading || error !== ''"
            spellcheck="false"
          />
        </label>

        <div class="create">
          <input
            ref="createInput"
            v-model="newName"
            class="input create__input"
            type="text"
            maxlength="30"
            :placeholder="`新${label}名`"
            spellcheck="false"
            @keydown.enter.prevent="create"
          />
          <button class="btn btn--sm btn--primary" type="button" :disabled="creating" @click="create">
            新建
          </button>
        </div>
      </div>

      <div v-if="keyword.trim() !== ''" class="notice">
        <span>
          搜索「{{ keyword.trim() }}」
          <template v-if="searchLoading"> · 搜索中…</template>
          <template v-else> · {{ rows.length }} 条</template>
        </span>
        <button class="notice__link" type="button" @click="keyword = ''">清空搜索</button>
      </div>

      <SkeletonList v-if="loading" :rows="5" />

      <ErrorBar v-else-if="error" :message="error" @retry="reloadCurrent" />

      <ErrorBar
        v-else-if="searchError"
        :message="searchError"
        @retry="runSearch(keyword.trim())"
      />

      <div v-else-if="rows.length > 0" class="rows">
        <div v-for="row in rows" :key="row.id" class="row">
          <div class="row__main">
            <input
              v-if="editingRow?.id === row.id"
              :ref="setRenameInput"
              v-model="editingName"
              class="input row__input"
              type="text"
              maxlength="30"
              spellcheck="false"
              @keydown.enter.prevent="saveRename"
              @keydown.esc="cancelRename"
            />

            <template v-else>
              <span class="row__name">{{ row.name }}</span>
              <span v-if="row.system" class="badge badge--muted">系统</span>
            </template>
          </div>

          <span class="row__meta">{{ metaText(row) }}</span>

          <div class="row__actions">
            <template v-if="editingRow?.id === row.id">
              <button class="btn btn--sm btn--primary" type="button" :disabled="renaming" @click="saveRename">
                {{ renaming ? '保存中…' : '保存' }}
              </button>
              <button class="btn btn--sm btn--ghost" type="button" :disabled="renaming" @click="cancelRename">
                取消
              </button>
            </template>

            <template v-else>
              <button
                class="btn btn--sm btn--ghost"
                type="button"
                :disabled="row.system"
                :title="row.system ? '系统预置，不能修改' : ''"
                @click="startRename(row)"
              >
                改名
              </button>

              <button
                v-if="tab === 'tag'"
                class="btn btn--sm btn--ghost"
                type="button"
                :disabled="row.system"
                :title="row.system ? '系统标签不能作为合并源' : ''"
                @click="openMerge(row)"
              >
                合并
              </button>

              <button
                class="btn btn--sm btn--ghost"
                type="button"
                :disabled="row.system || deletingId === row.id"
                :title="row.system ? '系统预置，不能修改' : ''"
                @click="remove(row)"
              >
                删除
              </button>
            </template>
          </div>
        </div>
      </div>

      <EmptyState
        v-else-if="keyword.trim() !== ''"
        icon="search"
        :title="`没有匹配的${label}`"
        description="换个关键词，或者清空搜索看全部。"
      >
        <template #action>
          <button class="btn btn--sm" type="button" @click="keyword = ''">清空搜索</button>
        </template>
      </EmptyState>

      <EmptyState
        v-else
        icon="tag"
        :title="`还没有${label}`"
        :description="
          tab === 'tag'
            ? '新建一个标签，或者在录入、编辑题目时随手挂上。'
            : '新建一个知识点，录入题目时挂上它，学情分析就会按它统计。'
        "
      >
        <template #action>
          <button class="btn btn--sm btn--primary" type="button" @click="focusCreate">
            新建{{ label }}
          </button>
        </template>
      </EmptyState>
    </section>

    <p class="note">
      系统预置的{{ label }}（带「系统」标记）不能改名或删除<template v-if="tab === 'tag'">，但可以作为合并的目标</template>。
      删除只解除关联，题目本身不会被删除。
    </p>

    <Teleport to="body">
      <div v-if="mergeSource" class="merge-layer" @click.self="closeMerge">
        <section class="merge" role="dialog" aria-modal="true" aria-label="合并标签">
          <h2 class="merge__title">合并「{{ mergeSource.name }}」</h2>
          <p class="merge__desc">{{ mergeDesc }}</p>

          <label class="field">
            <span class="field__label">并入到</span>
            <select v-model.number="mergeTargetId" class="select">
              <option v-for="item in mergeTargets" :key="item.id" :value="item.id">
                {{ item.name }}（{{ item.count ?? 0 }} 题{{ item.system ? ' · 系统' : '' }}）
              </option>
            </select>
          </label>

          <div class="merge__actions">
            <button class="btn" type="button" :disabled="merging" @click="closeMerge">取消</button>
            <button
              class="btn btn--primary"
              type="button"
              :disabled="merging || !mergeTarget"
              @click="confirmMerge"
            >
              {{ merging ? '合并中…' : '合并并删除源标签' }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.create {
  display: flex;
  gap: 6px;
}

.create__input {
  width: 160px;
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

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 168px auto;
  gap: 12px;
  align-items: center;
  padding: 9px 16px;
  border-bottom: 1px solid var(--border-color);
  transition: background var(--duration) var(--ease);
}

.row:last-child {
  border-bottom: none;
}

.row:hover {
  background: var(--bg-surface-hover);
}

.row__main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.row__name {
  overflow: hidden;
  font-size: 12.5px;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__input {
  height: 28px;
  max-width: 260px;
  font-size: 12.5px;
}

.row__meta {
  font-size: 11.5px;
  color: var(--text-muted);
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.merge-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
}

.merge {
  width: 100%;
  max-width: 420px;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.merge__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.merge__desc {
  margin: 8px 0 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.merge__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

@media (max-width: 640px) {
  .create {
    width: 100%;
  }

  .create__input {
    flex: 1;
    width: auto;
  }

  .row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .row__meta {
    display: none;
  }
}
</style>
