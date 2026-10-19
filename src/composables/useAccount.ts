import { computed, ref, watch } from 'vue'
import { loggedIn, session } from '@/api/session'
import { fetchCurrentUser, type CurrentUser } from '@/api/users'

/**
 * 账号展示状态（单例）。
 *
 * 顶栏和侧栏都要显示「当前登录的是谁」，如果各自拉一次资料会重复请求、
 * 还可能短暂不一致，所以这里集中维护一份，谁用谁取。
 */
const currentUser = ref<CurrentUser | null>(null)

/** 请求序号：登录态连续变化时只认最后一次的结果。 */
let currentUserRequest = 0

async function loadCurrentUser(): Promise<void> {
  const request = ++currentUserRequest

  if (!loggedIn.value) {
    currentUser.value = null
    return
  }

  try {
    const result = await fetchCurrentUser()

    if (request === currentUserRequest) {
      currentUser.value = result
    }
  } catch {
    // 资料接口失败不该让界面不可用，退化成账号占位即可。
    if (request === currentUserRequest) {
      currentUser.value = null
    }
  }
}

// 监听 session 本身而不是 loggedIn：换账号时 loggedIn 仍是 true，只有会话对象会变。
watch(
  () => session.value,
  () => {
    void loadCurrentUser()
  },
  { immediate: true },
)

/** 顶栏空间有限：邮箱只留 `@` 前面的部分，过长再截断。 */
function shortenAccount(account: string): string {
  const at = account.indexOf('@')
  const local = at > 0 ? account.slice(0, at) : account

  return local.length > 14 ? `${local.slice(0, 13)}…` : local
}

export function useAccount() {
  /** 登录时填的完整账号（用户名或邮箱）。 */
  const account = computed(() => session.value?.account ?? '')

  /** 显示名：服务端显示名 → 登录账号 → 登录态占位。 */
  const displayName = computed(() => {
    const name = currentUser.value?.name.trim() ?? ''

    if (name !== '') {
      return name
    }

    if (account.value !== '') {
      return shortenAccount(account.value)
    }

    return loggedIn.value ? '已登录' : '未登录'
  })

  /** 头像首字母：有真实头像时不显示。 */
  const avatarInitial = computed(() => {
    if ((currentUser.value?.avatar ?? '') !== '' || account.value === '') {
      return ''
    }

    const at = account.value.indexOf('@')
    const local = at > 0 ? account.value.slice(0, at) : account.value

    return local.charAt(0).toUpperCase()
  })

  /** 完整账号，用于 title / 下拉菜单。 */
  const accountLabel = computed(() => account.value)

  return { loggedIn, account, accountLabel, displayName, avatarInitial, currentUser }
}
