/**
 * 复习卷接口 `/api/overview`（O1–O6）。
 *
 * 三条会影响交互的事实：
 * - `O2` **不返回答案快照**，作答端拿不到标准答案；
 * - 作答过程**没有保存接口**，草稿只能放 localStorage；
 * - 判分在客户端（`O4` 只校验范围），所以交卷必须让用户自评。
 */

import { deleteJson, getJson, postJson } from './http'
import type {
  CancelledResult,
  DeletedResult,
  ReviewSheetDetail,
  ReviewSheetEntity,
  SubmitAnswer,
} from './types'

const BASE = '/api/overview'

/** O1 生成复习卷。`tagId` / `knowledgePointId` 都不传表示全库抽题。 */
export function generateReviewSheet(params: {
  number?: number
  tagId?: number
  knowledgePointId?: number
  title?: string
}): Promise<ReviewSheetDetail> {
  return postJson<ReviewSheetDetail>(`${BASE}/generate`, undefined, {
    query: {
      number: params.number,
      tagId: params.tagId,
      knowledgePointId: params.knowledgePointId,
      title: params.title,
    },
  })
}

/** O2 复习卷详情（含题目快照，**不含答案**）。 */
export function getReviewSheet(id: number): Promise<ReviewSheetDetail> {
  return getJson<ReviewSheetDetail>(`${BASE}/${id}`)
}

/** O3 删除复习卷。作答记录保留，但卷子本身的成绩不再单独存在。 */
export function deleteReviewSheet(id: number): Promise<DeletedResult> {
  return deleteJson<DeletedResult>(`${BASE}/${id}`)
}

/**
 * O4 交卷。
 *
 * `score` 与 `maxScore` 必须**同时给或同时不给**；都不给表示该题未评分，
 * 不计入总分但仍然会写一条作答记录。
 */
export function submitReviewSheet(
  id: number,
  answers: SubmitAnswer[],
): Promise<ReviewSheetEntity> {
  return postJson<ReviewSheetEntity>(`${BASE}/${id}/submit`, { answers })
}

/** O5 作废。⚠️ 后端不校验当前状态，前端要自己挡（已提交的卷不显示作废）。 */
export function cancelReviewSheet(id: number): Promise<CancelledResult> {
  return postJson<CancelledResult>(`${BASE}/${id}/cancel`)
}

/** O6 复习卷历史（按 id 倒序，不分页）。 */
export function listReviewHistory(status?: number): Promise<ReviewSheetEntity[]> {
  return getJson<ReviewSheetEntity[]>(`${BASE}/history`, {
    query: { status },
  })
}
