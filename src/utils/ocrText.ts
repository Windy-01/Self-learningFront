/**
 * OCR 文本 → 题干结构。
 *
 * 只做**纯文本处理**，不碰 canvas、不碰 tesseract、不碰网络，方便单独验证。
 *
 * 输出的形状必须能直接喂给 `stringifyContent()`：
 * - `type` 只能是编辑界面的四种（`single` / `multiple` / `fill` / `solution`），
 *   由 `fromEditorType()` 再映射成后端的 `single_choice` / `fill_blank` / `solution`；
 * - `options` 的 `key` **保留识别到的字母**（A–H），只做去重、不重排：
 *   重排会让「答案是 B」对到另一个选项上，比留着空洞更危险；
 * - `stem` 必须非空，否则调用方按「没识别出内容」处理。
 *
 * 识别本身并不可靠：公式、上下标、希腊字母经常错（`π` → `Tr`、`f(x)` → `fx)`），
 * 所以这里**只做结构和标点的规整，不改写文字内容** —— 猜错一个字符比留着原样更难发现。
 */

import type { EditorType } from '@/api/content'
import type { QuestionOption } from '@/api/types'

export interface OcrParseResult {
  type: EditorType
  stem: string
  options: QuestionOption[]
  /** 结构上的可疑点，展示给用户，不阻断流程 */
  warnings: string[]
}

/** 选项标记：A. / A． / A、 / A： / A) / A） */
const OPTION_MARK = '([A-H])\\s*[.．、:：,，)）]'

/** 选项键必须连续，最多到 H（再往后是 OCR 认错了） */
const MAX_OPTIONS = 8

/** 页码、纯数字、纯符号这类页面杂物，不该进题干 */
function isFurniture(line: string): boolean {
  if (/^第?\s*\d+\s*页(\s*[/／共]\s*\d+\s*页?)?$/.test(line)) return true
  if (/^[-—–－]?\s*\d{1,3}\s*[-—–－]?$/.test(line)) return true
  if (/^\d+\s*[/／]\s*\d+$/.test(line)) return true
  if (/^[|｜_—–\-=·.。、,，;；:：'"“”‘’\s]+$/.test(line)) return true

  return false
}

function normalizeLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line !== '' && !isFurniture(line))
}

interface Mark {
  key: string
  start: number
  end: number
}

/** 找出一行里所有「选项键」的位置 */
function optionMarks(line: string): Mark[] {
  const pattern = new RegExp(OPTION_MARK, 'g')
  const marks: Mark[] = []
  let match: RegExpExecArray | null = pattern.exec(line)

  while (match !== null) {
    const before = match.index === 0 ? '' : line[match.index - 1]

    // 「A.」必须出现在行首或空白/标点之后，否则可能是单词里的一段（如 U.S.A.）
    if (before === '' || /[\s，,、；;。:：（(【[]/.test(before)) {
      marks.push({
        key: match[1].toUpperCase(),
        start: match.index,
        end: match.index + match[0].length,
      })
    }

    match = pattern.exec(line)
  }

  return marks
}

interface LineOptions {
  parts: { key: string; text: string }[]
  /** 第一个选项标记在行内的位置，用来判断这行是不是「整行都是选项」 */
  start: number
}

/**
 * 把一行拆成若干选项。
 *
 * 两种情况：
 * - `A. 1    B. 2    C. 3`（一行多个选项）→ 按标记位置切开；
 * - `A. 三角形内角和为 180 度`（一行一个）→ 只取第一个标记之后的内容。
 *
 * 返回 `null` 表示这行不是选项行。
 */
function splitLineOptions(line: string): LineOptions | null {
  const marks = optionMarks(line)

  if (marks.length === 0) return null

  // 标记离行首太远：前半截是题干/上一选项的续文，这行不该整体当选项
  if (marks[0].start > 8) return null

  const parts = marks.map((mark, index) => ({
    key: mark.key,
    text: line
      .slice(mark.end, index + 1 < marks.length ? marks[index + 1].start : undefined)
      .trim(),
  }))

  return { parts, start: marks[0].start }
}

/** 选项块从哪一行开始；`-1` 表示整段文字里没有选项 */
function findOptionStart(infos: { split: LineOptions | null }[]): number {
  // 首选以 A 开头的那一行
  for (let index = 0; index < infos.length; index += 1) {
    const split = infos[index].split

    if (split && split.parts[0].key === 'A') return index
  }

  // 没有 A：先看有没有「一行多个选项」的行（A 那一行被认丢了）
  for (let index = 0; index < infos.length; index += 1) {
    const split = infos[index].split

    if (split && split.start <= 2 && split.parts.length >= 2) return index
  }

  // 再找「连续两个字母」的起点（B 行后面紧跟 C 行），
  // 这样「题干里引用 B.」不会把整段误判成选项
  for (let index = 0; index + 1 < infos.length; index += 1) {
    const split = infos[index].split
    const next = infos[index + 1].split

    if (!split || !next) continue

    const key = split.parts[0].key
    const following = String.fromCharCode(key.charCodeAt(0) + 1)

    if (key !== 'A' && next.parts[0].key === following) return index
  }

  return -1
}

/** 续行拼接：中文直接相连，英文/数字之间补一个空格 */
function joinText(left: string, right: string): string {
  if (left === '') return right
  if (right === '') return left

  const needSpace = /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right)

  return needSpace ? `${left} ${right}` : `${left}${right}`
}

/** 去掉题号：题干里不需要「3.」，卡片本身已经有「第 N 题」 */
function stripQuestionNumber(stem: string): string {
  return stem.replace(/^\s*(?:第\s*\d+\s*题\s*[.、．:：]?|\d{1,3}\s*[.、．)）])\s*/, '')
}

function detectType(
  stem: string,
  options: QuestionOption[],
): { type: EditorType; warnings: string[] } {
  const warnings: string[] = []

  if (options.length >= 2) {
    // 只认明确的「多选」信号：「正确的有」这种单选也常用，不能当依据
    const multiple = /多选|多项选择|不定项|至少.{0,4}(项|个)|选出所有/.test(stem)

    return { type: multiple ? 'multiple' : 'single', warnings }
  }

  if (options.length === 1) {
    warnings.push('只识别到一个选项，已按解答题处理')

    return { type: 'solution', warnings }
  }

  if (/(_{2,}|＿{2,})/.test(stem) || /[（(]\s*[）)]\s*$/.test(stem)) {
    return { type: 'fill', warnings }
  }

  return { type: 'solution', warnings }
}

/**
 * 主入口。
 *
 * 不做「纠错」：`Trr` 不会变成 `π`，`fx)` 不会变成 `f(x)` ——
 * 这类改动猜对了没人在意，猜错了会把原题改坏。用户对着左侧裁切图核对即可。
 */
export function parseOcrText(raw: string): OcrParseResult {
  const infos = normalizeLines(raw).map((text) => ({ text, split: splitLineOptions(text) }))
  const start = findOptionStart(infos)

  const stemLines: string[] = []
  const options: QuestionOption[] = []
  const warnings: string[] = []

  // 选项块之前的所有行都是题干
  for (let index = 0; index < (start === -1 ? infos.length : start); index += 1) {
    stemLines.push(infos[index].text)
  }

  if (start !== -1 && infos[start].split?.parts[0].key !== 'A') {
    warnings.push('选项 A 没识别出来，已从后面的字母开始保留')
  }

  for (let index = start === -1 ? infos.length : start; index < infos.length; index += 1) {
    const { text, split } = infos[index]

    if (split === null) {
      // 选项区里出现的普通行：选项折行的续文（中文题很常见）
      if (options.length > 0) {
        const last = options[options.length - 1]
        last.markup = joinText(last.markup, text)
      } else {
        stemLines.push(text)
      }

      continue
    }

    for (const part of split.parts) {
      if (options.length >= MAX_OPTIONS) {
        warnings.push(`选项超过 ${MAX_OPTIONS} 个，多出的部分已忽略`)
        break
      }

      if (options.some((option) => option.key === part.key)) {
        warnings.push(`选项 ${part.key} 重复出现，后一个已忽略`)
        continue
      }

      options.push({ key: part.key, markup: part.text })
    }
  }

  const keys = options.map((option) => option.key)
  // 从第一个字母往后数，看中间有没有断档（A、C、D 这种）
  const expectedKeys = keys
    .map((_, index) => String.fromCharCode(keys[0].charCodeAt(0) + index))
    .join('')

  if (keys.length > 1 && keys.join('') !== expectedKeys) {
    warnings.push('选项字母不连续，已按识别到的字母保留')
  }

  const cleanedOptions = options
    .map((option) => ({ key: option.key, markup: option.markup.replace(/\s+/g, ' ').trim() }))
    .filter((option) => option.markup !== '')

  if (cleanedOptions.length !== options.length && options.length > 0) {
    warnings.push('有空选项没识别出内容，已去掉')
  }

  const stem = stripQuestionNumber(stemLines.join('\n')).trim()
  const detected = detectType(stem, cleanedOptions)

  return {
    type: detected.type,
    stem,
    options: cleanedOptions,
    warnings: [...warnings, ...detected.warnings],
  }
}
