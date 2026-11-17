/**
 * 录入草稿的本地暂存。
 *
 * 只做一件事：把「框选 + 已填内容」写进 `localStorage`，刷新或误关页面后能接着填。
 * 图片存的是压缩副本（1400px / JPEG 0.72），原图不落盘 —— 草稿只是兜底，不是图库。
 *
 * 配额超了不报错：丢掉图片、保留文字，并在页面上提示一次。
 */

import type { EditorType } from '@/api/content'
import type { QuestionOption } from '@/api/types'
import type { Region } from '@/components/capture/types'

export const CAPTURE_DRAFT_KEY = 'capture:draft:v1'

export interface DraftPaper {
  id: string
  name: string
  width: number
  height: number
  dataUrl: string
  regions: Region[]
}

export interface DraftCard {
  regionId: string
  type: EditorType
  stem: string
  options: QuestionOption[]
  answer: string
  source: string
  tagIds: number[]
  knowledgeIds: number[]
}

export interface CaptureDraft {
  version: 1
  savedAt: string
  papers: DraftPaper[]
  cards: DraftCard[]
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    // 隐私模式下访问 localStorage 会抛错
    return null
  }
}

/** 读草稿。结构不认识就当没有 —— 宁可让用户重填，也不要带着半截数据进页面。 */
export function readCaptureDraft(): CaptureDraft | null {
  const store = storage()

  if (!store) return null

  const raw = store.getItem(CAPTURE_DRAFT_KEY)

  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null) return null

    const draft = parsed as Partial<CaptureDraft>

    if (draft.version !== 1 || !Array.isArray(draft.papers) || !Array.isArray(draft.cards)) {
      return null
    }

    return {
      version: 1,
      savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : '',
      papers: draft.papers,
      cards: draft.cards,
    }
  } catch {
    return null
  }
}

export type WriteResult = 'ok' | 'no-storage' | 'quota'

/**
 * 写草稿。
 *
 * 配额不足时先把图片去掉再试一次：文字内容比图片重要，
 * 至少别让用户填了 8 道题的题干白丢。
 */
export function writeCaptureDraft(draft: CaptureDraft): WriteResult {
  const store = storage()

  if (!store) return 'no-storage'

  try {
    store.setItem(CAPTURE_DRAFT_KEY, JSON.stringify(draft))

    return 'ok'
  } catch {
    try {
      const withoutImages: CaptureDraft = {
        ...draft,
        papers: draft.papers.map((paper) => ({ ...paper, dataUrl: '' })),
      }

      store.setItem(CAPTURE_DRAFT_KEY, JSON.stringify(withoutImages))

      return 'quota'
    } catch {
      return 'quota'
    }
  }
}

export function clearCaptureDraft(): void {
  storage()?.removeItem(CAPTURE_DRAFT_KEY)
}
