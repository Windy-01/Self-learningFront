<script setup lang="ts">
import { computed } from 'vue'
import { contentOf, resolveOptionKey } from '@/api/content'
import { renderInlineMarkup, renderMarkup } from '@/utils/markup'
import type { QuestionContent } from '@/api/types'

/**
 * 题干与选项的渲染。
 *
 * 后端存的是 Markdown + LaTeX 原文：题干按块级解析（段落、列表、加粗、表格、公式），
 * 选项按行内解析（选项里不该出现块级结构，也不该被 `<p>` 包一层）。
 *
 * 两种模式共用同一套排版：
 * - 默认只读（题库详情）；
 * - `pickable` 可点选（复习卷作答），此时选项变成按钮，选中态由 `modelValue` 决定。
 *   多选存成排序后的键串（如 `AC`），与后端 `userAnswer` 的字符串语义一致。
 */
const props = withDefaults(
  defineProps<{
    content: QuestionContent | null
    /** `content` 解析失败时的兜底题干（列表接口能拿到纯文本） */
    fallbackStem?: string | null
    pickable?: boolean
    multiple?: boolean
    modelValue?: string
  }>(),
  {
    fallbackStem: null,
    pickable: false,
    multiple: false,
    modelValue: '',
  },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const view = computed(() => contentOf(props.content))

const stem = computed(() => {
  if (view.value.stem.trim() !== '') return view.value.stem

  return props.fallbackStem?.trim() || '（题干解析失败，可能是历史脏数据）'
})

/** Markdown + 公式在渲染层转成 HTML；原文里的裸 HTML 已被 `html: false` 转义 */
const renderedStem = computed(() => renderMarkup(stem.value))

/** 已选的键。多选按分隔符拆，单选就是一个值。 */
const picked = computed(() => {
  if (!props.multiple) return new Set(props.modelValue ? [props.modelValue] : [])

  return new Set(
    props.modelValue
      .split(/[\s,，、]+/)
      .map((key) => key.trim())
      .filter((key) => key !== ''),
  )
})

function pick(key: string): void {
  if (!props.pickable) return

  if (!props.multiple) {
    // 再点一次取消选择：单选点错了要能撤回，不能只能改成别的选项。
    emit('update:modelValue', props.modelValue === key ? '' : key)
    return
  }

  const next = new Set(picked.value)

  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }

  emit('update:modelValue', [...next].sort().join(''))
}
</script>

<template>
  <div class="question-body">
    <!-- 用 div 不用 p：块级 Markdown 会产出 <p>/<ul>，嵌在 <p> 里会被浏览器拆开 -->
    <div class="question-body__stem md-body" v-html="renderedStem" />

    <!-- 题干与选项之间：作答页在这里塞题目图片，顺序才对 -->
    <slot name="after-stem" />

    <div v-if="view.options.length > 0" class="question-body__options">
      <template v-if="pickable">
        <button
          v-for="(option, index) in view.options"
          :key="resolveOptionKey(option, index)"
          class="question-body__option question-body__option--pick"
          :class="{ 'is-picked': picked.has(resolveOptionKey(option, index)) }"
          type="button"
          :aria-pressed="picked.has(resolveOptionKey(option, index))"
          @click="pick(resolveOptionKey(option, index))"
        >
          <span class="question-body__key">{{ resolveOptionKey(option, index) }}</span>
          <span class="question-body__markup md-body md-body--inline" v-html="renderInlineMarkup(option.markup)" />
        </button>
      </template>

      <template v-else>
        <div
          v-for="(option, index) in view.options"
          :key="resolveOptionKey(option, index)"
          class="question-body__option"
        >
          <span class="question-body__key">{{ resolveOptionKey(option, index) }}</span>
          <span class="question-body__markup md-body md-body--inline" v-html="renderInlineMarkup(option.markup)" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.question-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-body__stem {
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-primary);
  word-break: break-word;
}

/* 渲染出来的块级元素（段落 / 列表 / 表格 / 公式）交给全局 `.md-body` 排版，
   见 src/styles/markdown.css —— `v-html` 的节点拿不到 scope 属性，样式只能放全局。 */

.question-body__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.question-body__option {
  display: flex;
  gap: 9px;
  padding: 8px 11px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.question-body__option--pick {
  width: 100%;
  text-align: left;
  transition:
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.question-body__option--pick:hover {
  border-color: var(--border-strong);
  background: var(--bg-surface-hover);
}

.question-body__option--pick.is-picked {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.question-body__key {
  flex: none;
  width: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.question-body__option--pick.is-picked .question-body__key {
  color: var(--accent-text);
}

/* 选项走行内渲染，不会有段落；加粗 / 代码 / 公式由全局 `.md-body` 处理 */
.question-body__markup {
  word-break: break-word;
}
</style>
