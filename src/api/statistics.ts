/**
 * 学情统计接口 `/api/statistics`（S1）。
 *
 * 只放**跨业务域**的汇总；标签维度在 `L7`、知识点维度在 `K3`，这里不重复。
 * 无参数、无鉴权 —— 服务端固定当前学生。
 */

import { getJson } from './http'
import type { LearningStat } from './types'

const BASE = '/api/statistics'

/**
 * S1 学情总览。
 *
 * 这是「累计得分率 / 待解决题数 / 做过多少题」的**唯一权威来源**：
 * 拿 `Q4` 全量列表在前端数一遍既慢又会在分页后失真。
 */
export function learningOverview(): Promise<LearningStat> {
  return getJson<LearningStat>(`${BASE}/overview`)
}
