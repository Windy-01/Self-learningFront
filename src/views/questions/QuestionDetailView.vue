<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import ChipPicker from '@/components/common/ChipPicker.vue'
import QuestionBody from '@/components/question/QuestionBody.vue'
import { askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import {
  addQuestionKnowledge,
  addQuestionTag,
  deleteQuestion,
  getQuestion,
  getQuestionHistory,
  removeQuestionKnowledge,
  removeQuestionTag,
  updateQuestion,
} from '@/api/question'
import { createLabel, listLabels } from '@/api/label'
import { createKnowledgePoint, listKnowledgePoints } from '@/api/knowledge'
import { errorMessage, isNotFound } from '@/api/http'
import {
  EDITOR_TYPES,
  contentOf,
  defaultOptions,
  stringifyContent,
  toEditorType,
  typeLabel,
  type EditorType,
} from '@/api/content'
import { formatDateTime, formatRate } from '@/utils/format'
import { hasMarkup, renderMarkup } from '@/utils/markup'
import type {
  AnswerRecordView,
  KnowledgePointEntity,
  QuestionDetail,
  QuestionOption,
  QuestionPatch,
  TagEntity,
} from '@/api/types'

/**
 * 题目详情。
 *
 * 这里是**唯一能看到答案的地方**（`Q5` 才有 `answer`），
 * 也是唯一能给题目挂标签 / 知识点的地方 —— 列表接口不返回这两样。
 *
 * 编辑是页面的一个状态，不是另一个页面：`Q6` 只提交改过的字段，
 * 因为 `null` 在接口语义里表示「不修改」而不是「清空」。
 */
const route = useRoute()
const router = useRouter()
const { push } = useToast()

const id = computed(() => Number(route.params.id))

const detail = ref<QuestionDetail | null>(null)
const history = ref<AnswerRecordView[]>([])
const allTags = ref<TagEntity[]>([])
const allKnowledge = ref<KnowledgePointEntity[]>([])

const loading = ref(true)
const error = ref('')
const notFound = ref(false)

const editing = ref(false)
const saving = ref(false)

const form = reactive({
  type: 'single' as EditorType,
  stem: '',
  options: [] as QuestionOption[],
  answer: '',
  source: '',
})

/** 预签名地址 30 分钟过期，加载失败的图单独记下来，不整页报错。 */
const failedImages = ref<string[]>([])

/** 编辑态的题干预览：跟录入页一致，按 Markdown + 公式渲染，改完立刻能看出效果 */
const stemPreview = computed(() => renderMarkup(form.stem))
const showStemPreview = computed(() => hasMarkup(form.stem))

const view = computed(() => contentOf(detail.value?.content ?? null))

const typeText = computed(() => typeLabel(view.value.type, view.value.choiceMode))

const statusText = computed(() => (detail.value?.status === 'resolved' ? '已解决' : '待解决'))

const tagItems = computed(() =>
  (detail.value?.tags ?? []).map((tag) => ({ id: tag.tag_id, name: tag.name, system: tag.userid === 0 })),
)

const knowledgeItems = computed(() =>
  (detail.value?.knowledgePoints ?? []).map((point) => ({
    id: point.knowledge_point_id,
    name: point.name,
    system: point.userid === 0,
  })),
)

const tagOptions = computed(() =>
  allTags.value.map((tag) => ({ id: tag.tag_id, name: tag.name, system: tag.userid === 0 })),
)

const knowledgeOptions = computed(() =>
  allKnowledge.value.map((point) => ({
    id: point.knowledge_point_id,
    name: point.name,
    system: point.userid === 0,
  })),
)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  notFound.value = false

  try {
    const [question, records] = await Promise.all([getQuestion(id.value), getQuestionHistory(id.value)])

    detail.value = question
    history.value = records
  } catch (cause) {
    if (isNotFound(cause)) {
      notFound.value = true
    } else {
      error.value = errorMessage(cause)
    }
  } finally {
    loading.value = false
  }
}

/** 选择器的候选列表，失败也不阻断主内容 —— 只是暂时挂不了标签。 */
async function loadOptions(): Promise<void> {
  try {
    const [tags, points] = await Promise.all([listLabels(), listKnowledgePoints()])

    allTags.value = tags
    allKnowledge.value = points
  } catch {
    /* 忽略：挂载时会提示「没有可添加的项」 */
  }
}

function startEdit(): void {
  if (!detail.value) return

  const current = contentOf(detail.value.content)

  form.type = toEditorType(current.type, current.choiceMode)
  form.stem = current.stem
  form.options = current.options.length > 0
    ? current.options.map((option) => ({ ...option }))
    : defaultOptions()
  form.answer = detail.value.answer ?? ''
  form.source = detail.value.source ?? ''

  editing.value = true
}

function cancelEdit(): void {
  editing.value = false
}

async function saveEdit(): Promise<void> {
  if (!detail.value) return

  const current = contentOf(detail.value.content)
  const originalType = toEditorType(current.type, current.choiceMode)
  const patch: QuestionPatch = {}

  const contentChanged =
    form.stem !== current.stem
    || form.type !== originalType
    || JSON.stringify(form.options) !== JSON.stringify(current.options)

  if (contentChanged) {
    patch.content = stringifyContent({ type: form.type, stem: form.stem, options: form.options })
  }

  if (form.answer !== (detail.value.answer ?? '')) patch.answer = form.answer
  if (form.source !== (detail.value.source ?? '')) patch.source = form.source

  if (Object.keys(patch).length === 0) {
    editing.value = false
    return
  }

  saving.value = true

  try {
    detail.value = await updateQuestion(id.value, patch)
    editing.value = false
    push(patch.content ? '已保存 · 搜索索引稍后更新' : '已保存')
  } catch (cause) {
    push(errorMessage(cause))
  } finally {
    saving.value = false
  }
}

async function toggleStatus(): Promise<void> {
  if (!detail.value) return

  const next = detail.value.status === 'resolved' ? 'unresolved' : 'resolved'

  try {
    detail.value = await updateQuestion(id.value, { status: next })
    push(next === 'resolved' ? '已标记为已解决' : '已改回待解决')
  } catch (cause) {
    push(errorMessage(cause))
  }
}

async function removeQuestion(): Promise<void> {
  const ok = await askConfirm({
    title: '删除这道题？',
    body: '删除后不可恢复：题干、图片、标签关联、作答记录与统计都会一并删除。复习卷里的题目快照不受影响。',
    confirmText: '删除',
    danger: true,
  })

  if (!ok) return

  try {
    const result = await deleteQuestion(id.value)

    push(result.deleted ? '题目已删除' : '这道题已经不存在了')
    void router.push({ name: 'questions' })
  } catch (cause) {
    push(errorMessage(cause))
  }
}

/* ---------------- 标签 / 知识点 ---------------- */

async function addTag(tagId: number): Promise<void> {
  if (!detail.value) return

  const tag = allTags.value.find((item) => item.tag_id === tagId)

  try {
    await addQuestionTag(id.value, tagId)

    if (tag && !detail.value.tags.some((item) => item.tag_id === tagId)) {
      detail.value = { ...detail.value, tags: [...detail.value.tags, tag] }
    }

    push(`已挂上「${tag?.name ?? tagId}」`)
  } catch (cause) {
    push(errorMessage(cause))
  }
}

async function removeTag(tagId: number): Promise<void> {
  if (!detail.value) return

  try {
    await removeQuestionTag(id.value, tagId)
    detail.value = {
      ...detail.value,
      tags: detail.value.tags.filter((item) => item.tag_id !== tagId),
    }
    push('已摘掉标签')
  } catch (cause) {
    push(errorMessage(cause))
  }
}

async function createTag(name: string): Promise<void> {
  try {
    const tag = await createLabel(name)

    if (!allTags.value.some((item) => item.tag_id === tag.tag_id)) {
      allTags.value = [...allTags.value, tag]
    }

    await addTag(tag.tag_id)
  } catch (cause) {
    push(errorMessage(cause))
  }
}

async function addKnowledge(pointId: number): Promise<void> {
  if (!detail.value) return

  const point = allKnowledge.value.find((item) => item.knowledge_point_id === pointId)

  try {
    await addQuestionKnowledge(id.value, pointId)

    if (point && !detail.value.knowledgePoints.some((item) => item.knowledge_point_id === pointId)) {
      detail.value = { ...detail.value, knowledgePoints: [...detail.value.knowledgePoints, point] }
    }

    push(`已关联「${point?.name ?? pointId}」`)
  } catch (cause) {
    push(errorMessage(cause))
  }
}

async function removeKnowledge(pointId: number): Promise<void> {
  if (!detail.value) return

  try {
    await removeQuestionKnowledge(id.value, pointId)
    detail.value = {
      ...detail.value,
      knowledgePoints: detail.value.knowledgePoints.filter(
        (item) => item.knowledge_point_id !== pointId,
      ),
    }
    push('已解除关联')
  } catch (cause) {
    push(errorMessage(cause))
  }
}

async function createKnowledge(name: string): Promise<void> {
  try {
    const point = await createKnowledgePoint(name)

    if (!allKnowledge.value.some((item) => item.knowledge_point_id === point.knowledge_point_id)) {
      allKnowledge.value = [...allKnowledge.value, point]
    }

    await addKnowledge(point.knowledge_point_id)
  } catch (cause) {
    push(errorMessage(cause))
  }
}

/* ---------------- 选项编辑 ---------------- */

function addOption(): void {
  form.options.push({ key: String.fromCharCode(65 + form.options.length), markup: '' })
}

function removeOption(index: number): void {
  form.options.splice(index, 1)
}

/* ---------------- 图片 ---------------- */

function markImageFailed(url: string): void {
  if (!failedImages.value.includes(url)) {
    failedImages.value = [...failedImages.value, url]
  }
}

onMounted(() => {
  void load()
  void loadOptions()
})
</script>

<template>
  <div class="page">
    <div>
      <RouterLink class="back" :to="{ name: 'questions' }">‹ 返回题库</RouterLink>

      <PageHeader
        :title="detail ? `题目 #${detail.questionId}` : '题目详情'"
        :description="detail ? `${typeText} · ${formatDateTime(detail.createdAt)} 入库` : ''"
      >
        <template #actions>
          <template v-if="editing">
            <button class="btn btn--sm btn--ghost" type="button" :disabled="saving" @click="cancelEdit">
              取消
            </button>
            <button class="btn btn--sm btn--primary" type="button" :disabled="saving" @click="saveEdit">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </template>
          <template v-else-if="detail">
            <button class="btn btn--sm" type="button" @click="startEdit">编辑</button>
            <button class="btn btn--sm btn--danger" type="button" @click="removeQuestion">删除</button>
          </template>
        </template>
      </PageHeader>
    </div>

    <SkeletonList v-if="loading" :rows="4" />

    <ErrorBar v-else-if="error" :message="error" @retry="load" />

    <EmptyState
      v-else-if="notFound"
      icon="layers"
      title="这道题不存在"
      description="可能已经被删除了，或者不属于当前学生。"
    >
      <template #action>
        <RouterLink class="btn btn--sm" :to="{ name: 'questions' }">回题库</RouterLink>
      </template>
    </EmptyState>

    <template v-else-if="detail">
      <div class="detail">
        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">题目</h2>
            <span class="panel__hint">图片为预签名地址，30 分钟过期</span>
          </div>

          <div class="panel__body">
            <div v-if="detail.imageUrls.length > 0" class="images">
              <template v-for="url in detail.imageUrls" :key="url">
                <div v-if="failedImages.includes(url)" class="image-failed">
                  <span>图片已过期</span>
                  <button class="btn btn--sm btn--ghost" type="button" @click="load">刷新</button>
                </div>
                <img v-else class="image" :src="url" alt="题目图片" @error="markImageFailed(url)" />
              </template>
            </div>

            <!-- 查看态 -->
            <template v-if="!editing">
              <QuestionBody :content="detail.content" />

              <div class="answer-box">
                <p class="answer-box__label">答案</p>
                <p v-if="detail.answer" class="answer-box__body">{{ detail.answer }}</p>
                <p v-else class="answer-box__empty">还没录答案</p>

                <div v-if="detail.answerImageUrls.length > 0" class="images images--answer">
                  <template v-for="url in detail.answerImageUrls" :key="url">
                    <div v-if="failedImages.includes(url)" class="image-failed">
                      <span>答案图片已过期</span>
                    </div>
                    <img v-else class="image" :src="url" alt="答案图片" @error="markImageFailed(url)" />
                  </template>
                </div>
              </div>
            </template>

            <!-- 编辑态 -->
            <div v-else class="editor">
              <label class="field">
                <span class="field__label">题干</span>
                <textarea
                  v-model="form.stem"
                  class="input"
                  rows="4"
                  placeholder="题干，支持 Markdown 与 $…$ 公式"
                />
              </label>

              <div v-if="showStemPreview" class="editor-preview">
                <span class="editor-preview__label">预览</span>
                <div class="editor-preview__body md-body" v-html="stemPreview" />
              </div>

              <div class="editor__row">
                <label class="field">
                  <span class="field__label">题型</span>
                  <select v-model="form.type" class="select">
                    <option v-for="option in EDITOR_TYPES" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="field">
                  <span class="field__label">来源</span>
                  <input v-model="form.source" class="input" type="text" placeholder="如 2026 秋期中考" />
                </label>
              </div>

              <div v-if="form.type === 'single' || form.type === 'multiple'" class="field">
                <span class="field__label">选项</span>
                <div class="options-editor">
                  <div v-for="(option, index) in form.options" :key="index" class="options-editor__row">
                    <input v-model="option.key" class="input options-editor__key" type="text" maxlength="2" />
                    <input v-model="option.markup" class="input" type="text" placeholder="选项内容" />
                    <button
                      class="btn btn--sm btn--ghost"
                      type="button"
                      :disabled="form.options.length <= 2"
                      @click="removeOption(index)"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <button class="btn btn--sm btn--ghost options-editor__add" type="button" @click="addOption">
                  + 增加选项
                </button>
              </div>

              <label class="field">
                <span class="field__label">答案</span>
                <textarea v-model="form.answer" class="input" rows="3" placeholder="答案或解析正文" />
                <span class="field__hint">留空会写成空字符串 —— 接口不支持把答案清成 null。</span>
              </label>

              <p class="note">只提交改动过的字段。图片不能在编辑态更换：详情接口不返回图片 key，要换图只能重建题目。</p>
            </div>
          </div>
        </section>

        <div class="side">
          <section class="panel">
            <div class="panel__body panel__body--tight">
              <div class="kv">
                <span class="kv__k">状态</span>
                <button class="kv__link" type="button" @click="toggleStatus">
                  {{ statusText }} · 点击切换
                </button>
              </div>
              <div class="kv">
                <span class="kv__k">来源</span>
                <span class="kv__v">{{ detail.source || '—' }}</span>
              </div>
              <div class="kv">
                <span class="kv__k">创建</span>
                <span class="kv__v">{{ formatDateTime(detail.createdAt) }}</span>
              </div>
              <div class="kv">
                <span class="kv__k">得分率</span>
                <span class="kv__v">
                  {{ detail.stat ? `${formatRate(detail.stat.score_rate)} · ${detail.stat.attempt_count} 次` : '未练习' }}
                </span>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="side-block">
              <div class="side-block__head">
                <span class="side-block__title">标签</span>
                <span class="side-block__hint">自由维度</span>
              </div>
              <ChipPicker
                :items="tagItems"
                :options="tagOptions"
                placeholder="未打标签"
                @add="addTag"
                @remove="removeTag"
                @create="createTag"
              />
            </div>

            <div class="side-block">
              <div class="side-block__head">
                <span class="side-block__title">知识点</span>
                <span class="side-block__hint">用于统计与抽题</span>
              </div>
              <ChipPicker
                :items="knowledgeItems"
                :options="knowledgeOptions"
                placeholder="未关联知识点"
                @add="addKnowledge"
                @remove="removeKnowledge"
                @create="createKnowledge"
              />
            </div>
          </section>
        </div>
      </div>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">作答历史</h2>
          <span class="panel__hint">{{ history.length }} 条 · 接口无时间字段，按次数编号</span>
        </div>

        <div v-if="history.length > 0" class="history">
          <div v-for="(record, index) in history" :key="record.answerRecordId" class="history__item">
            <span class="history__no">第 {{ history.length - index }} 次</span>
            <span class="history__ans">{{ record.userAnswer || '未作答' }}</span>
            <span class="history__score">
              {{ record.score === null || record.maxScore === null ? '未评分' : `${record.score} / ${record.maxScore}` }}
            </span>
          </div>
        </div>

        <EmptyState
          v-else
          icon="chart"
          title="还没有作答记录"
          description="做一份包含这道题的复习卷并交卷后，这里会出现记录。"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.detail {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel__body--tight {
  padding: 6px 16px;
}

.images {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.images--answer {
  margin: 10px 0 0;
}

.image {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-app);
}

.image-failed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 11.5px;
  color: var(--text-muted);
}

.answer-box {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--border-color);
}

.answer-box__label {
  margin-bottom: 5px;
  font-size: 10.5px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.answer-box__body {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.answer-box__empty {
  font-size: 12.5px;
  color: var(--text-muted);
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor__row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 10px;
}

/* 编辑态预览：排版交给全局 .md-body，这里只管容器 */
.editor-preview {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 11px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-app);
}

.editor-preview__label {
  font-size: 10.5px;
  color: var(--text-muted);
}

.editor-preview__body {
  min-width: 0;
  font-size: 13px;
  line-height: 1.85;
  color: var(--text-primary);
  overflow-x: auto;
}

.options-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.options-editor__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.options-editor__key {
  width: 44px;
  flex: none;
  text-align: center;
}

.options-editor__add {
  align-self: flex-start;
  margin-top: 2px;
}

.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.kv:last-child {
  border-bottom: none;
}

.kv__k {
  font-size: 11.5px;
  color: var(--text-muted);
}

.kv__v {
  color: var(--text-primary);
  text-align: right;
}

.kv__link {
  font-size: 12px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-strong);
}

.side-block {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.side-block:last-child {
  border-bottom: none;
}

.side-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}

.side-block__title {
  font-size: 11px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.side-block__hint {
  font-size: 10.5px;
  color: var(--text-muted);
}

.history {
  display: flex;
  flex-direction: column;
}

.history__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.history__item:last-child {
  border-bottom: none;
}

.history__no {
  flex: none;
  width: 54px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.history__ans {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history__score {
  flex: none;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 960px) {
  .detail {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
