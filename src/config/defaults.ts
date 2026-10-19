import type { SiteConfig } from './types'

/**
 * 配置默认值。
 *
 * 新增字段时只改这里，读取侧会自动把缺失字段合并到默认值上。
 */
export function createDefaultConfig(): SiteConfig {
  return {
    // 留空 = 与站点同源
    apiBaseUrl: '',
  }
}
