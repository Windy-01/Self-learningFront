import { ref } from 'vue'

/**
 * 轻提示。成功/失败都用它，2 秒自动消失 —— 不打断操作。
 *
 * 全局单例：任何模块 `useToast().push('...')` 即可，渲染由 `ToastHost` 统一负责。
 */

export interface ToastItem {
  id: number
  message: string
}

const items = ref<ToastItem[]>([])
let seq = 0

function push(message: string, duration = 2400): void {
  const id = ++seq

  items.value = [...items.value, { id, message }]

  window.setTimeout(() => {
    items.value = items.value.filter((item) => item.id !== id)
  }, duration)
}

export function useToast() {
  return { items, push }
}
