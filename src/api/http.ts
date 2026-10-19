/**
 * 通信层 —— 站内唯一的网络出口。
 *
 * 四件事只在这里做：
 * 1. 拼地址：统一以 `VITE_API_BASE_URL` 为前缀，留空则与站点同源；
 * 2. 鉴权：已登录时自动带上 `Authorization: Bearer <token>`；
 * 3. 编解码：请求体自动 JSON 序列化，响应体自动解析；
 * 4. 错误：非 2xx 与「请求根本没发出去」统一转成 `ApiError`。
 *
 * 业务模块只描述「请求哪个路径、带什么参数、返回什么类型」，
 * 不要自己调 fetch，也不要自己拼 base url、自己写 Authorization。
 */

import { normalizeApiBaseUrl, useConfig } from '@/config'
import { clearSession, getAuthorizationHeader } from './session'

/** 构建期兜底地址：运行时配置留空时使用。 */
const ENV_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/**
 * 当前生效的接口前缀：运行时配置（cookie）> 构建期环境变量 > 同源（空串）。
 *
 * 配置来自 `config/`，因此父项目里设置过的 API 地址在本项目首次访问时可以直接继承。
 */
function resolveBaseUrl(): string {
  const { config } = useConfig()

  return normalizeApiBaseUrl(config.apiBaseUrl) || ENV_BASE_URL
}

export class ApiError extends Error {
  /** HTTP 状态码；`0` 表示请求根本没发出去（断网 / 服务未启动 / 跨域被拦）。 */
  readonly status: number
  /** 服务端返回的原始响应体。 */
  readonly body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** 查询参数；值为 `undefined` / `null` 的键会被跳过。 */
export type QueryParams = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: QueryParams
  /** 用于取消请求；被取消时原样抛出 `AbortError`。 */
  signal?: AbortSignal
  /** 是否附带登录令牌，默认 `true`；登录 / 注册等公开接口显式传 `false`。 */
  auth?: boolean
}

function resolveUrl(path: string, query?: QueryParams): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  let url = `${resolveBaseUrl()}${suffix}`

  if (query !== undefined) {
    const search = new URLSearchParams()

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        search.append(key, String(value))
      }
    }

    const queryString = search.toString()

    if (queryString !== '') {
      url += `${url.includes('?') ? '&' : '?'}${queryString}`
    }
  }

  return url
}

/** 从响应体里尽量抽出一句可读的错误信息；抽不到就返回空串。 */
function extractMessage(body: unknown): string {
  if (typeof body === 'string') {
    const text = body.trim()

    // 过长的文本、HTML 错误页都不适合直接展示给用户。
    if (text === '' || text.length > 200 || text.startsWith('<')) {
      return ''
    }

    return text
  }

  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>
    const detail = record.message ?? record.detail ?? record.error

    if (typeof detail === 'string' && detail.trim() !== '') {
      return detail.trim()
    }
  }

  return ''
}

/** 读响应体：204 或空响应返回 `undefined`，其余尽量按 JSON 解析。 */
async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined
  }

  const text = await response.text()

  if (text.trim() === '') {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/**
 * 发起一次请求并返回解析后的响应体。
 *
 * - `2xx`：返回响应体；后端只返回状态码（空响应 / 204）时为 `undefined`；
 * - 其它状态码：抛 `ApiError`，`status` 是 HTTP 状态码；
 * - 请求没能发出：抛 `ApiError`，`status` 为 `0`。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, auth = true } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  let payload: string | undefined

  if (auth) {
    const authorization = getAuthorizationHeader()

    if (authorization !== null) {
      headers.Authorization = authorization
    }
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response: Response

  try {
    response = await fetch(resolveUrl(path, query), { method, headers, body: payload, signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause
    }

    throw new ApiError(0, '无法连接到服务器，请检查网络或 API 地址。', null)
  }

  const responseBody = await readBody(response)

  if (!response.ok) {
    // 带鉴权的请求收到 401：本地令牌已不可用（过期 / 被吊销），直接清掉会话，
    // 界面随之回到未登录，避免顶栏显示「已登录」却什么也做不了。
    // 登录 / 注册是 `auth: false`，它们返回 401（账号密码错误）时不会走到这里。
    if (response.status === 401 && auth) {
      clearSession()
    }

    const message =
      extractMessage(responseBody)
      || (response.statusText.trim() !== ''
        ? response.statusText.trim()
        : `请求失败（HTTP ${response.status}）。`)

    throw new ApiError(response.status, message, responseBody)
  }

  return responseBody as T
}

/** GET 请求，返回 JSON。 */
export function getJson<T>(
  path: string,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
): Promise<T> {
  return request<T>(path, { ...options, method: 'GET' })
}

/** POST 请求，`body` 会被 JSON 序列化。 */
export function postJson<T>(
  path: string,
  body?: unknown,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
): Promise<T> {
  return request<T>(path, { ...options, method: 'POST', body })
}
