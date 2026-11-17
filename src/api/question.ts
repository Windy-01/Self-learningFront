/**
 * 题目接口 `/api/question`（Q1–Q14）。
 *
 * 几个必须记住的坑：
 * - `Q2` 的 part 名固定 `img`，`Q3` 固定 `file`，改了就 400；
 * - `Q3` **一图一题**，且 `content` 必须是字符串；
 * - `Q6` 的 `null` / `undefined` 表示「不修改」，不是「清空」；
 * - `Q7` 的 `{"deleted": false}` 也是 200。
 */

import { deleteJson, getJson, postForm, putJson } from './http'
import type {
  AddedResult,
  AnswerRecordView,
  DeletedResult,
  KnowledgePointEntity,
  QuestionDetail,
  QuestionPatch,
  QuestionSummary,
  RemovedResult,
  SearchResponse,
  TagEntity,
  UploadedImage,
} from './types'

const BASE = '/api/question'

/** Q1 关键词搜索（ES）。`page` 从 0 开始，`size` 服务端上限 100。 */
export function searchQuestions(params: {
  keyword?: string
  page?: number
  size?: number
}): Promise<SearchResponse> {
  return getJson<SearchResponse>(`${BASE}/search`, {
    query: { keyword: params.keyword, page: params.page, size: params.size },
  })
}

/** Q2 单图上传。返回的 `url` 是预签名地址，30 分钟过期。 */
export function uploadImage(file: Blob, fileName = 'image.jpg'): Promise<UploadedImage> {
  const form = new FormData()
  form.append('img', file, fileName)

  return postForm<UploadedImage>(`${BASE}/img/upload`, form)
}

/**
 * Q3 上传试卷图并建题（一图一题）。
 *
 * `content` 必须是 `stringifyContent()` 的产物，不是对象。
 */
export function uploadQuestion(
  file: Blob,
  content: string,
  fileName = 'question.jpg',
): Promise<{ questionId: number }> {
  const form = new FormData()
  form.append('file', file, fileName)
  form.append('content', content)

  return postForm<{ questionId: number }>(`${BASE}/upload`, form)
}

/** Q4 题目列表。**不分页**，返回全量。 */
export function listQuestions(status?: string): Promise<QuestionSummary[]> {
  return getJson<QuestionSummary[]>(`${BASE}/history`, {
    query: { status: status ?? undefined },
  })
}

/** Q5 题目详情。不存在或不属于当前学生 → 404。 */
export function getQuestion(id: number): Promise<QuestionDetail> {
  return getJson<QuestionDetail>(`${BASE}/${id}`)
}

/** Q6 局部更新。只传改过的字段。 */
export function updateQuestion(id: number, patch: QuestionPatch): Promise<QuestionDetail> {
  return putJson<QuestionDetail>(`${BASE}/${id}`, patch)
}

/** Q7 删除（物理删除，级联）。不存在时返回 `{deleted:false}` 而不是 404。 */
export function deleteQuestion(id: number): Promise<DeletedResult> {
  return deleteJson<DeletedResult>(`${BASE}/${id}`)
}

/** Q8 题目标签。 */
export function getQuestionTags(id: number): Promise<TagEntity[]> {
  return getJson<TagEntity[]>(`${BASE}/${id}/labels`)
}

/** Q9 挂标签（幂等）。 */
export function addQuestionTag(id: number, tagId: number): Promise<AddedResult> {
  return putJson<AddedResult>(`${BASE}/${id}/label/add`, undefined, { query: { tagId } })
}

/** Q10 摘标签。`removed:false` 表示本来就没挂。 */
export function removeQuestionTag(id: number, tagId: number): Promise<RemovedResult> {
  return deleteJson<RemovedResult>(`${BASE}/${id}/label/del`, { query: { tagId } })
}

/** Q11 题目知识点。 */
export function getQuestionKnowledges(id: number): Promise<KnowledgePointEntity[]> {
  return getJson<KnowledgePointEntity[]>(`${BASE}/${id}/knowledges`)
}

/** Q12 挂知识点（幂等）。 */
export function addQuestionKnowledge(id: number, knowledgePointId: number): Promise<AddedResult> {
  return putJson<AddedResult>(`${BASE}/${id}/knowledge/add`, undefined, {
    query: { knowledgePointId },
  })
}

/** Q13 摘知识点。 */
export function removeQuestionKnowledge(
  id: number,
  knowledgePointId: number,
): Promise<RemovedResult> {
  return deleteJson<RemovedResult>(`${BASE}/${id}/knowledge/del`, { query: { knowledgePointId } })
}

/** Q14 该题作答历史。**没有时间字段**，无法按时间排序。 */
export function getQuestionHistory(id: number): Promise<AnswerRecordView[]> {
  return getJson<AnswerRecordView[]>(`${BASE}/${id}/history`)
}

/** 建题后写入答案（`Q6` 的 `answer` 非 null 才生效）。 */
export function saveQuestionAnswer(id: number, answer: string): Promise<QuestionDetail> {
  return updateQuestion(id, { answer })
}

/** 建题后写入来源。 */
export function saveQuestionSource(id: number, source: string): Promise<QuestionDetail> {
  return updateQuestion(id, { source })
}
