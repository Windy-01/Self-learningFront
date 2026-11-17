/**
 * 录入流程的数据模型。
 *
 * 三段结构：
 * `Paper`（一张试卷图）→ `Region`（图上的一个框，百分比坐标）→ `CaptureCard`（这道题要填的内容）。
 *
 * 卡片与框**按 `regionId` 一一对应**：删框就删卡，不需要额外维护顺序。
 */

import type { EditorType } from '@/api/content'
import type { QuestionOption } from '@/api/types'

/** 框选区域，坐标是相对原图宽高的百分比（0–100）。 */
export interface Region {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** 一张待处理的试卷图。原图只存在内存里，`draftUrl` 是给草稿用的压缩副本。 */
export interface Paper {
  id: string
  name: string
  /** 原图，上传裁切时用它，保证清晰度 */
  blob: Blob
  /** 原图的 objectURL，渲染用 */
  url: string
  width: number
  height: number
  /** 压缩后的 dataURL；为空表示这张图没进草稿（配额不足） */
  draftUrl: string
  regions: Region[]
}

export type CardState = 'idle' | 'submitting' | 'done' | 'failed'

/** 单题的 OCR 状态。识别结果只是草稿，写完仍然可以随便改。 */
export type OcrState = 'idle' | 'queued' | 'running' | 'done' | 'failed'

/** 一道题的填写内容与提交状态。 */
export interface CaptureCardModel {
  regionId: string
  type: EditorType
  stem: string
  options: QuestionOption[]
  answer: string
  source: string
  tagIds: number[]
  knowledgeIds: number[]
  state: CardState
  error: string
  /**
   * 建题成功后的 ID。
   *
   * 重试时**必须**据此跳过 `Q3` —— 否则「题目建好了但标签没挂上」的重试
   * 会再传一次图，题库里就多出一道重复题。
   */
  questionId: number | null
  /** OCR 状态；与提交状态分开，识别失败不影响手动填写与提交 */
  ocr: OcrState
  /** 识别进度 0–100，只在 `running` 时有意义 */
  ocrProgress: number
  ocrError: string
  /**
   * 识别时的框位置快照（`x/y/w/h`）。
   *
   * 用户拖过框以后，旧的识别结果就跟图对不上了，需要提示重新识别 ——
   * 自动重识别会在每次拖动时重跑，反而更烦。
   */
  ocrRect: string
  /** 结构上的可疑点（选项键不连续、按单选处理等），展示给用户 */
  ocrWarnings: string[]
}
