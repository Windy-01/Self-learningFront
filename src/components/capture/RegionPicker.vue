<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import type { Region } from './types'

/**
 * 多区域框选。
 *
 * 交互只有三条，学一次就够：
 * 1. 在空白处按住拖动 → 画一个新框（松手即生成一道题）；
 * 2. 拖动框内部 → 移动；拖八个控制点 → 缩放；
 * 3. 点框右上角 × → 删除。
 *
 * 坐标全部用**百分比**存储，所以窗口怎么缩放都不需要重新计算，
 * 也不会因为图片显示尺寸变化把框画歪。裁切时按同样的百分比回算原图坐标。
 */

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type Mode = Handle | 'move' | 'new'

const props = defineProps<{
  src: string
  alt?: string
}>()

const regions = defineModel<Region[]>('regions', { required: true })

/** 当前选中的框；父页面用它跟右侧卡片联动 */
const activeId = defineModel<string | null>('active', { default: null })

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

/** 小于这个尺寸（CSS 像素）的框视为误触，直接丢弃。 */
const MIN_PX = 24

const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const wrap = ref<HTMLElement | null>(null)
/** 正在拉的新框，还没落到 `regions` 里 */
const draft = ref<Region | null>(null)

interface DragState {
  mode: Mode
  /** `new` 时为空串 */
  id: string
  startX: number
  startY: number
  base: Region
  rect: DOMRect
  minW: number
  minH: number
}

/** 拖拽状态不需要响应式，放普通变量里，避免每次移动都触发渲染 */
let drag: DragState | null = null
let rafId = 0
let pendingPoint: { x: number; y: number } | null = null
let seq = 0

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function local(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
  }
}

function stageRect(): DOMRect | null {
  return wrap.value?.getBoundingClientRect() ?? null
}

function beginNew(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const rect = stageRect()

  if (!rect) return

  event.preventDefault()

  const point = local(event.clientX, event.clientY, rect)

  drag = {
    mode: 'new',
    id: '',
    startX: point.x,
    startY: point.y,
    base: { id: '', x: point.x, y: point.y, w: 0, h: 0 },
    rect,
    minW: (MIN_PX / rect.width) * 100,
    minH: (MIN_PX / rect.height) * 100,
  }

  draft.value = { ...drag.base }
  activeId.value = null
  wrap.value?.setPointerCapture(event.pointerId)
}

function beginDrag(mode: Mode, region: Region, event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const rect = stageRect()

  if (!rect) return

  event.preventDefault()
  event.stopPropagation()

  const point = local(event.clientX, event.clientY, rect)

  drag = {
    mode,
    id: region.id,
    startX: point.x,
    startY: point.y,
    base: { ...region },
    rect,
    minW: (MIN_PX / rect.width) * 100,
    minH: (MIN_PX / rect.height) * 100,
  }

  activeId.value = region.id
  wrap.value?.setPointerCapture(event.pointerId)
}

function applyPoint(clientX: number, clientY: number): void {
  const state = drag

  if (!state) return

  const point = local(clientX, clientY, state.rect)

  if (state.mode === 'new') {
    draft.value = {
      id: '',
      x: Math.min(state.startX, point.x),
      y: Math.min(state.startY, point.y),
      w: Math.abs(point.x - state.startX),
      h: Math.abs(point.y - state.startY),
    }

    return
  }

  const region = regions.value.find((item) => item.id === state.id)

  if (!region) return

  const dx = point.x - state.startX
  const dy = point.y - state.startY

  if (state.mode === 'move') {
    region.x = clamp(state.base.x + dx, 0, 100 - state.base.w)
    region.y = clamp(state.base.y + dy, 0, 100 - state.base.h)

    return
  }

  let left = state.base.x
  let top = state.base.y
  let right = state.base.x + state.base.w
  let bottom = state.base.y + state.base.h

  if (state.mode.includes('w')) left = clamp(state.base.x + dx, 0, right - state.minW)
  if (state.mode.includes('e')) right = clamp(right + dx, left + state.minW, 100)
  if (state.mode.includes('n')) top = clamp(state.base.y + dy, 0, bottom - state.minH)
  if (state.mode.includes('s')) bottom = clamp(bottom + dy, top + state.minH, 100)

  region.x = left
  region.y = top
  region.w = right - left
  region.h = bottom - top
}

/** 指针事件可能比屏幕刷新更快，按帧合并，拖起来才跟手 */
function onPointerMove(event: PointerEvent): void {
  if (!drag) return

  pendingPoint = { x: event.clientX, y: event.clientY }

  if (rafId) return

  rafId = requestAnimationFrame(() => {
    rafId = 0

    const point = pendingPoint

    pendingPoint = null

    if (point) applyPoint(point.x, point.y)
  })
}

function flushPoint(): void {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }

  const point = pendingPoint

  pendingPoint = null

  if (point) applyPoint(point.x, point.y)
}

function onPointerUp(event: PointerEvent): void {
  const state = drag

  if (!state) return

  flushPoint()
  drag = null

  if (state.mode === 'new') {
    const box = draft.value

    draft.value = null

    if (box && box.w >= state.minW && box.h >= state.minH) {
      seq += 1

      const id = `r${seq}-${Date.now().toString(36)}`

      regions.value = [...regions.value, { ...box, id }]
      activeId.value = id
      emit('select', id)
    }
  }

  try {
    wrap.value?.releasePointerCapture(event.pointerId)
  } catch {
    /* 指针可能已释放，忽略 */
  }
}

function remove(id: string): void {
  regions.value = regions.value.filter((item) => item.id !== id)

  if (activeId.value === id) activeId.value = null
}

function boxStyle(region: Region): Record<string, string> {
  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.w}%`,
    height: `${region.h}%`,
  }
}

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  drag = null
})
</script>

<template>
  <div
    ref="wrap"
    class="stage"
    @pointerdown="beginNew"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img class="stage__img" :src="props.src" :alt="props.alt ?? '试卷图片'" draggable="false" />

    <div
      v-for="(region, index) in regions"
      :key="region.id"
      class="box"
      :class="{ 'is-active': activeId === region.id }"
      :style="boxStyle(region)"
      @pointerdown="beginDrag('move', region, $event)"
    >
      <span class="box__no">{{ index + 1 }}</span>

      <button
        class="box__del"
        type="button"
        aria-label="删除这个框"
        @pointerdown.stop
        @click.stop="remove(region.id)"
      >
        <AppIcon name="close" :size="11" :stroke-width="2.6" />
      </button>

      <span
        v-for="handle in handles"
        :key="handle"
        class="box__handle"
        :class="`box__handle--${handle}`"
        @pointerdown="beginDrag(handle, region, $event)"
      />
    </div>

    <div v-if="draft" class="box box--draft" :style="boxStyle(draft)" />
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.stage__img {
  display: block;
  max-width: 100%;
  max-height: 68vh;
  border-radius: var(--radius-sm);
  /* 独立合成层：拖框时不用重绘大图 */
  transform: translateZ(0);
  -webkit-user-drag: none;
}

/* 框在图片上，所以配色不跟主题走：白边 + 黑外描边，任何底色上都看得清 */
.box {
  position: absolute;
  border: 1.5px solid #ffffff;
  border-radius: 2px;
  background: var(--accent-soft);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
  cursor: move;
  touch-action: none;
}

.box.is-active {
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55),
    0 0 0 3px rgba(255, 255, 255, 0.35);
}

.box--draft {
  border-style: dashed;
  background: transparent;
  pointer-events: none;
}

.box__no {
  position: absolute;
  top: -9px;
  left: -9px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  color: #0a0a0a;
  background: #ffffff;
}

.box__del {
  position: absolute;
  top: -9px;
  right: -9px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  color: #0a0a0a;
  background: #ffffff;
}

.box__del:hover {
  background: #e5e5e5;
}

.box__handle {
  position: absolute;
  width: 9px;
  height: 9px;
  border: 1px solid rgba(0, 0, 0, 0.55);
  border-radius: 1px;
  background: #ffffff;
  opacity: 0;
  transition: opacity var(--duration) var(--ease);
}

.box.is-active .box__handle {
  opacity: 1;
}

.box__handle--nw {
  top: -5px;
  left: -5px;
  cursor: nwse-resize;
}

.box__handle--n {
  top: -5px;
  left: 50%;
  margin-left: -4.5px;
  cursor: ns-resize;
}

.box__handle--ne {
  top: -5px;
  right: -5px;
  cursor: nesw-resize;
}

.box__handle--e {
  top: 50%;
  right: -5px;
  margin-top: -4.5px;
  cursor: ew-resize;
}

.box__handle--se {
  right: -5px;
  bottom: -5px;
  cursor: nwse-resize;
}

.box__handle--s {
  bottom: -5px;
  left: 50%;
  margin-left: -4.5px;
  cursor: ns-resize;
}

.box__handle--sw {
  bottom: -5px;
  left: -5px;
  cursor: nesw-resize;
}

.box__handle--w {
  top: 50%;
  left: -5px;
  margin-top: -4.5px;
  cursor: ew-resize;
}
</style>
