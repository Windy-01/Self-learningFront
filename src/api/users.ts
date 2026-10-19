/**
 * 用户资料数据源。
 *
 * 对外只暴露 Promise 化的 `fetchCurrentUser()`，组件不关心数据从哪来。
 * 接入真实接口时只改本文件的函数体（请求走通信层 `./http.ts`），调用方不用动。
 */

/** 「当前登录用户」的保留 id。 */
export const currentUserId = 'me'

/** 「当前登录用户」的精简资料（顶栏、侧栏用）。 */
export interface CurrentUser {
  id: string
  name: string
  login: string
  /** 头像地址；为空时使用账号首字母占位。 */
  avatar: string
}

/**
 * 拉取「当前登录用户」的资料。
 *
 * 契约（**预留给后端，尚未接入**）：`GET /users/me`，带
 * `Authorization: Bearer <token>`，返回 `CurrentUser`；令牌失效时返回 401
 * （通信层会自动清掉本地会话，界面随之回到未登录）。
 *
 * ⚠️ 目前恒返回 `null`，界面只能显示登录时填的账号。
 * 接入时把函数体换成 `getJson<CurrentUser>('/users/me')` 即可。
 */
export function fetchCurrentUser(): Promise<CurrentUser | null> {
  return Promise.resolve(null)
}
