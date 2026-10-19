/**
 * 会话层 —— 保存登录令牌，并提供通信层需要的 `Authorization` 请求头。
 *
 * 后端契约：`POST /login` 返回 `{ token, token_type }`，
 * 之后所有需要鉴权的请求都带 `Authorization: Bearer <token>`。
 *
 * 分工：
 * - 本文件只管「令牌存在哪、怎么读」，不碰网络；
 * - 通信层 `./http.ts` 发请求时自动调用 `getAuthorizationHeader()` 附上头；
 * - 业务层 `./auth.ts` 登录成功时 `setSession()`、退出时 `clearSession()`。
 *
 * 令牌存在 `localStorage`（键 `console-session`），刷新后仍有效。
 * 读取时逐字段校验，缺失 / 类型不对 / JSON 损坏 / 存储被禁用，一律视为未登录。
 */

import { computed, ref } from 'vue'

const SESSION_STORAGE_KEY = 'console-session'

/** 后端没给（或给了空串）`token_type` 时使用的默认鉴权方案。 */
export const defaultTokenType = 'Bearer'

export interface Session {
  token: string
  tokenType: string
  /**
   * 登录时填写的账号（用户名或邮箱）。
   * 用户资料接口（`GET /users/me`）尚未接入，界面靠它区分「登录的是谁」。
   */
  account: string
}

/** 规整鉴权方案：非空字符串原样使用，其余回落到 `Bearer`。 */
function normalizeTokenType(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim()
  }

  return defaultTokenType
}

/** 从 `localStorage` 读回会话；任何异常都当作未登录。 */
function readStoredSession(): Session | null {
  let raw: string | null

  try {
    raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }

  if (raw === null || raw.trim() === '') {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }

    const record = parsed as Record<string, unknown>
    const token = typeof record.token === 'string' ? record.token.trim() : ''

    if (token === '') {
      return null
    }

    return {
      token,
      tokenType: normalizeTokenType(record.tokenType),
      account: typeof record.account === 'string' ? record.account.trim() : '',
    }
  } catch {
    return null
  }
}

/** 当前会话，`null` 表示未登录（响应式）。 */
export const session = ref<Session | null>(readStoredSession())

/** 是否已登录（响应式）。界面跟随登录状态变化时直接用它。 */
export const loggedIn = computed(() => session.value !== null)

/** 是否已登录（函数形式，供路由守卫使用）。 */
export function isLoggedIn(): boolean {
  return loggedIn.value
}

/** 当前访问令牌；未登录时为 `null`。 */
export function getAccessToken(): string | null {
  return session.value === null ? null : session.value.token
}

/** 拼出 `Authorization` 请求头的值，未登录时为 `null`。 */
export function getAuthorizationHeader(): string | null {
  const current = session.value

  if (current === null) {
    return null
  }

  return `${current.tokenType} ${current.token}`
}

/**
 * 保存会话：先更新内存（立即生效），再尝试写入 `localStorage`。
 * 写入失败（隐私模式 / 配额满）不影响本次会话，只是刷新后回到未登录。
 */
export function setSession(next: {
  token: string
  tokenType?: string
  account?: string
}): void {
  session.value = {
    token: next.token.trim(),
    tokenType: normalizeTokenType(next.tokenType),
    account: typeof next.account === 'string' ? next.account.trim() : '',
  }

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session.value))
  } catch {
    // 写不进去就只在内存里保留，不打断登录流程。
  }
}

/** 清除会话（退出登录、令牌失效时调用）。 */
export function clearSession(): void {
  session.value = null

  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // 存储不可用时忽略。
  }
}

/**
 * 跨标签页同步登录状态。
 * `storage` 事件只在其它标签页写入时触发，不会和自己的写入互相覆盖。
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== SESSION_STORAGE_KEY) {
      return
    }

    session.value = readStoredSession()
  })
}
