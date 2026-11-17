/**
 * 知识点接口 `/api/knowledge`（K1–K7）。
 *
 * 与标签完全独立：标签是自由维度，知识点是结构化维度，**用于学情统计与抽题**。
 * 没有合并接口，也不打算在前端模拟。
 */

import { deleteJson, getJson, postJson, putJson } from './http'
import type {
  DeletedResult,
  KnowledgePointEntity,
  KnowledgeStat,
  RenamedResult,
} from './types'

const BASE = '/api/knowledge'

/** K1 知识点列表（自己的 + 系统预置），不分页。 */
export function listKnowledgePoints(): Promise<KnowledgePointEntity[]> {
  return getJson<KnowledgePointEntity[]>(BASE)
}

/** K2 只看自己创建的（不含系统预置）。 */
export function listMyKnowledgePoints(): Promise<KnowledgePointEntity[]> {
  return getJson<KnowledgePointEntity[]>(`${BASE}/mine`)
}

/** K3 掌握度统计。**已按得分率升序，最薄弱在前**，页面不要再重排。 */
export function knowledgeStatistics(): Promise<KnowledgeStat[]> {
  return getJson<KnowledgeStat[]>(`${BASE}/statistics`)
}

/** K4 知识点名模糊搜索。空关键词等同 K1。 */
export function searchKnowledgePoints(keyword: string): Promise<KnowledgePointEntity[]> {
  return getJson<KnowledgePointEntity[]>(`${BASE}/search`, { query: { keyword } })
}

/** K5 创建（同名幂等）。 */
export function createKnowledgePoint(name: string): Promise<KnowledgePointEntity> {
  return postJson<KnowledgePointEntity>(`${BASE}/create`, undefined, { query: { name } })
}

/** K6 改名。系统知识点 / 不存在 → `{renamed:false}`。 */
export function renameKnowledgePoint(id: number, name: string): Promise<RenamedResult> {
  return putJson<RenamedResult>(`${BASE}/${id}/rename`, undefined, { query: { name } })
}

/** K7 删除（只解除关联，题目保留）。 */
export function deleteKnowledgePoint(id: number): Promise<DeletedResult> {
  return deleteJson<DeletedResult>(`${BASE}/${id}`)
}
