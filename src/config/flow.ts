import type { IconName } from '@/components/common/icons'

/**
 * 主流程定义：拍照 → 识别 → 打标签 → 入库 → 复习卷。
 *
 * 这份数据同时驱动三处，改一处即可全部同步：
 * - 主页的流程卡片
 * - 各流程页顶部的步骤导航
 * - 页面文案（标题 / 描述）
 */
export interface FlowStep {
  /** 路由名，跳转统一用 name */
  name: string
  /** 步骤标题，同时用作页面标题 */
  title: string
  /** 一句话说明这一步做什么 */
  description: string
  icon: IconName
}

export const flowSteps: FlowStep[] = [
  {
    name: 'capture',
    title: '拍照上传',
    description: '上传试卷照片，作为识别与入库流程的起点。',
    icon: 'camera',
  },
  {
    name: 'question-edit',
    title: '题目编辑',
    description: '校对后端识别出的题干、选项与答案，修正后再入库。',
    icon: 'edit',
  },
  {
    name: 'tags',
    title: '标签管理',
    description: '标注学年、科目与知识点，建立可统计的索引。',
    icon: 'tag',
  },
  {
    name: 'questions',
    title: '题目管理',
    description: '保存题目、答案与作答记录，形成个人题库。',
    icon: 'layers',
  },
  {
    name: 'review',
    title: '复习卷生成',
    description: '按标签与通过率抽取题目，组成一份复习卷。',
    icon: 'fileText',
  },
]
