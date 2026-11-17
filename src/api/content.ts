/**
 * 题干（`content`）的读写适配。
 *
 * 后端约定：**写是字符串，读是对象**。
 * - `POST /api/question/upload` 的 `content` 必须是 JSON 字符串；
 * - `PUT /api/question/{id}` 的 `content` 也必须是字符串；
 * - `GET /api/question/{id}` 返回的是已经解析好的对象。
 *
 * 不转换就会 400，所以所有拼装都集中在这里，页面不要自己 `JSON.stringify`。
 */

import type { QuestionContent, QuestionOption } from './types'

/** 编辑界面的四种题型。后端的 `type` 是自由字符串，这里只覆盖已知的。 */
export type EditorType = 'single' | 'multiple' | 'fill' | 'solution'

export const EDITOR_TYPES: { value: EditorType; label: string }[] = [
  { value: 'single', label: '单选' },
  { value: 'multiple', label: '多选' },
  { value: 'fill', label: '填空' },
  { value: 'solution', label: '解答' },
]

/**
 * 选项的展示 / 存储键。
 *
 * 后端 `key` 可能为空，也可能不是 A/B/C/D（例如判断题的「对/错」），
 * 空值按位置补 A、B、C……。**作答存的就是这个值**，渲染与判分必须用同一个函数，
 * 否则会出现「点了 A，存成了 B」。
 */
export function resolveOptionKey(option: QuestionOption | null | undefined, index: number): string {
  const key = option?.key?.trim()

  return key ? key : String.fromCharCode(65 + index)
}

/** 判断题干是不是选择题。 */
export function isChoiceType(type: string | null | undefined, mode: string | null | undefined): boolean {
  if (mode === 'single' || mode === 'multiple') return true

  return type === 'single_choice' || type === 'multiple_choice' || type === 'choice'
}

/**
 * 把任意形态的 `content` 解析成对象。
 *
 * Q5 返回对象，但历史脏数据可能是字符串；解析失败返回 `null`，
 * 页面据此降级显示「题干解析失败」，而不是整页崩掉。
 */
export function parseContent(raw: unknown): QuestionContent | null {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text === '') return null

    try {
      const parsed: unknown = JSON.parse(text)
      return typeof parsed === 'object' && parsed !== null ? (parsed as QuestionContent) : null
    } catch {
      return null
    }
  }

  if (typeof raw === 'object' && raw !== null) {
    return raw as QuestionContent
  }

  return null
}

/** 取一份带默认值的可展示内容。 */
export function contentOf(content: QuestionContent | null): {
  type: string
  choiceMode: string
  stem: string
  options: QuestionOption[]
} {
  return {
    type: content?.type ?? '',
    choiceMode: content?.choice_mode ?? '',
    stem: content?.stem_markup ?? '',
    options: Array.isArray(content?.options) ? content.options : [],
  }
}

/** 后端 `type` / `choice_mode` → 编辑界面的题型。 */
export function toEditorType(
  type: string | null | undefined,
  mode: string | null | undefined,
): EditorType {
  if (mode === 'multiple' || type === 'multiple_choice') return 'multiple'
  if (isChoiceType(type, mode)) return 'single'
  if (type === 'fill_blank') return 'fill'
  if (type === 'solution') return 'solution'

  // 未知题型一律按解答处理：至少能看能改题干。
  return 'solution'
}

/**
 * 编辑界面的题型 → 后端字段。
 *
 * ⚠️ 文档只列出了 `single_choice` / `fill_blank` / `solution` 三种 `type`，
 * 多选靠 `choice_mode = multiple` 区分，所以这里单选与多选共用 `single_choice`。
 * 若后端后续新增 `multiple_choice`，只改这一处。
 */
export function fromEditorType(type: EditorType): {
  type: string
  choiceMode: string | null
} {
  switch (type) {
    case 'single':
      return { type: 'single_choice', choiceMode: 'single' }
    case 'multiple':
      return { type: 'single_choice', choiceMode: 'multiple' }
    case 'fill':
      return { type: 'fill_blank', choiceMode: null }
    default:
      return { type: 'solution', choiceMode: null }
  }
}

/** 列表里展示的题型文案。 */
export function typeLabel(
  type: string | null | undefined,
  mode: string | null | undefined,
): string {
  if (mode === 'multiple' || type === 'multiple_choice') return '多选'
  if (isChoiceType(type, mode)) return '单选'
  if (type === 'fill_blank') return '填空'
  if (type === 'solution') return '解答'
  if (!type) return '未知题型'

  return type
}

export interface ContentDraft {
  type: EditorType
  stem: string
  options: QuestionOption[]
}

/**
 * 把编辑界面的草稿拼成后端要的 JSON 字符串。
 *
 * `question_id` / `userid` 一律写 `null`：服务端不回填也不读取，
 * 写自己的值反而会让「以哪个为准」变得可疑。
 */
export function stringifyContent(draft: ContentDraft): string {
  const { type, choiceMode } = fromEditorType(draft.type)
  const choice = type === 'single_choice'

  const content: QuestionContent = {
    question_id: null,
    userid: null,
    type,
    choice_mode: choiceMode,
    stem_markup: draft.stem,
    options: choice
      ? draft.options
          .map((option, index) => ({
            key: (option.key || String.fromCharCode(65 + index)).trim(),
            markup: option.markup,
          }))
          .filter((option) => option.markup.trim() !== '')
      : null,
  }

  return JSON.stringify(content)
}

/** 生成默认选项 A–D，新建题目时用。 */
export function defaultOptions(): QuestionOption[] {
  return ['A', 'B', 'C', 'D'].map((key) => ({ key, markup: '' }))
}
