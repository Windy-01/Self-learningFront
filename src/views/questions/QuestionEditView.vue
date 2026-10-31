<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import {
  fetchRecognizeTask,
  saveQuestions,
  type RecognizedQuestion,
  type RecognizePage,
  type RecognizeTask,
} from '@/api/recognize'

/**
 * 题目编辑。
 *
 * 数据来自 `api/recognize.ts`：拍照页提交后拿到 taskId，这里按 id 取回识别结果。
 * 一次任务可以有多页，左侧按页分组编辑，右侧跟着当前页显示原图。
 * 后端未接入前，每页是一道字段全空的题，所有输入框都是空文本框。
 */
const route = useRoute()

const taskId = computed(() => {
  const value = route.query.task

  return typeof value === 'string' ? value : ''
})

const task = ref<RecognizeTask | null>(null)
const pages = ref<RecognizePage[]>([])
const activePageId = ref('')
const isLoading = ref(true)
const isSaving = ref(false)
const notice = ref('')
const error = ref('')

const totalQuestions = computed(() =>
  pages.value.reduce((sum, page) => sum + page.questions.length, 0),
)

/** 已填写内容的题数，用于页头进度提示。 */
const filledCount = computed(() =>
  pages.value.reduce(
    (sum, page) =>
      sum + page.questions.filter((item) => item.stem.trim() !== '' || item.answer.trim() !== '')
        .length,
    0,
  ),
)

const activePage = computed(
  () => pages.value.find((page) => page.pageId === activePageId.value) ?? pages.value[0] ?? null,
)

const activePageIndex = computed(() =>
  Math.max(
    0,
    pages.value.findIndex((page) => page.pageId === activePageId.value),
  ),
)

let idSeed = 0

function createId(): string {
  idSeed += 1

  return `q-${Date.now().toString(36)}-${idSeed}`
}

function createQuestion(pageId: string, index: number): RecognizedQuestion {
  return {
    id: createId(),
    pageId,
    number: String(index + 1),
    stem: '',
    options: ['', '', '', ''],
    answer: '',
    region: null,
  }
}

function optionLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}

function addQuestion(page: RecognizePage): void {
  page.questions.push(createQuestion(page.pageId, page.questions.length))
  activePageId.value = page.pageId
}

function removeQuestion(page: RecognizePage, index: number): void {
  page.questions.splice(index, 1)
}

function addOption(question: RecognizedQuestion): void {
  question.options.push('')
}

function removeOption(question: RecognizedQuestion, index: number): void {
  question.options.splice(index, 1)
}

function focusPage(page: RecognizePage): void {
  activePageId.value = page.pageId
}

async function load(): Promise<void> {
  if (taskId.value === '') {
    isLoading.value = false

    return
  }

  try {
    const result = await fetchRecognizeTask(taskId.value)

    if (result === null) {
      error.value = '识别任务已失效，请重新上传图片。'

      return
    }

    task.value = result
    // 深拷贝一层，避免编辑时直接改到数据源里的对象。
    pages.value = result.pages.map((page) => ({
      ...page,
      questions: page.questions.map((item) => ({ ...item, options: [...item.options] })),
    }))
    activePageId.value = pages.value[0]?.pageId ?? ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '识别结果加载失败。'
  } finally {
    isLoading.value = false
  }
}

async function save(): Promise<void> {
  if (isSaving.value || taskId.value === '') return

  isSaving.value = true
  notice.value = ''
  error.value = ''

  try {
    const questions = pages.value.flatMap((page) => page.questions)
    const result = await saveQuestions({ taskId: taskId.value, questions })

    notice.value = `已保存 ${result.saved} 道题`

    window.setTimeout(() => {
      notice.value = ''
    }, 2400)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败，请稍后重试。'
  } finally {
    isSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page edit-page">
    <PageHeader
      title="题目编辑"
      description="校对后端识别出的题干、选项与答案。识别结果为空时可以直接手动录入。"
      :tag="totalQuestions > 0 ? `${filledCount} / ${totalQuestions} 已填写` : undefined"
    >
      <template #actions>
        <span v-if="notice" class="edit-notice">{{ notice }}</span>
        <button
          class="btn btn--primary"
          type="button"
          :disabled="isSaving || totalQuestions === 0"
          @click="save"
        >
          <AppIcon name="save" :size="15" />
          {{ isSaving ? '保存中…' : '保存题目' }}
        </button>
      </template>
    </PageHeader>

    <p v-if="error" class="edit-error">{{ error }}</p>

    <section v-if="taskId === ''" class="panel">
      <EmptyState
        icon="upload"
        title="还没有识别任务"
        description="先在拍照上传页选择试卷照片并提交识别，结果会出现在这里。"
      >
        <template #action>
          <RouterLink class="btn btn--primary" :to="{ name: 'capture' }">去拍照上传</RouterLink>
        </template>
      </EmptyState>
    </section>

    <section v-else-if="isLoading" class="panel">
      <p class="edit-loading">正在读取识别结果…</p>
    </section>

    <section v-else-if="task === null" class="panel">
      <EmptyState
        icon="fileText"
        title="识别任务已失效"
        description="任务可能已过期或被清理，重新上传一张试卷照片即可。"
      >
        <template #action>
          <RouterLink class="btn btn--primary" :to="{ name: 'capture' }">重新上传</RouterLink>
        </template>
      </EmptyState>
    </section>

    <div v-else class="split split--wide-left">
      <section class="editor">
        <div v-for="(page, pageIndex) in pages" :key="page.pageId" class="page-group">
          <header class="page-group__head">
            <button
              class="page-group__tab"
              :class="{ 'is-active': page.pageId === activePageId }"
              type="button"
              @click="focusPage(page)"
            >
              第 {{ pageIndex + 1 }} 页
            </button>
            <span class="page-group__count">{{ page.questions.length }} 题</span>
          </header>

          <article
            v-for="(question, index) in page.questions"
            :key="question.id"
            class="panel qcard"
            @focusin="focusPage(page)"
            @click="focusPage(page)"
          >
            <div class="panel__head qcard__head">
              <div class="qcard__title">
                <span class="qcard__index">{{ index + 1 }}</span>
                <input
                  v-model="question.number"
                  class="input qcard__number"
                  type="text"
                  placeholder="题号"
                  aria-label="题号"
                />
              </div>

              <button
                class="btn btn--sm btn--ghost"
                type="button"
                @click="removeQuestion(page, index)"
              >
                <AppIcon name="trash" :size="14" />
                删除
              </button>
            </div>

            <div class="panel__body qcard__body">
              <label class="field">
                <span class="field__label">题干</span>
                <textarea
                  v-model="question.stem"
                  class="input qcard__textarea"
                  rows="3"
                  placeholder="请输入题干，可包含公式与配图说明"
                />
              </label>

              <div class="field">
                <span class="field__label">选项</span>

                <div v-if="question.options.length > 0" class="options">
                  <div v-for="position in question.options.length" :key="position" class="option">
                    <span class="option__key">{{ optionLabel(position - 1) }}</span>
                    <input
                      v-model="question.options[position - 1]"
                      class="input"
                      placeholder="选项内容"
                    />
                    <button
                      class="option__remove"
                      type="button"
                      title="删除该选项"
                      @click="removeOption(question, position - 1)"
                    >
                      <AppIcon name="close" :size="13" />
                    </button>
                  </div>
                </div>

                <button class="chip chip--add option__add" type="button" @click="addOption(question)">
                  <AppIcon name="plus" :size="12" />
                  添加选项
                </button>
              </div>

              <label class="field">
                <span class="field__label">答案</span>
                <input v-model="question.answer" class="input" placeholder="请输入答案" />
              </label>
            </div>
          </article>

          <button class="add-question" type="button" @click="addQuestion(page)">
            <AppIcon name="plus" :size="16" />
            在第 {{ pageIndex + 1 }} 页添加题目
          </button>
        </div>
      </section>

      <aside class="side">
        <section v-if="activePage" class="panel">
          <div class="panel__head">
            <h2 class="panel__title">原图</h2>
            <span class="panel__hint">
              第 {{ activePageIndex + 1 }} / {{ pages.length }} 页 · {{ activePage.width }} ×
              {{ activePage.height }}
            </span>
          </div>
          <div class="panel__body">
            <img
              class="side__image"
              :src="activePage.imageUrl"
              :alt="`第 ${activePageIndex + 1} 页`"
            />
          </div>
        </section>

        <div v-if="pages.length > 1" class="thumbs">
          <button
            v-for="(page, index) in pages"
            :key="page.pageId"
            class="thumb"
            :class="{ 'is-active': page.pageId === activePageId }"
            type="button"
            @click="focusPage(page)"
          >
            <img :src="page.imageUrl" :alt="`第 ${index + 1} 页`" />
            <span class="thumb__index">{{ index + 1 }}</span>
          </button>
        </div>

        <p class="note">
          识别结果由后端 OCR 返回，当前为占位数据，字段均为空，可直接录入。
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.edit-page {
  max-width: 1180px;
}

.edit-notice {
  font-size: 12px;
  color: var(--text-muted);
}

.edit-error {
  font-size: 12px;
  color: var(--text-primary);
}

.edit-loading {
  padding: 56px 20px;
  font-size: 12.5px;
  color: var(--text-muted);
  text-align: center;
}

/* ---------- 左侧题目列表 ---------- */
.editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-group__tab {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-surface);
  transition:
    color var(--duration) var(--ease),
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.page-group__tab:hover {
  color: var(--text-primary);
}

.page-group__tab.is-active {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-soft);
}

.page-group__count {
  font-size: 11.5px;
  color: var(--text-muted);
}

.qcard__head {
  gap: 10px;
}

.qcard__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.qcard__index {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-text);
  background: var(--accent-soft);
}

.qcard__number {
  width: 84px;
  height: 28px;
  font-size: 12px;
}

.qcard__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.qcard__textarea {
  height: auto;
  min-height: 82px;
  padding: 9px 10px;
  font-family: inherit;
  line-height: 1.7;
  resize: vertical;
}

/* ---------- 选项 ---------- */
.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option__key {
  flex: none;
  width: 20px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
}

.option__remove {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  transition:
    color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.option__remove:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.option__add {
  align-self: flex-start;
}

/* ---------- 添加题目 ---------- */
.add-question {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  transition:
    color var(--duration) var(--ease),
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.add-question:hover {
  border-color: var(--accent);
  color: var(--text-primary);
  background: var(--accent-soft);
}

/* ---------- 右侧原图 ---------- */
.side {
  position: sticky;
  top: calc(var(--header-height) + 16px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.side__image {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}

.thumb {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 3 / 4;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-app);
  transition: border-color var(--duration) var(--ease);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb.is-active {
  border-color: var(--accent);
}

.thumb__index {
  position: absolute;
  right: 3px;
  bottom: 3px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text-inverse);
  background: var(--accent);
}

@media (max-width: 960px) {
  .side {
    position: static;
  }
}
</style>
