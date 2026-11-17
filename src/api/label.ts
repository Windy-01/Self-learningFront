/**
 * 标签接口 `/api/label`（L1–L7）。
 *
 * 标签是**自由维度**：自己创建的可以改/删/合并，`userid = 0` 的系统预置标签只读。
 * 写操作对系统标签返回 `false`（仍是 200），页面按「没做成」提示，不要当错误。
 */

import { deleteJson, getJson, postJson, putJson } from './http'
import type { DeletedResult, LabelStat, MergedResult, RenamedResult, TagEntity } from './types'

const BASE = '/api/label'

/** L1 标签列表（自己的 + 系统的），不分页。 */
export function listLabels(): Promise<TagEntity[]> {
  return getJson<TagEntity[]>(BASE)
}

/** L2 标签名模糊搜索。空关键词等同 L1。 */
export function searchLabels(keyword: string): Promise<TagEntity[]> {
  return getJson<TagEntity[]>(`${BASE}/search`, { query: { keyword } })
}

/** L3 创建标签（同名幂等，返回已存在的那条）。 */
export function createLabel(name: string): Promise<TagEntity> {
  return postJson<TagEntity>(`${BASE}/create`, undefined, { query: { name } })
}

/** L4 改名。系统标签 / 不存在 → `{renamed:false}`。 */
export function renameLabel(id: number, name: string): Promise<RenamedResult> {
  return putJson<RenamedResult>(`${BASE}/${id}/rename`, undefined, { query: { name } })
}

/** L5 删除标签（只解除关联，题目保留）。 */
export function deleteLabel(id: number): Promise<DeletedResult> {
  return deleteJson<DeletedResult>(`${BASE}/${id}`)
}

/** L6 合并标签：把 `from` 的题目迁到 `to`，然后删掉 `from`。 */
export function mergeLabels(fromTagId: number, toTagId: number): Promise<MergedResult> {
  return postJson<MergedResult>(`${BASE}/merge`, undefined, {
    query: { fromTagId, toTagId },
  })
}

/** L7 标签题目数统计（倒序，只统计自己的题目）。 */
export function labelStatistics(): Promise<LabelStat[]> {
  return getJson<LabelStat[]>(`${BASE}/statistics`)
}
