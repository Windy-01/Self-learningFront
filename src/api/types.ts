/**
 * 接口出参类型 —— **按后端原样命名**。
 *
 * 两条铁律：
 * 1. DTO（`dto/` 包）是 camelCase，实体（`entity/` 包）是 snake_case。
 *    这里不统一、不映射 —— 映射层会让「接口到底返回了什么」变得不可见，
 *    后端哪天改了字段，前端会在映射层静默变成 undefined。
 * 2. `content.question_id` / `content.userid` 不可信，ID 一律取顶层 `questionId`。
 */

/* ---------------- 题干 ---------------- */

export interface QuestionOption {
  key: string
  markup: string
}

/**
 * 题干 JSON。
 * 入库时是**字符串**，读取时是**对象**；`question_id` / `userid` 可能为 null。
 */
export interface QuestionContent {
  question_id?: number | null
  userid?: number | null
  type?: string | null
  choice_mode?: string | null
  stem_markup?: string | null
  options?: QuestionOption[] | null
}

/* ---------------- 实体（snake_case） ---------------- */

export interface TagEntity {
  tag_id: number
  /** `0` 表示系统预置，不能改/删 */
  userid: number
  name: string
}

export interface KnowledgePointEntity {
  knowledge_point_id: number
  /** `0` 表示系统预置，不能改/删 */
  userid: number
  name: string
}

/**
 * 标签维度统计（L7，聚合，非表实体）。
 *
 * `score_rate` 是**通过率**（累计得分 ÷ 累计满分），不是「做对的题数占比」。
 * `attempted_count` 用来区分「没做过」（0）和「做过但全错」（`score_rate = 0`）。
 * 没有任何题目的标签不会出现在结果里。
 */
export interface LabelStat {
  tag_id: number
  name: string
  question_count: number
  /** 做过至少一次的题目数 */
  attempted_count: number
  /** 从未评分作答时为 null —— 与 0% 是两回事 */
  score_rate: number | null
}

/**
 * 学情总览（S1，跨域汇总）。
 *
 * 区分两个「次数」：
 * - `attempted_questions` = 做过至少一次的**题目数**（同一题做 3 次算 1）；
 * - `attempt_count` = 已评分**作答次数**合计（同一题做 3 次算 3）。
 *
 * 一题都没有时仍返回 200，各项为 0、`score_rate` 为 null。
 */
export interface LearningStat {
  total_questions: number
  resolved_count: number
  unresolved_count: number
  attempted_questions: number
  attempt_count: number
  total_score: number
  total_max_score: number
  score_rate: number | null
}

/** 知识点掌握度（聚合，非表实体）。 */
export interface KnowledgeStat {
  knowledge_point_id: number
  name: string
  question_count: number
  attempt_count: number
  total_score: number
  total_max_score: number
  /** 从未有效作答时为 null —— 与 0% 是两回事 */
  score_rate: number | null
}

export interface QuestionStatEntity {
  userid: number
  question_id: number
  attempt_count: number
  total_score: number
  total_max_score: number
  score_rate: number | null
  updated_at: string
}

/** 复习卷状态：0 待作答 / 1 作答中（预留）/ 2 已提交 / 3 已作废 */
export type ReviewSheetStatus = 0 | 1 | 2 | 3

export interface ReviewSheetEntity {
  review_sheet_id: number
  userid: number
  title: string | null
  status: number
  question_count: number
  total_score: number
  total_max_score: number
  score_rate: number | null
  created_at: string
  submitted_at: string | null
  updated_at: string
}

/* ---------------- DTO（camelCase） ---------------- */

/** Q1 搜索结果项。 */
export interface SearchItem {
  questionId: number
  type: string | null
  choiceMode: string | null
  stemMarkup: string | null
}

export interface SearchResponse {
  total: number
  page: number
  size: number
  items: SearchItem[]
}

/** Q2 上传结果。`url` 是预签名地址，30 分钟过期，**不要缓存**。 */
export interface UploadedImage {
  key: string
  url: string
}

/** Q4 列表项。不返回答案，也不返回标签。 */
export interface QuestionSummary {
  questionId: number
  type: string | null
  choiceMode: string | null
  stemMarkup: string | null
  status: string
  source: string | null
  imageUrls: string[]
  createdAt: string
}

/** Q14 作答记录。**没有时间字段**，只能按次数编号。 */
export interface AnswerRecordView {
  answerRecordId: number
  questionId: number
  reviewSheetQuestionId: number | null
  sourceType: string
  userAnswer: string | null
  score: number | null
  maxScore: number | null
}

/** Q5 题目详情。 */
export interface QuestionDetail {
  questionId: number
  content: QuestionContent | null
  imageUrls: string[]
  answer: string | null
  answerImageUrls: string[]
  status: string
  source: string | null
  createdAt: string
  tags: TagEntity[]
  knowledgePoints: KnowledgePointEntity[]
  /** 从未被评分过时为 null */
  stat: QuestionStatEntity | null
}

/** Q6 局部更新。字段为 undefined = 不修改（JSON 序列化时会直接丢掉）。 */
export interface QuestionPatch {
  content?: string
  source?: string
  status?: string
  imageKeys?: string[]
  answer?: string
  answerImageKeys?: string[]
}

/** O1 / O2 卷内题目。**不返回答案快照**。 */
export interface ReviewSheetItem {
  reviewSheetQuestionId: number
  seqNo: number
  questionId: number
  content: QuestionContent | null
  imageUrls: string[]
}

export interface ReviewSheetDetail {
  sheet: ReviewSheetEntity
  items: ReviewSheetItem[]
}

/** O4 单题作答。`score` 与 `maxScore` 必须同时给或同时不给。 */
export interface SubmitAnswer {
  reviewSheetQuestionId: number
  questionId: number
  userAnswer?: string | null
  score?: number | null
  maxScore?: number | null
}

/* ---------------- 布尔结果 ---------------- */

/** 后端把「目标不存在 / 无权限」也返回 200 + false，语义是「没做成」，不是错误。 */
export interface DeletedResult {
  deleted: boolean
}
export interface AddedResult {
  added: boolean
}
export interface RemovedResult {
  removed: boolean
}
export interface RenamedResult {
  renamed: boolean
}
export interface MergedResult {
  merged: boolean
}
export interface CancelledResult {
  cancelled: boolean
}
