<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ChipPicker from '@/components/common/ChipPicker.vue'
import { EDITOR_TYPES, type EditorType } from '@/api/content'
import { hasMarkup, renderMarkup } from '@/utils/markup'
import type { CaptureCardModel, Region } from './types'

/**
 * 单题填写卡片。
 *
 * 左边是这道题的裁切预览（用 CSS 定位原图，不额外生成图片，所以零延迟），
 * 右边是要填的内容。提交状态也显示在卡上：失败的那张卡自己带重试，不打断整批。
 *
 * 卡片不碰接口 —— 建标签、挂标签都由页面统一处理，这里只发事件。
 */

interface OptionItem {
  id: number
  name: string
  system?: boolean
}

const props = defineProps<{
  index: number
  region: Region
  /** 与图上选中的框联动：高亮 + 自动展开 */
  active?: boolean
  tagOptions: OptionItem[]
  knowledgeOptions: OptionItem[]
}>()

const card = defineModel<CaptureCardModel>({ required: true })

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'recognize'): void
  (e: 'activate'): void
  (e: 'apply-source', source: string): void
  (e: 'create-tag', name: string): void
  (e: 'create-knowledge', name: string): void
}>()

const collapsed = ref(false)

// 从图上点中这个框：把卡片展开，用户马上能改题干
watch(
  () => props.active,
  (active) => {
    if (active) collapsed.value = false
  },
)

const locked = computed(
  () => card.value.state === 'done' || card.value.state === 'submitting',
)

const isChoice = computed(() => card.value.type === 'single' || card.value.type === 'multiple')

/** 识别之后框又被拖过：结果和图对不上，需要提示重识别 */
const ocrStale = computed(() => {
  if (card.value.ocr !== 'done' || card.value.ocrRect === '') return false

  const key = [props.region.x, props.region.y, props.region.w, props.region.h]
    .map((value) => value.toFixed(1))
    .join('/')

  return key !== card.value.ocrRect
})

const ocrText = computed(() => {
  switch (card.value.ocr) {
    case 'queued':
      return '排队识别…'
    case 'running':
      return `识别中 ${card.value.ocrProgress}%`
    case 'failed':
      return '识别失败'
    case 'done':
      return ocrStale.value ? '框已调整 · 建议重识别' : '已识别 · 请核对'
    default:
      // 草稿恢复 / 用户直接手打：没跑过识别，但内容已经有了
      return card.value.stem.trim() === '' ? '未识别' : '手动填写'
  }
})

const ocrTone = computed(() => {
  if (card.value.ocr === 'failed') return 'is-failed'
  if (card.value.ocr === 'done') return ocrStale.value ? 'is-stale' : 'is-done'

  return ''
})

const ocrBusy = computed(() => card.value.ocr === 'queued' || card.value.ocr === 'running')

const stateText = computed(() => {
  switch (card.value.state) {
    case 'submitting':
      return '保存中…'
    case 'done':
      return `已入库 #${card.value.questionId ?? ''}`
    case 'failed':
      return '保存失败'
    default:
      return card.value.stem.trim() === '' ? '待填写' : '待保存'
  }
})

const stateClass = computed(() => ({
  'is-done': card.value.state === 'done',
  'is-failed': card.value.state === 'failed',
  'is-busy': card.value.state === 'submitting',
  'is-active': props.active === true,
}))

const tagItems = computed(() => props.tagOptions.filter((item) => card.value.tagIds.includes(item.id)))
const knowledgeItems = computed(() =>
  props.knowledgeOptions.filter((item) => card.value.knowledgeIds.includes(item.id)),
)

function onTypeChange(event: Event): void {
  card.value.type = (event.target as HTMLSelectElement).value as EditorType
}

function addOption(): void {
  card.value.options.push({
    key: String.fromCharCode(65 + card.value.options.length),
    markup: '',
  })
}

function removeOption(index: number): void {
  if (card.value.options.length <= 2) return

  card.value.options.splice(index, 1)
}

function addTag(id: number): void {
  if (!card.value.tagIds.includes(id)) card.value.tagIds = [...card.value.tagIds, id]
}

function removeTag(id: number): void {
  card.value.tagIds = card.value.tagIds.filter((item) => item !== id)
}

function addKnowledge(id: number): void {
  if (!card.value.knowledgeIds.includes(id)) {
    card.value.knowledgeIds = [...card.value.knowledgeIds, id]
  }
}

function removeKnowledge(id: number): void {
  card.value.knowledgeIds = card.value.knowledgeIds.filter((item) => item !== id)
}

function applySource(): void {
  const source = card.value.source.trim()

  if (source !== '') emit('apply-source', source)
}

/** 展开时顺带把图上的框点亮，方便对照 */
function toggle(): void {
  collapsed.value = !collapsed.value

  if (!collapsed.value) emit('activate')
}

/* ---------------- 公式输入 ---------------- */

interface Snippet {
  label: string
  tex: string
  /** 插入后光标落在 tex 里的位置（方便直接填内容） */
  caret: number
}

/**
 * 常用公式片段。
 *
 * 只放「打字最烦、又最容易打错」的那些：上下标、分式、根号、积分、求和、希腊字母、关系符。
 * 复杂公式仍然要手写 LaTeX —— 这个工具的作用是少按几次反斜杠，不是编辑器。
 */
const SNIPPETS: Snippet[] = [
  { label: 'x²', tex: '^{2}', caret: 2 },
  { label: 'xₙ', tex: '_{n}', caret: 2 },
  { label: '分数', tex: '\\frac{}{}', caret: 6 },
  { label: '根号', tex: '\\sqrt{}', caret: 6 },
  { label: '∫', tex: '\\int_{}^{}', caret: 6 },
  { label: 'Σ', tex: '\\sum_{}^{}', caret: 6 },
  { label: 'π', tex: '\\pi', caret: 3 },
  { label: 'θ', tex: '\\theta', caret: 7 },
  { label: '≤', tex: '\\le', caret: 3 },
  { label: '≥', tex: '\\ge', caret: 3 },
  { label: '≠', tex: '\\ne', caret: 3 },
  { label: '°', tex: '^{\\circ}', caret: 2 },
]

const stemInput = ref<HTMLTextAreaElement | null>(null)

const renderedStem = computed(() => renderMarkup(card.value.stem))
/** 纯文字不显示预览（跟输入框长得一样，白占地方）；有 Markdown 或公式才显示 */
const showPreview = computed(() => hasMarkup(card.value.stem))

/**
 * 在光标处插入片段。
 *
 * 光标已经在 `$…$` 里就只插 TeX，否则自动补一对 `$`——
 * 让用户只关心「公式写什么」，不用每次数美元符号。
 */
function insertSnippet(snippet: Snippet): void {
  const input = stemInput.value
  const value = card.value.stem

  if (!input) {
    card.value.stem = `${value}$${snippet.tex}$`
    return
  }

  const start = input.selectionStart
  const end = input.selectionEnd
  const before = value.slice(0, start)
  const insideMath = (before.match(/\$/g)?.length ?? 0) % 2 === 1
  const text = insideMath ? snippet.tex : `$${snippet.tex}$`
  const offset = insideMath ? snippet.caret : snippet.caret + 1

  card.value.stem = value.slice(0, start) + text + value.slice(end)

  void nextTick(() => {
    const position = start + offset

    input.focus()
    input.setSelectionRange(position, position)
  })
}
</script>

<template>
  <article class="card" :class="stateClass">
    <header class="card__head">
      <button class="card__toggle" type="button" @click="toggle">
        <span class="card__no">{{ index }}</span>
        <span class="card__title">第 {{ index }} 题</span>
        <span class="badge" :class="{ 'badge--muted': card.state !== 'done' }">{{ stateText }}</span>
        <AppIcon
          name="chevronDown"
          :size="14"
          class="card__chevron"
          :class="{ 'is-open': !collapsed }"
        />
      </button>

      <div class="card__tools">
        <RouterLink
          v-if="card.state === 'done' && card.questionId"
          class="card__link"
          :to="{ name: 'question-detail', params: { id: card.questionId } }"
        >
          查看 ›
        </RouterLink>
        <button
          v-if="card.state === 'failed'"
          class="btn btn--sm"
          type="button"
          @click="emit('retry')"
        >
          重试
        </button>
      </div>
    </header>

    <div v-show="!collapsed" class="card__body">
      <div class="card__fields">
        <div class="field">
          <div class="field__label">
            <span>题干</span>
            <span class="ocr-state" :class="ocrTone">{{ ocrText }}</span>
            <button
              class="ocr-btn"
              type="button"
              :disabled="locked || ocrBusy"
              @click="emit('recognize')"
            >
              重新识别
            </button>
          </div>
          <textarea
            ref="stemInput"
            v-model="card.stem"
            class="input"
            rows="3"
            aria-label="题干"
            placeholder="照抄题干，公式写成 $…$"
            :disabled="locked"
          />

          <div class="formula-bar">
            <span class="formula-bar__label">公式</span>
            <button
              v-for="snippet in SNIPPETS"
              :key="snippet.label"
              class="formula-bar__btn"
              type="button"
              :title="snippet.tex"
              :disabled="locked"
              @click="insertSnippet(snippet)"
            >
              {{ snippet.label }}
            </button>
          </div>

          <!-- 题干预览：真按 Markdown 渲染，不是把公式单独拎出来 -->
          <div v-if="showPreview" class="formula-preview">
            <div class="formula-preview__head">
              <span class="formula-preview__label">预览</span>
              <span class="formula-preview__hint">Markdown + 公式</span>
            </div>
            <div class="formula-preview__body md-body" v-html="renderedStem" />
          </div>

          <p v-if="card.ocr === 'failed' && card.ocrError" class="ocr-error">{{ card.ocrError }}</p>
          <p v-else-if="card.ocrWarnings.length > 0" class="ocr-warn">
            {{ card.ocrWarnings.join('；') }}
          </p>
        </div>

        <div class="card__row">
          <label class="field">
            <span class="field__label">题型</span>
            <select class="select" :value="card.type" :disabled="locked" @change="onTypeChange">
              <option v-for="option in EDITOR_TYPES" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="field__label">答案</span>
            <input
              v-model="card.answer"
              class="input"
              type="text"
              placeholder="可留空，之后在详情页补"
              :disabled="locked"
            />
          </label>
        </div>

        <div v-if="isChoice" class="field">
          <span class="field__label">选项</span>
          <div class="options">
            <div v-for="(option, optionIndex) in card.options" :key="optionIndex" class="options__row">
              <span class="options__key">{{ option.key || String.fromCharCode(65 + optionIndex) }}</span>
              <input
                v-model="option.markup"
                class="input"
                type="text"
                placeholder="选项内容"
                :disabled="locked"
              />
              <button
                class="options__del"
                type="button"
                :disabled="locked || card.options.length <= 2"
                aria-label="删除这个选项"
                @click="removeOption(optionIndex)"
              >
                ×
              </button>
            </div>
          </div>
          <button class="btn btn--sm btn--ghost options__add" type="button" :disabled="locked" @click="addOption">
            + 选项
          </button>
        </div>

        <div class="field">
          <span class="field__label">来源</span>
          <div class="source">
            <input
              v-model="card.source"
              class="input"
              type="text"
              placeholder="如 2026 秋期中考 · 可留空"
              :disabled="locked"
            />
            <button
              class="btn btn--sm"
              type="button"
              :disabled="locked || card.source.trim() === ''"
              @click="applySource"
            >
              应用到本批
            </button>
          </div>
        </div>

        <div class="card__chips">
          <div class="chips">
            <span class="chips__label">标签</span>
            <ChipPicker
              :items="tagItems"
              :options="tagOptions"
              placeholder="未打标签"
              add-text="加标签"
              @add="addTag"
              @remove="removeTag"
              @create="(name) => emit('create-tag', name)"
            />
          </div>

          <div class="chips">
            <span class="chips__label">知识点</span>
            <ChipPicker
              :items="knowledgeItems"
              :options="knowledgeOptions"
              placeholder="未关联"
              add-text="加知识点"
              @add="addKnowledge"
              @remove="removeKnowledge"
              @create="(name) => emit('create-knowledge', name)"
            />
          </div>
        </div>

        <p v-if="card.state === 'failed' && card.error" class="card__error">{{ card.error }}</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  transition: border-color var(--duration) var(--ease);
}

.card.is-done {
  border-color: var(--border-strong);
}

.card.is-failed {
  border-color: var(--text-primary);
}

/* 与图上选中的框联动：只描边，不放大，避免列表跳动 */
.card.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  min-height: 44px;
  padding: 6px 14px 6px 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-app);
}

.card__toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  text-align: left;
}

.card__toggle:hover {
  background: var(--bg-surface-hover);
}

.card__no {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-inverse);
  background: var(--accent);
  font-variant-numeric: tabular-nums;
}

.card__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.card__chevron {
  margin-left: auto;
  color: var(--text-muted);
  transform: rotate(-90deg);
  transition: transform var(--duration) var(--ease);
}

.card__chevron.is-open {
  transform: rotate(0deg);
}

.card__tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.card__link {
  font-size: 12px;
  color: var(--text-secondary);
}

.card__link:hover {
  color: var(--text-primary);
}

.card__body {
  padding: 14px;
}

.card__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* ---------- 识别状态：跟字段标题同一行，不额外占高度 ---------- */
.ocr-state {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
  white-space: nowrap;
}

.ocr-state.is-done,
.ocr-state.is-stale {
  color: var(--text-secondary);
}

.ocr-state.is-failed {
  color: var(--text-primary);
}

.ocr-btn {
  margin-left: auto;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.ocr-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.ocr-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ocr-error {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-primary);
}

.ocr-warn {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ---------- 公式输入 ---------- */
.formula-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.formula-bar__label {
  margin-right: 2px;
  font-size: 11px;
  color: var(--text-muted);
}

.formula-bar__btn {
  min-width: 26px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-surface);
}

.formula-bar__btn:hover:not(:disabled) {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

.formula-bar__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.formula-preview {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-app);
}

.formula-preview__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.formula-preview__label {
  flex: none;
  font-size: 10.5px;
  color: var(--text-muted);
}

.formula-preview__hint {
  font-size: 10.5px;
  color: var(--text-muted);
  opacity: 0.75;
}

/* 排版交给全局 .md-body，这里只管字号与横向滚动 */
.formula-preview__body {
  min-width: 0;
  font-size: 13px;
  line-height: 1.9;
  color: var(--text-primary);
  overflow-x: auto;
}

.card__row {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 10px;
}

.options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.options__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.options__key {
  flex: none;
  width: 14px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
}

.options__del {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1;
  color: var(--text-muted);
}

.options__del:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.options__del:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.options__add {
  align-self: flex-start;
  margin-top: 4px;
}

.source {
  display: flex;
  gap: 6px;
}

.card__chips {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chips {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}

.chips__label {
  padding-top: 5px;
  font-size: 11px;
  color: var(--text-muted);
}

.card__error {
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-app);
}

@media (max-width: 720px) {
  .card__row {
    grid-template-columns: minmax(0, 1fr);
  }

  .options {
    grid-template-columns: minmax(0, 1fr);
  }

  .chips {
    grid-template-columns: minmax(0, 1fr);
  }

  .chips__label {
    padding-top: 0;
  }
}
</style>
