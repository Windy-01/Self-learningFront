<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 手动裁剪弹窗。
 * 只负责「在图片上框选区域并输出裁剪结果」，不处理上传与存储。
 * 坐标统一用「显示尺寸」记录，确认时再按 naturalWidth / 显示宽度换算回原图。
 */
const props = defineProps<{
  open: boolean
  src: string
  fileName?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', payload: { blob: Blob; width: number; height: number }): void
}>()

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type DragMode = Handle | 'move' | 'new'

interface StageRect {
  left: number
  top: number
  width: number
  height: number
}

interface DragState {
  mode: DragMode
  startX: number
  startY: number
  crop: CropRect
  /** 拖动开始时缓存画布位置，避免每帧 getBoundingClientRect 触发布局 */
  rect: StageRect
  pointerId: number
}

const MIN_SIZE = 32
const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const imgRef = ref<HTMLImageElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)

const crop = ref<CropRect>({ x: 0, y: 0, w: 0, h: 0 })
const size = ref({ width: 0, height: 0 })
const ready = ref(false)
const loadError = ref('')
const natural = ref({ width: 0, height: 0 })
const drag = ref<DragState | null>(null)

let observer: ResizeObserver | null = null
let previousOverflow = ''
let rafId = 0
let pendingPoint: { x: number; y: number } | null = null

const boxStyle = computed(() => ({
  // 用 transform 移动，避免拖拽时反复触发布局
  transform: `translate3d(${crop.value.x}px, ${crop.value.y}px, 0)`,
  width: `${crop.value.w}px`,
  height: `${crop.value.h}px`,
}))

/** 四块遮罩拼出「挖空选框」的效果，比每帧重绘超大 box-shadow 便宜得多 */
const shadeStyles = computed(() => {
  const { x, y, w, h } = crop.value
  const { width, height } = size.value

  return {
    top: {
      left: '0px',
      top: '0px',
      width: `${width}px`,
      height: `${Math.max(0, y)}px`,
    },
    left: {
      left: '0px',
      top: `${y}px`,
      width: `${Math.max(0, x)}px`,
      height: `${Math.max(0, h)}px`,
    },
    right: {
      left: `${x + w}px`,
      top: `${y}px`,
      width: `${Math.max(0, width - x - w)}px`,
      height: `${Math.max(0, h)}px`,
    },
    bottom: {
      left: '0px',
      top: `${y + h}px`,
      width: `${width}px`,
      height: `${Math.max(0, height - y - h)}px`,
    },
  }
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function measure(): StageRect {
  const rect = wrapRef.value?.getBoundingClientRect()
  if (!rect) return { left: 0, top: 0, width: 0, height: 0 }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function localPoint(clientX: number, clientY: number, rect: StageRect): { x: number; y: number } {
  return {
    x: clamp(clientX - rect.left, 0, rect.width),
    y: clamp(clientY - rect.top, 0, rect.height),
  }
}

function capture(event: PointerEvent): void {
  stageRef.value?.setPointerCapture(event.pointerId)
}

function resetCrop(): void {
  const { width, height } = size.value
  if (!width || !height) return
  crop.value = {
    x: width * 0.08,
    y: height * 0.08,
    w: width * 0.84,
    h: height * 0.84,
  }
}

/* ---------- 拖动 / 缩放 ---------- */

function begin(mode: DragMode, event: PointerEvent): void {
  if (!ready.value) return
  event.preventDefault()

  const rect = measure()
  const point = localPoint(event.clientX, event.clientY, rect)
  drag.value = {
    mode,
    startX: point.x,
    startY: point.y,
    crop: { ...crop.value },
    rect,
    pointerId: event.pointerId,
  }
  capture(event)
}

/** 在空白处按下：从当前位置重新拉一个选框 */
function startSelection(event: PointerEvent): void {
  if (!ready.value) return
  event.preventDefault()

  const rect = measure()
  const point = localPoint(event.clientX, event.clientY, rect)
  const previous = { ...crop.value }
  crop.value = { x: point.x, y: point.y, w: 0, h: 0 }
  drag.value = {
    mode: 'new',
    startX: point.x,
    startY: point.y,
    crop: previous,
    rect,
    pointerId: event.pointerId,
  }
  capture(event)
}

/**
 * 指针事件可能高于屏幕刷新率，这里按帧合并：
 * 每帧只算一次、只渲染一次，拖拽跟手且不会堆积。
 */
function onPointerMove(event: PointerEvent): void {
  if (!drag.value) return

  pendingPoint = { x: event.clientX, y: event.clientY }
  if (rafId) return

  rafId = requestAnimationFrame(() => {
    rafId = 0
    const point = pendingPoint
    pendingPoint = null
    if (point) applyPointer(point.x, point.y)
  })
}

function applyPointer(clientX: number, clientY: number): void {
  const state = drag.value
  if (!state) return

  const width = state.rect.width
  const height = state.rect.height
  const point = localPoint(clientX, clientY, state.rect)
  const dx = point.x - state.startX
  const dy = point.y - state.startY
  const start = state.crop

  if (state.mode === 'new') {
    const left = clamp(Math.min(state.startX, point.x), 0, width)
    const top = clamp(Math.min(state.startY, point.y), 0, height)
    const right = clamp(Math.max(state.startX, point.x), 0, width)
    const bottom = clamp(Math.max(state.startY, point.y), 0, height)
    crop.value = { x: left, y: top, w: right - left, h: bottom - top }
    return
  }

  if (state.mode === 'move') {
    crop.value = {
      x: clamp(start.x + dx, 0, Math.max(0, width - start.w)),
      y: clamp(start.y + dy, 0, Math.max(0, height - start.h)),
      w: start.w,
      h: start.h,
    }
    return
  }

  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h

  if (state.mode.includes('w')) left = clamp(start.x + dx, 0, right - MIN_SIZE)
  if (state.mode.includes('e')) right = clamp(start.x + start.w + dx, left + MIN_SIZE, width)
  if (state.mode.includes('n')) top = clamp(start.y + dy, 0, bottom - MIN_SIZE)
  if (state.mode.includes('s')) bottom = clamp(start.y + start.h + dy, top + MIN_SIZE, height)

  crop.value = { x: left, y: top, w: right - left, h: bottom - top }
}

/** 抬起前把最后一帧补上，避免松手位置和选框差一截 */
function flushPointer(): void {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  if (!pendingPoint) return

  const point = pendingPoint
  pendingPoint = null
  applyPointer(point.x, point.y)
}

function onPointerUp(event: PointerEvent): void {
  const state = drag.value
  if (!state) return

  flushPointer()

  // 只是点了一下空白处：恢复原来的选框，避免出现 0 尺寸
  if (state.mode === 'new' && (crop.value.w < MIN_SIZE || crop.value.h < MIN_SIZE)) {
    crop.value = state.crop
  }

  drag.value = null
  try {
    stageRef.value?.releasePointerCapture(event.pointerId)
  } catch {
    /* 指针可能已释放，忽略 */
  }
}

/* ---------- 图片加载与尺寸变化 ---------- */

function observeResize(): void {
  observer?.disconnect()
  const wrap = wrapRef.value
  if (!wrap) return

  let prevWidth = wrap.clientWidth
  let prevHeight = wrap.clientHeight

  observer = new ResizeObserver(() => {
    const node = wrapRef.value
    if (!node) return

    const width = node.clientWidth
    const height = node.clientHeight
    if (!prevWidth || !prevHeight || !width || !height) {
      prevWidth = width
      prevHeight = height
      size.value = { width, height }
      return
    }
    if (width === prevWidth && height === prevHeight) return

    // 窗口缩放后按比例迁移选框，保持相对位置
    const scaleX = width / prevWidth
    const scaleY = height / prevHeight
    crop.value = {
      x: crop.value.x * scaleX,
      y: crop.value.y * scaleY,
      w: crop.value.w * scaleX,
      h: crop.value.h * scaleY,
    }
    size.value = { width, height }
    prevWidth = width
    prevHeight = height
  })

  observer.observe(wrap)
}

function onImageLoad(): void {
  const img = imgRef.value
  const wrap = wrapRef.value
  if (!img || !wrap) return

  loadError.value = ''
  natural.value = { width: img.naturalWidth, height: img.naturalHeight }
  size.value = { width: wrap.clientWidth, height: wrap.clientHeight }
  resetCrop()
  ready.value = true
  observeResize()
}

function onImageError(): void {
  ready.value = false
  loadError.value = '图片无法解析，请换一张 JPG / PNG 图片。'
}

/** 图片命中缓存时 load 可能早于监听，挂载后补一次初始化 */
function syncImageIfReady(): void {
  const img = imgRef.value
  if (img?.complete && img.naturalWidth > 0) onImageLoad()
}

/* ---------- 输出 ---------- */

function confirm(): void {
  const img = imgRef.value
  const { width, height } = size.value
  if (!img || !ready.value || !width || !height || crop.value.w < 1 || crop.value.h < 1) return

  const scaleX = img.naturalWidth / width
  const scaleY = img.naturalHeight / height
  const sourceX = crop.value.x * scaleX
  const sourceY = crop.value.y * scaleY
  const sourceW = crop.value.w * scaleX
  const sourceH = crop.value.h * scaleY

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceW))
  canvas.height = Math.max(1, Math.round(sourceH))

  const context = canvas.getContext('2d')
  if (!context) return

  context.imageSmoothingQuality = 'high'
  context.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height)

  canvas.toBlob(
    (blob) => {
      if (!blob) return
      emit('confirm', { blob, width: canvas.width, height: canvas.height })
    },
    'image/jpeg',
    0.92,
  )
}

function close(): void {
  emit('close')
}

/* ---------- 弹窗生命周期 ---------- */

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      ready.value = false
      loadError.value = ''
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      void nextTick().then(syncImageIfReady)
      return
    }

    ready.value = false
    drag.value = null
    pendingPoint = null
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    observer?.disconnect()
    observer = null
    document.body.style.overflow = previousOverflow
  },
)

watch(
  () => props.src,
  () => {
    if (!props.open) return
    ready.value = false
    loadError.value = ''
    void nextTick().then(syncImageIfReady)
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  observer?.disconnect()
  if (rafId) cancelAnimationFrame(rafId)
  if (props.open) document.body.style.overflow = previousOverflow
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cropper">
      <div v-if="open" class="cropper" role="dialog" aria-modal="true" aria-label="手动裁剪">
        <div class="cropper__backdrop" @click="close" />

        <div class="cropper__panel">
          <header class="cropper__head">
            <div class="cropper__titles">
              <h2 class="cropper__title">手动裁剪</h2>
              <p class="cropper__meta">
                <span v-if="fileName">{{ fileName }}</span>
                <span v-if="ready">{{ natural.width }} × {{ natural.height }}</span>
                <span v-else-if="loadError">无法载入</span>
                <span v-else>载入中…</span>
              </p>
            </div>

            <button class="cropper__close" type="button" title="关闭" @click="close">
              <AppIcon name="close" :size="18" />
            </button>
          </header>

          <div
            ref="stageRef"
            class="cropper__stage"
            @pointerdown="startSelection"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <div ref="wrapRef" class="cropper__canvas">
              <img
                v-show="!loadError"
                ref="imgRef"
                :src="src"
                alt="待裁剪的试卷照片"
                draggable="false"
                @load="onImageLoad"
                @error="onImageError"
              />

              <div v-if="ready" class="cropper__shades" aria-hidden="true">
                <span class="cropper__shade" :style="shadeStyles.top" />
                <span class="cropper__shade" :style="shadeStyles.left" />
                <span class="cropper__shade" :style="shadeStyles.right" />
                <span class="cropper__shade" :style="shadeStyles.bottom" />
              </div>

              <div
                v-if="ready"
                class="cropper__box"
                :style="boxStyle"
                @pointerdown.stop="begin('move', $event)"
              >
                <span
                  v-for="handle in handles"
                  :key="handle"
                  class="cropper__handle"
                  :class="`cropper__handle--${handle}`"
                  @pointerdown.stop="begin(handle, $event)"
                />
              </div>
            </div>

            <p v-if="loadError" class="cropper__error">{{ loadError }}</p>
          </div>

          <footer class="cropper__foot">
            <p class="cropper__tip">拖动空白处重新框选，拖拽边框或角点调整大小。</p>

            <div class="cropper__actions">
              <button class="btn btn--sm btn--ghost" type="button" :disabled="!ready" @click="resetCrop">
                重置
              </button>
              <button class="btn btn--sm" type="button" @click="close">取消</button>
              <button class="btn btn--sm btn--primary" type="button" :disabled="!ready" @click="confirm">
                完成裁剪
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cropper {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
}

.cropper__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.66);
}

.cropper__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  height: min(90dvh, 900px);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.cropper__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.cropper__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.cropper__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.cropper__close {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  transition:
    background var(--duration) var(--ease),
    color var(--duration) var(--ease);
}

.cropper__close:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.cropper__stage {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
  background: var(--bg-app);
  touch-action: none;
  user-select: none;
  contain: layout paint;
}

.cropper__canvas {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
}

.cropper__canvas img {
  display: block;
  max-width: 100%;
  max-height: calc(90dvh - 210px);
  /* 独立合成层：拖遮罩时不用重绘大图 */
  transform: translateZ(0);
  user-select: none;
  -webkit-user-drag: none;
}

.cropper__error {
  padding: 24px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
  text-align: center;
}

/* 四块遮罩拼成挖空效果，拖拽时只重绘这几块小矩形 */
.cropper__shades {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cropper__shade {
  position: absolute;
  background: rgba(0, 0, 0, 0.55);
}

.cropper__box {
  position: absolute;
  top: 0;
  left: 0;
  border: 1px solid rgba(255, 255, 255, 0.95);
  cursor: move;
  touch-action: none;
  will-change: transform;
}

.cropper__handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 1px solid rgba(0, 0, 0, 0.55);
  border-radius: 2px;
  background: #ffffff;
}

.cropper__handle--nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}

.cropper__handle--n {
  top: -6px;
  left: 50%;
  margin-left: -6px;
  cursor: ns-resize;
}

.cropper__handle--ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}

.cropper__handle--e {
  top: 50%;
  right: -6px;
  margin-top: -6px;
  cursor: ew-resize;
}

.cropper__handle--se {
  right: -6px;
  bottom: -6px;
  cursor: nwse-resize;
}

.cropper__handle--s {
  bottom: -6px;
  left: 50%;
  margin-left: -6px;
  cursor: ns-resize;
}

.cropper__handle--sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}

.cropper__handle--w {
  top: 50%;
  left: -6px;
  margin-top: -6px;
  cursor: ew-resize;
}

.cropper__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.cropper__tip {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.cropper__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.cropper-enter-active,
.cropper-leave-active {
  transition: opacity 0.16s var(--ease);
}

.cropper-enter-from,
.cropper-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .cropper {
    padding: 0;
  }

  .cropper__panel {
    width: 100%;
    height: 100dvh;
    border: none;
    border-radius: 0;
  }

  .cropper__foot {
    flex-direction: column;
    align-items: stretch;
  }

  .cropper__actions {
    justify-content: flex-end;
  }

  .cropper__tip {
    order: 2;
  }
}
</style>
