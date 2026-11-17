import type { IconName } from '@/components/common/icons'

/**
 * 顶栏导航。
 *
 * 分两层：
 * - `primary`：日常动线（看板 → 题库 → 复习 → 分析），每天都会点；
 * - `secondary`：低频维护（整理），放在分隔线右侧，不跟日常动线抢注意力。
 *
 * 「录入题目」不在导航里 —— 它是**动作**不是页面，放在顶栏主按钮。
 */
export interface NavItem {
  /** 路由名 */
  name: string
  label: string
  icon: IconName
}

export const primaryNav: NavItem[] = [
  { name: 'dashboard', label: '工作台', icon: 'dashboard' },
  { name: 'questions', label: '题库', icon: 'layers' },
  { name: 'review', label: '复习卷', icon: 'fileText' },
  { name: 'analysis', label: '学情分析', icon: 'chart' },
]

export const secondaryNav: NavItem[] = [
  { name: 'organize', label: '整理', icon: 'tag' },
]

/** 详情页要把它所属的一级导航点亮。 */
export const navAlias: Record<string, string> = {
  'question-detail': 'questions',
  'review-new': 'review',
  'review-detail': 'review',
}
