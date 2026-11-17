/**
 * 图片裁切工具。
 *
 * 后端 `Q3` 只接受「裁好的单题图片」，所以「一张卷子录多题」必须在前端切块。
 * 这里只做纯计算，不碰业务状态：
 * - `cropToBlob`：按百分比区域从原图裁出一块，输出 JPEG Blob（直接喂给 `Q3`）；
 * - `downscaleToDataUrl`：给草稿用的压缩副本（原图只在内存里，刷新就没了）；
 * - `dataUrlToBlob`：草稿恢复时把 dataURL 还原成可上传的 Blob。
 *
 * 坐标系一律用**百分比**（相对原图宽高），与框选组件保持一致，
 * 这样图片在页面上怎么缩放都不影响裁切结果。
 */

export interface RectPercent {
  x: number
  y: number
  w: number
  h: number
}

/** 裁切输出的最大宽度：试卷照片原图常有 3000px+，裁一块不需要那么大。 */
const MAX_OUTPUT_WIDTH = 2200

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法解析，请换一张 JPG / PNG 图片。'))
    image.src = src
  })
}

/** `canvas.toBlob` 是回调式（Safari 只支持这种），统一包成 Promise。 */
function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('裁切失败：浏览器没有返回图片数据。'))
      },
      type,
      quality,
    )
  })
}

/**
 * 把一块区域画到 canvas 上。
 *
 * `maxWidth` 与 `minWidth` 是两条相反的限制：
 * - 上传的题目图不需要原图那么大 → `maxWidth` 封顶，省流量；
 * - OCR 对小字很敏感 → `minWidth` 兜底，太窄的裁切放大两倍再识别。
 */
async function cropCanvas(
  src: string,
  rect: RectPercent,
  limits: { maxWidth?: number; minWidth?: number } = {},
): Promise<HTMLCanvasElement> {
  const image = await loadImage(src)
  const naturalWidth = image.naturalWidth
  const naturalHeight = image.naturalHeight

  if (!naturalWidth || !naturalHeight) {
    throw new Error('图片尺寸异常，无法裁切。')
  }

  const sourceX = (rect.x / 100) * naturalWidth
  const sourceY = (rect.y / 100) * naturalHeight
  const sourceWidth = Math.max(1, (rect.w / 100) * naturalWidth)
  const sourceHeight = Math.max(1, (rect.h / 100) * naturalHeight)

  let scale = 1

  if (limits.maxWidth && sourceWidth > limits.maxWidth) scale = limits.maxWidth / sourceWidth
  else if (limits.minWidth && sourceWidth < limits.minWidth) {
    scale = Math.min(2, limits.minWidth / sourceWidth)
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('当前浏览器不支持图片裁切。')
  }

  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return canvas
}

/**
 * 按百分比区域裁切图片。
 *
 * `src` 可以是 objectURL，也可以是 dataURL —— 草稿恢复后的图走的就是 dataURL。
 */
export async function cropToBlob(
  src: string,
  rect: RectPercent,
  maxWidth = MAX_OUTPUT_WIDTH,
): Promise<Blob> {
  const canvas = await cropCanvas(src, rect, { maxWidth })

  return canvasToBlob(canvas)
}

/**
 * 给 OCR 用的裁切：PNG（无损，JPEG 的块效应会糊掉小字），
 * 窄于 700px 的块放大到 700–1400px —— Tesseract 对字高 < 20px 的文字几乎无能为力。
 *
 * 输出 dataURL 而不是 Blob：tesseract 的 `ImageLike` 类型只收字符串 / canvas，
 * dataURL 是它文档里支持、又不用处理 blob URL 跨 worker 作用域的那一种。
 */
export async function cropToDataUrl(
  src: string,
  rect: RectPercent,
  minWidth = 700,
): Promise<string> {
  const canvas = await cropCanvas(src, rect, { maxWidth: MAX_OUTPUT_WIDTH, minWidth })

  return canvas.toDataURL('image/png')
}

/**
 * 生成草稿用的压缩副本。
 *
 * 草稿要进 `localStorage`（通常只有 5MB），所以压到 1400px 宽、JPEG 0.72。
 * 恢复后仍然能重新裁切，只是清晰度略降 —— 比「刷新就全没了」好得多。
 */
export async function downscaleToDataUrl(
  src: string,
  maxWidth = 1400,
  quality = 0.72,
): Promise<string> {
  const image = await loadImage(src)
  const scale = Math.min(1, maxWidth / image.naturalWidth)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

  const context = canvas.getContext('2d')

  if (!context) return ''

  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  try {
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // 极端情况下（画布被污染 / 内存不足）草稿里就不带图了
    return ''
  }
}

/** dataURL → Blob。草稿恢复时用，避免把整张图塞回 canvas。 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)

  return response.blob()
}
