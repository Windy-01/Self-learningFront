/**
 * 浏览器内 OCR 引擎（tesseract.js）。
 *
 * 为什么放前端：后端没有识别接口，`Q3` 只收「图片 + 已经写好的题干」。
 * 在框选之后立刻识别，用户只需要对着裁切图核对一遍，比从零手打快得多。
 *
 * 几件必须知道的事：
 * - **首次使用要下载模型**（`chi_sim + eng` 约 4 MB）与 wasm 内核（约 4 MB），
 *   之后浏览器会缓存；离线部署见下面的 `VITE_OCR_*`。
 * - **单例 worker**：wasm 初始化很贵，识别完不销毁，下一次直接复用。
 * - **串行**：worker 一次只能跑一个任务，这里用一条 promise 链排队，
 *   调用方不用关心并发。
 * - **识别质量有限**：中文正文基本可用，公式、上下标、希腊字母经常错。
 *   所以只把它当「草稿生成器」，结果必须可编辑。
 */

type TesseractModule = typeof import('tesseract.js')
type OcrWorker = Awaited<ReturnType<TesseractModule['createWorker']>>

export interface OcrProgressInfo {
  /** 中文状态文案，直接显示 */
  message: string
  /** 0–1 */
  progress: number
}

/** 语言模型目录。默认用 projectnaptha 的 fast 模型（比 4.0.0 小一个数量级）。 */
const LANG_PATH =
  import.meta.env.VITE_OCR_LANG_PATH ?? 'https://tessdata.projectnaptha.com/4.0.0_fast'

const CORE_PATH = import.meta.env.VITE_OCR_CORE_PATH
const WORKER_PATH = import.meta.env.VITE_OCR_WORKER_PATH

/** 识别语言：中文简体 + 英文，后者负责数字、字母、符号 */
const LANGS = ['chi_sim', 'eng']

function describe(status: string): string {
  switch (status) {
    case 'loading tesseract core':
      return '加载识别内核'
    case 'initializing tesseract':
      return '初始化识别引擎'
    case 'loading language traineddata':
      return '下载中文模型（首次约 4 MB）'
    case 'initializing api':
      return '准备识别'
    case 'recognizing text':
      return '识别文字'
    default:
      return status
  }
}

let worker: OcrWorker | null = null
let workerPromise: Promise<OcrWorker> | null = null
/** 排队链：保证同一时刻只有一个识别任务在跑 */
let chain: Promise<unknown> = Promise.resolve()
/** 当前任务的进度回调；worker 初始化期间也要能报进度，所以放在模块级 */
let progressSink: ((info: OcrProgressInfo) => void) | null = null

function report(status: string, progress: number): void {
  progressSink?.({
    message: describe(status),
    progress: Math.min(1, Math.max(0, progress || 0)),
  })
}

async function ensureWorker(): Promise<OcrWorker> {
  if (worker) return worker

  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js')

      const created = await createWorker(LANGS, OEM.LSTM_ONLY, {
        langPath: LANG_PATH,
        ...(CORE_PATH ? { corePath: CORE_PATH } : {}),
        ...(WORKER_PATH ? { workerPath: WORKER_PATH } : {}),
        logger: (message) => report(message.status, message.progress),
      })

      // 选项经常是「A. 1    B. 2」这种靠空格对齐的，保留空格才有机会切开
      await created.setParameters({ preserve_interword_spaces: '1' })

      worker = created

      return created
    })().catch((cause) => {
      // 失败就清掉，下次调用重新尝试（比如用户刚刚连上网）
      workerPromise = null
      throw cause
    })
  }

  return workerPromise
}

/**
 * 识别一张图（dataURL / objectURL / base64 都行）。
 *
 * 多个调用会排队执行，`onProgress` 只属于本次任务。
 */
export function recognizeImage(
  image: string,
  onProgress?: (info: OcrProgressInfo) => void,
): Promise<string> {
  const run = async (): Promise<string> => {
    progressSink = onProgress ?? null

    try {
      const active = await ensureWorker()
      const { data } = await active.recognize(image)

      return data.text ?? ''
    } finally {
      progressSink = null
    }
  }

  const result = chain.then(run)

  // 链本身不关心成败，否则一次失败会让后面所有识别都跟着 reject
  chain = result.then(
    () => undefined,
    () => undefined,
  )

  return result
}

/** 页面卸载时释放 wasm 内存；模型本身在浏览器缓存里，下次进来重新初始化很快。 */
export async function disposeOcr(): Promise<void> {
  const active = worker

  worker = null
  workerPromise = null
  progressSink = null

  if (!active) return

  try {
    await active.terminate()
  } catch {
    /* 已经终止 / 正在终止，忽略 */
  }
}
