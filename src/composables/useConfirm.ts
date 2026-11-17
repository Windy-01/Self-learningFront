import { reactive } from 'vue'

/**
 * Promise 化的确认弹窗。
 *
 * ```ts
 * if (!(await askConfirm({ title: '删除？', body: '不可恢复。', danger: true }))) return
 * ```
 *
 * 不用 `window.confirm`：它会阻塞主线程，深色主题下还会突然闪一下白。
 * 状态是模块级单例，渲染由 `ConfirmDialog` 负责。
 */

export interface ConfirmOptions {
  title: string
  body?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮用深色实心，文案要写清后果 */
  danger?: boolean
}

interface ConfirmState {
  open: boolean
  title: string
  body: string
  confirmText: string
  cancelText: string
  danger: boolean
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  body: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
})

let resolver: ((value: boolean) => void) | null = null

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  // 上一个还没结算就被新弹窗顶掉：旧的一律按「取消」处理，避免 Promise 永久挂起。
  resolver?.(false)

  confirmState.open = true
  confirmState.title = options.title
  confirmState.body = options.body ?? ''
  confirmState.confirmText = options.confirmText ?? '确认'
  confirmState.cancelText = options.cancelText ?? '取消'
  confirmState.danger = options.danger ?? false

  return new Promise<boolean>((resolve) => {
    resolver = resolve
  })
}

export function settleConfirm(value: boolean): void {
  confirmState.open = false

  const resolve = resolver
  resolver = null

  resolve?.(value)
}
