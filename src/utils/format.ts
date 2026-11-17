/**
 * 展示格式化。
 *
 * 时间格式是后端原样的 `yyyy-MM-ddTHH:mm:ss`，**不带时区**。
 * 这里手工切分而不是 `new Date()`：Safari 对无时区字符串的解析不稳定，
 * 而且后端语义本来就是「库里存什么就显示什么」，不该做时区换算。
 */

/** `2026-11-16T18:10:56` → `11-16 18:10` */
export function formatDateTime(raw: string | null | undefined): string {
  if (!raw) return '—'

  const matched = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw)

  if (!matched) return raw

  const [, , month, day, hour, minute] = matched

  return `${month}-${day} ${hour}:${minute}`
}

/** `2026-11-16T18:10:56` → `2026-11-16` */
export function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—'

  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)

  return matched ? `${matched[1]}-${matched[2]}-${matched[3]}` : raw
}

/** `0.64` → `64%`；`null`（从未作答）→ `—`，不显示成 0%。 */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—'

  return `${Math.round(rate * 100)}%`
}

/** 得分去掉尾随 0：`32.00` → `32`，`32.50` → `32.5`。 */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'

  return String(Math.round(value * 100) / 100)
}

/** `32` / `50` → `32 / 50`；任一为空时只显示有的那个。 */
export function formatScorePair(
  score: number | null | undefined,
  max: number | null | undefined,
): string {
  if ((score === null || score === undefined) && (max === null || max === undefined)) {
    return '—'
  }

  return `${formatScore(score)} / ${formatScore(max)}`
}

/**
 * 题干预览：把 Markdown / LaTeX 标记去掉，压成一行纯文本。
 *
 * 只用于列表（题干在详情页是渲染过的），所以这里做的是「降级成可读文字」：
 * 链接留文字、公式留 TeX 本体、列表符号和 `**` 一律去掉。
 * 不处理 `_斜体_`：题干里 `a_n` 这种下标太常见，剥下划线比留着更糟。
 */
export function previewStem(stem: string | null | undefined, maxLength = 120): string {
  if (!stem) return '（题干为空）'

  const text = stem
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>)\s*/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (text === '') return '（题干为空）'

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * 复习卷标题：`title` 为空时用创建时间兜底。
 * 后端允许 `title = null`，列表里不能出现一行空标题。
 */
export function reviewSheetTitle(
  title: string | null | undefined,
  createdAt: string | null | undefined,
): string {
  const trimmed = title?.trim()

  if (trimmed) return trimmed

  const time = formatDateTime(createdAt)

  return time === '—' ? '复习卷' : `复习卷 · ${time}`
}

/** 新建复习卷的默认标题：`复习卷 · MM-DD HH:mm`（本机时间，和展示格式一致）。 */
export function nowSheetTitle(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')

  return `复习卷 · ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/** 百分比条宽度，限制在 0–100。 */
export function rateWidth(rate: number | null | undefined): number {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return 0

  return Math.max(0, Math.min(100, Math.round(rate * 100)))
}
