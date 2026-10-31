/**
 * 题目识别（OCR）与题目保存的数据源。
 *
 * 对外只暴露 Promise 化的三个函数，组件不关心数据从哪来：
 * - `submitRecognize()`    提交一批裁剪后的图片，拿到一个识别任务
 * - `fetchRecognizeTask()` 按任务 id 取回识别结果（刷新页面时用）
 * - `saveQuestions()`      保存用户校对后的题目
 *
 * 一次任务可以包含多张图片（多页试卷），每页各自带切题结果。
 *
 * ⚠️ 目前**全部是前端 mock，不请求后端**。接入时只改这三个函数体，
 * 调用方（拍照页、题目编辑页）不需要改动。
 *
 * 后端契约（预留，尚未实现）：
 *
 *   POST /recognize        multipart/form-data
 *     images   : 图片文件，同名多值，按上传顺序对应页序
 *     names    : 原始文件名，与 images 同序
 *     sizes    : 图片宽高，`宽x高`，与 images 同序
 *   -> RecognizeTask
 *
 *   GET /recognize/{taskId}
 *   -> RecognizeTask；任务不存在或已过期返回 404
 *
 *   POST /questions        application/json
 *     { taskId, questions: RecognizedQuestion[] }
 *   -> { saved: number }
 */

/** 题目在原图中的区域，归一化到 0–1；后端未返回时为 `null`。 */
export interface QuestionRegion {
  x: number
  y: number
  w: number
  h: number
}

/** 后端识别出的一道题，也是编辑页直接操作的数据结构。 */
export interface RecognizedQuestion {
  id: string
  /** 所属页，编辑页按它分组、右栏按它联动。 */
  pageId: string
  /** 题号，如 `12`、`12(1)`；识别失败时为空串。 */
  number: string
  /** 题干，OCR 未识别时为空串。 */
  stem: string
  /** 选项；非选择题为空数组。 */
  options: string[]
  /** 答案；未识别时为空串。 */
  answer: string
  region: QuestionRegion | null
}

/** 试卷的一页。 */
export interface RecognizePage {
  pageId: string
  /** 图片地址。接入后为后端返回的静态资源地址，mock 阶段是本地 object URL。 */
  imageUrl: string
  width: number
  height: number
  questions: RecognizedQuestion[]
}

/** 一次识别任务，可包含多页。 */
export interface RecognizeTask {
  taskId: string
  createdAt: number
  pages: RecognizePage[]
}

export interface SubmitRecognizeInput {
  /** 裁剪后的图片；未裁剪时为原图。 */
  image: Blob
  fileName: string
  width: number
  height: number
}

export interface SaveQuestionsInput {
  taskId: string
  questions: RecognizedQuestion[]
}

/* ------------------------------------------------------------------ */
/* 以下为 mock 实现                                                     */
/* ------------------------------------------------------------------ */

/** 任务缓存，模拟后端的任务存储。接入后删除。 */
const tasks = new Map<string, RecognizeTask>()

/** 最近一次任务的 id，用于回收上一个任务的 object URL。 */
let latestTaskId = ''

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createTaskId(): string {
  const stamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)

  return `task_${stamp}_${random}`
}

/** 释放上一个任务占用的图片地址，避免 object URL 堆积。 */
function releaseLatest(): void {
  if (latestTaskId === '') return

  const previous = tasks.get(latestTaskId)

  if (previous) {
    for (const page of previous.pages) {
      if (page.imageUrl.startsWith('blob:')) URL.revokeObjectURL(page.imageUrl)
    }
  }

  tasks.delete(latestTaskId)
  latestTaskId = ''
}

/**
 * 提交一批图片，开始一次识别。
 *
 * 接入后：
 * ```ts
 * const form = new FormData()
 * for (const input of inputs) {
 *   form.append('images', input.image, input.fileName)
 *   form.append('names', input.fileName)
 *   form.append('sizes', `${input.width}x${input.height}`)
 * }
 * return postForm<RecognizeTask>('/recognize', form)
 * ```
 */
export async function submitRecognize(inputs: SubmitRecognizeInput[]): Promise<RecognizeTask> {
  if (inputs.length === 0) {
    throw new Error('至少需要一张图片。')
  }

  // 页数越多，模拟耗时越长，让 loading 状态看起来更真实。
  await delay(500 + inputs.length * 150)

  releaseLatest()

  const taskId = createTaskId()

  const pages: RecognizePage[] = inputs.map((input, index) => {
    const pageId = `p-${index + 1}`

    return {
      pageId,
      imageUrl: URL.createObjectURL(input.image),
      width: input.width,
      height: input.height,
      // 后端此时应返回切题结果。未接入前每页给一道字段全空的题，
      // 让编辑页有可编辑的骨架，用户也能自行增删题目。
      questions: [
        {
          id: `${pageId}-q1`,
          pageId,
          number: '1',
          stem: '',
          options: ['', '', '', ''],
          answer: '',
          region: null,
        },
      ],
    }
  })

  const task: RecognizeTask = { taskId, createdAt: Date.now(), pages }

  tasks.set(taskId, task)
  latestTaskId = taskId

  return task
}

/**
 * 按 id 取回识别任务。
 *
 * 接入后：`return getJson<RecognizeTask>(`/recognize/${taskId}`)`，
 * 404 时通信层会抛 `ApiError`，这里捕获后返回 `null`。
 */
export async function fetchRecognizeTask(taskId: string): Promise<RecognizeTask | null> {
  await delay(120)

  return tasks.get(taskId) ?? null
}

/**
 * 保存校对后的题目。
 *
 * 接入后：`return postJson<{ saved: number }>('/questions', input)`
 */
export async function saveQuestions(input: SaveQuestionsInput): Promise<{ saved: number }> {
  await delay(500)

  const task = tasks.get(input.taskId)

  if (task) {
    // mock 里按 pageId 把题目写回对应页，保持结构一致。
    for (const page of task.pages) {
      page.questions = input.questions.filter((item) => item.pageId === page.pageId)
    }
  }

  return { saved: input.questions.length }
}
