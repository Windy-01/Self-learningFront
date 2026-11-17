/**
 * 作答草稿（`localStorage`）。
 *
 * 作答过程**没有保存接口**（`O4` 只负责交卷），所以整份作答状态必须留在本机：
 * 答案、当前题号、自评分数，全部放在**一个键**里 —— `sheet:{id}`。
 *
 * 为什么是一个键而不是三个：设置页按 `sheet:` 前缀统计「本地草稿 N 份」，
 * 拆成 `:answers` / `:grades` / `:index` 会让一份卷子被算成三份。
 *
 * 草稿只是本机缓存，交卷成功或作废后立刻清掉 —— 留着会让「恢复上次作答」
 * 把已经交过的卷子又填回来。
 */

/** 单题自评。`skip` 为真时交卷传 `score = maxScore = null`，不计入总分。 */
export interface ReviewGrade {
  /** 卷内题目实例 ID（`reviewSheetQuestionId`） */
  rsqId: number
  max: number
  score: number
  skip: boolean
}

export interface ReviewDraft {
  /** 键是 `reviewSheetQuestionId`；JSON 会把数字键变成字符串，读取时再转回来 */
  answers: Record<number, string>
  grades: ReviewGrade[]
  /** 当前题号（从 0 开始），刷新后回到同一题 */
  index: number
}

const PREFIX = 'sheet:'

function draftKey(sheetId: number): string {
  return `${PREFIX}${sheetId}`
}

function isGrade(value: unknown): value is ReviewGrade {
  if (typeof value !== 'object' || value === null) return false

  const grade = value as Partial<ReviewGrade>

  return (
    typeof grade.rsqId === 'number'
    && Number.isFinite(grade.rsqId)
    && typeof grade.max === 'number'
    && Number.isFinite(grade.max)
    && grade.max > 0
    && typeof grade.score === 'number'
    && Number.isFinite(grade.score)
    && typeof grade.skip === 'boolean'
  )
}

/** 读草稿。存储被禁用、JSON 损坏、结构不对都返回 `null`，不抛异常。 */
export function loadReviewDraft(sheetId: number): ReviewDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(sheetId))

    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null) return null

    const record = parsed as Partial<ReviewDraft>
    const answers: Record<number, string> = {}

    if (typeof record.answers === 'object' && record.answers !== null) {
      for (const [key, value] of Object.entries(record.answers)) {
        const id = Number(key)

        if (Number.isFinite(id) && typeof value === 'string') answers[id] = value
      }
    }

    return {
      answers,
      grades: Array.isArray(record.grades) ? record.grades.filter(isGrade) : [],
      index:
        typeof record.index === 'number' && Number.isFinite(record.index) && record.index >= 0
          ? Math.floor(record.index)
          : 0,
    }
  } catch {
    return null
  }
}

/**
 * 写草稿。配额不足（长答案很多）时静默放弃：
 * 丢草稿比让页面弹一个看不懂的 `QuotaExceededError` 更可接受。
 */
export function saveReviewDraft(sheetId: number, draft: ReviewDraft): void {
  try {
    window.localStorage.setItem(draftKey(sheetId), JSON.stringify(draft))
  } catch {
    /* 存储不可用或配额不足，忽略 */
  }
}

export function clearReviewDraft(sheetId: number): void {
  try {
    window.localStorage.removeItem(draftKey(sheetId))
  } catch {
    /* 忽略 */
  }
}
