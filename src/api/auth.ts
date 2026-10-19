/**
 * 认证接口。
 *
 * 后端契约（地址由 `VITE_API_BASE_URL` 提供，留空 = 与站点同源）：
 *
 * | 方法   | 路径        | 请求体                          | 响应                    |
 * | ------ | ----------- | ------------------------------- | ----------------------- |
 * | `POST` | `/login`    | `{ account, password }`         | `{ token, token_type }` |
 * | `POST` | `/register` | `{ account, email, password }`  | 只返回状态码            |
 * | `GET`  | `/logout`   | 无参数                          | 只返回状态码            |
 *
 * 鉴权方式为 `Authorization: Bearer <token>`：登录成功后令牌交给会话层保存，
 * 之后由通信层自动附到请求头上；退出登录时清掉。
 * 登录 / 注册是公开接口，显式不带令牌（`auth: false`）。
 */

import { postJson, request } from './http'
import { clearSession, setSession } from './session'

export interface LoginPayload {
  /** 账号：用户名或邮箱。 */
  account: string
  password: string
}

export interface RegisterPayload {
  /** 账号：用户名。 */
  account: string
  email: string
  password: string
}

export interface LoginResult {
  token: string
  /** 令牌类型，后端当前固定返回 `Bearer`。 */
  token_type: string
}

/**
 * 登录：成功后令牌交给会话层保存，后续请求自动带上 `Authorization`。
 *
 * @throws 状态码非 2xx、请求没能发出去，或响应里没有可用的 `token`。
 */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  const result = await postJson<LoginResult>('/login', payload, { auth: false })
  const token = typeof result?.token === 'string' ? result.token.trim() : ''

  if (token === '') {
    throw new Error('登录响应里没有可用的 token，无法保存登录状态。')
  }

  // 顺手把账号记进会话：资料接口还没接入，界面靠它区分登录的是哪个用户。
  setSession({ token, tokenType: result.token_type, account: payload.account })

  return result
}

/**
 * 注册：后端只返回状态码，成功时 resolve，不会自动登录。
 *
 * @throws 状态码非 2xx，或请求没能发出去。
 */
export function register(payload: RegisterPayload): Promise<void> {
  return postJson<void>('/register', payload, { auth: false })
}

/**
 * 退出登录：只尝试通知后端，不校验结果。
 *
 * 无论后端返回 2xx 还是 4xx、甚至压根没连上，本地会话都会被清除，函数本身不抛错。
 * 用户点「退出」的意图很明确，本地必须先退出，服务端是否成功吊销令牌不该阻塞它。
 */
export async function logout(): Promise<void> {
  try {
    await request<void>('/logout', { method: 'GET' })
  } catch {
    // 故意吞掉：结果不参与判断，见上方说明。
  } finally {
    clearSession()
  }
}
