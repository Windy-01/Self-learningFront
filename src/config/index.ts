import { computed, reactive, ref } from 'vue'
import { readCookie, removeCookie, writeCookie } from '@/utils/cookie'
import { createDefaultConfig } from './defaults'
import type { ConfigSource, PersistedConfig, SiteConfig } from './types'

/**
 * 站点配置的**唯一入口**。
 *
 * 调用方式只有一种：
 * ```ts
 * const { config, saveConfig, resetConfig } = useConfig()
 * config.apiBaseUrl   // 读
 * saveConfig({ ... }) // 写（同时落盘）
 * ```
 *
 * 存储沿用父项目（windy-01.github.io）的做法：整份配置序列化进一个 cookie，
 * 读取时**逐字段**合并到默认值上 —— cookie 缺失、JSON 损坏、某个字段没写、
 * 值类型不对，都只让对应字段回落到默认值，而不是整体失效。
 *
 * 与父项目的区别：
 * - 本项目用自己的 cookie 名 `console-settings`，两套配置互不覆盖；
 * - 本站部署在父项目的子路径（/Self-learningFront/）下，同源因此能读到父项目的
 *   cookie；当自己的 cookie 没有任何设置内容时，从 `windy-settings` 继承
 *   双方共有的字段（目前是 `apiBaseUrl`）。
 */

/** 本项目自己的配置 cookie。 */
export const configCookieName = 'console-settings'

/** 父项目的配置 cookie，同源可读，仅用于首次继承。 */
export const legacyConfigCookieName = 'windy-settings'

/** cookie 有效期（天）。 */
const configCookieMaxAgeDays = 365

/** 只接受非空字符串；其余（undefined / 空串 / 非字符串）一律视为「无数据」。 */
function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

/** 解析 cookie 里的 JSON 对象；缺失 / 损坏 / 非对象都返回 null。 */
function parseStoredConfig(raw: string | null): Record<string, unknown> | null {
  if (raw === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }

    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * 从父项目的配置里挑出本项目认识的字段。
 *
 * 父项目还有背景图、搜索引擎、聊天布局等设置，本项目没有对应功能，
 * 这里只取双方都有的 `apiBaseUrl`。新增共有字段时在这里补一行即可。
 */
function inheritFromLegacy(legacy: Record<string, unknown> | null): Partial<SiteConfig> {
  if (legacy === null) {
    return {}
  }

  const inherited: Partial<SiteConfig> = {}
  const apiBaseUrl = readString(legacy.apiBaseUrl, '')

  if (apiBaseUrl !== '') {
    inherited.apiBaseUrl = apiBaseUrl
  }

  return inherited
}

interface LoadedConfig {
  config: SiteConfig
  source: ConfigSource
}

function loadConfig(): LoadedConfig {
  const defaults = createDefaultConfig()
  const own = parseStoredConfig(readCookie(configCookieName))

  // 有键就说明是本项目自己写过的配置（哪怕是空串，也代表用户显式选择「同源」）。
  if (own !== null && Object.keys(own).length > 0) {
    return {
      config: {
        ...defaults,
        apiBaseUrl: readString(own.apiBaseUrl, defaults.apiBaseUrl),
      },
      source: 'own',
    }
  }

  // 自己没有配置：尝试继承父项目的 cookie
  const inherited = inheritFromLegacy(parseStoredConfig(readCookie(legacyConfigCookieName)))

  if (Object.keys(inherited).length > 0) {
    return { config: { ...defaults, ...inherited }, source: 'inherited' }
  }

  return { config: defaults, source: 'default' }
}

const initial = loadConfig()

/** 全局唯一的运行时配置。 */
const config = reactive<SiteConfig>(initial.config)

/** 当前配置的来源：own / inherited / default。 */
const configSource = ref<ConfigSource>(initial.source)

/** 是否在用内置默认值（两处 cookie 都没有有效数据）。 */
const isUsingDefaults = computed(() => configSource.value === 'default')

/** 是否继承了父项目的配置。 */
const isInherited = computed(() => configSource.value === 'inherited')

/**
 * 保存配置。
 *
 * 参数是**增量**：只需要传想改的字段，没传的沿用当前运行时配置。
 * **先写 cookie，写成功才应用**，避免「页面已经变了、刷新却还原」。
 * 返回 false 表示浏览器拒绝写入（cookie 被禁用或超出容量），此时内存状态不变。
 */
export function saveConfig(next: Partial<PersistedConfig>): boolean {
  const merged: PersistedConfig = {
    apiBaseUrl: next.apiBaseUrl ?? config.apiBaseUrl,
  }

  if (
    !writeCookie(configCookieName, JSON.stringify(merged), {
      maxAgeDays: configCookieMaxAgeDays,
    })
  ) {
    return false
  }

  config.apiBaseUrl = merged.apiBaseUrl
  configSource.value = 'own'

  return true
}

/**
 * 恢复默认：删掉本项目的 cookie。
 *
 * 删除后会重新走一次加载流程 —— 父项目有配置就重新继承，没有就回到默认值。
 */
export function resetConfig(): void {
  removeCookie(configCookieName)

  const reloaded = loadConfig()

  config.apiBaseUrl = reloaded.config.apiBaseUrl
  configSource.value = reloaded.source
}

export function useConfig() {
  return {
    /** 运行时配置。**只读**，需要修改请调用 `saveConfig()`。 */
    config,
    /** 配置来源。 */
    configSource,
    /** 是否正在使用默认配置。 */
    isUsingDefaults,
    /** 是否继承自父项目的 cookie。 */
    isInherited,
    saveConfig,
    resetConfig,
  }
}

export { isApiBaseUrlInvalid, normalizeApiBaseUrl } from './endpoint'
export type { ConfigSource, PersistedConfig, SiteConfig } from './types'
