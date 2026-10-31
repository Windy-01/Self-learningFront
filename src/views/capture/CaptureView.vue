<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { submitRecognize } from '@/api/recognize'

/**
 * 拍照上传（多图）。
 *
 * 接收一批图片 → 逐张裁剪 → 一次性提交识别。
 * 提交走 `api/recognize.ts`，当前是前端 mock，不请求后端；
 * 成功后带着 taskId 跳到「题目编辑」页。
 */
const MAX_SIZE = 10 * 1024 * 1024

interface DraftShot {
  id: string
  file: File
  name: string
  /** 原图 object URL，裁剪弹窗始终用它。 */
  originalUrl: string
  originalSize: { width: number; height: number } | null
  /** 裁剪结果；未裁剪时为 `null`，提交时退回原图。 */
  croppedBlob: Blob | null
  croppedUrl: string
  croppedSize: { width: number; height: number } | null
}

const router = useRouter()

const fileInput = ref<HTMLInputElement | null>(null)
const shots = ref<DraftShot[]>([])
const cropperIndex = ref(-1)
const isCropperOpen = ref(false)
const isDragging = ref(false)
const isSubmitting = ref(false)
const error = ref('')
const submitError = ref('')

const total = computed(() => shots.value.length)
const croppedCount = computed(() => shots.value.filter((shot) => shot.croppedBlob !== null).length)

const cropperSrc = computed(() => shots.value[cropperIndex.value]?.originalUrl ?? '')
const cropperName = computed(() => shots.value[cropperIndex.value]?.name ?? '')

let shotSeed = 0

function openFileDialog(): void {
  fileInput.value?.click()
}

function revoke(url: string): void {
  if (url) URL.revokeObjectURL(url)
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      reject(new Error('图片尺寸读取失败，请重新上传。'))
    }
    image.src = url
  })
}

function addShot(file: File): DraftShot {
  shotSeed += 1

  const url = URL.createObjectURL(file)

  shots.value.push({
    id: `shot-${Date.now().toString(36)}-${shotSeed}`,
    file,
    name: file.name,
    originalUrl: url,
    originalSize: null,
    croppedBlob: null,
    croppedUrl: '',
    croppedSize: null,
  })

  // 取回数组里的响应式代理：直接改上面那个字面量对象不会触发更新。
  const shot = shots.value[shots.value.length - 1]

  // 尺寸异步读，不阻塞列表渲染；读失败也不影响提交（提交时会重试）。
  void readImageSize(url)
    .then((size) => {
      shot.originalSize = size
    })
    .catch(() => {
      shot.originalSize = null
    })

  return shot
}

function acceptFiles(list: FileList | null | undefined): void {
  error.value = ''
  submitError.value = ''

  const files = Array.from(list ?? [])

  if (files.length === 0) return

  const rejected: string[] = []

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      rejected.push(`${file.name}（非图片）`)
      continue
    }
    if (file.size > MAX_SIZE) {
      rejected.push(`${file.name}（超过 10 MB）`)
      continue
    }

    addShot(file)
  }

  if (rejected.length > 0) {
    const preview = rejected.slice(0, 3).join('、')
    error.value = `已跳过 ${rejected.length} 个文件：${preview}${rejected.length > 3 ? ' 等' : ''}`
  }

  // 只选了一张且没有跳过项时，直接打开裁剪，保持单图的顺手体验。
  if (files.length === 1 && rejected.length === 0) {
    openCropper(shots.value.length - 1)
  }
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  acceptFiles(input.files)
  // 清空 value，保证再次选择同一批图也能触发 change
  input.value = ''
}

function onDrop(event: DragEvent): void {
  isDragging.value = false
  acceptFiles(event.dataTransfer?.files)
}

function openCropper(index: number): void {
  if (!shots.value[index]) return

  cropperIndex.value = index
  isCropperOpen.value = true
}

function closeCropper(): void {
  isCropperOpen.value = false
  cropperIndex.value = -1
}

function confirmCrop(payload: { blob: Blob; width: number; height: number }): void {
  const shot = shots.value[cropperIndex.value]

  if (!shot) return

  revoke(shot.croppedUrl)
  shot.croppedBlob = payload.blob
  shot.croppedUrl = URL.createObjectURL(payload.blob)
  shot.croppedSize = { width: payload.width, height: payload.height }

  closeCropper()
}

function removeShot(index: number): void {
  const shot = shots.value[index]

  if (!shot) return

  revoke(shot.originalUrl)
  revoke(shot.croppedUrl)
  shots.value.splice(index, 1)

  if (cropperIndex.value === index) {
    closeCropper()
  } else if (cropperIndex.value > index) {
    cropperIndex.value -= 1
  }
}

function clearAll(): void {
  for (const shot of shots.value) {
    revoke(shot.originalUrl)
    revoke(shot.croppedUrl)
  }

  shots.value = []
  closeCropper()
  error.value = ''
  submitError.value = ''
}

async function submitForRecognize(): Promise<void> {
  if (isSubmitting.value || shots.value.length === 0) return

  submitError.value = ''
  isSubmitting.value = true

  try {
    const inputs = await Promise.all(
      shots.value.map(async (shot) => {
        const size =
          shot.croppedSize ?? shot.originalSize ?? (await readImageSize(shot.originalUrl))

        return {
          image: shot.croppedBlob ?? shot.file,
          fileName: shot.name,
          width: size.width,
          height: size.height,
        }
      }),
    )

    const task = await submitRecognize(inputs)

    await router.push({ name: 'question-edit', query: { task: task.taskId } })
  } catch (cause) {
    submitError.value = cause instanceof Error ? cause.message : '提交失败，请稍后重试。'
  } finally {
    isSubmitting.value = false
  }
}

onBeforeUnmount(() => {
  for (const shot of shots.value) {
    revoke(shot.originalUrl)
    revoke(shot.croppedUrl)
  }
})
</script>

<template>
  <div class="page capture-page">
    <PageHeader
      title="拍照上传"
      description="可一次上传多张试卷照片，逐张框选需要保留的区域，再一起提交识别。"
    />

    <section class="panel">
      <div class="panel__head">
        <h2 class="panel__title">试卷照片</h2>
        <span class="panel__hint">支持多选，JPG / PNG，单张不超过 10 MB</span>
      </div>

      <div
        class="panel__body"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept="image/*"
          multiple
          @change="onPick"
        />

        <button
          v-if="shots.length === 0"
          class="dropzone"
          :class="{ 'dropzone--active': isDragging }"
          type="button"
          @click="openFileDialog"
        >
          <span class="dropzone__icon">
            <AppIcon name="camera" :size="26" :stroke-width="1.6" />
          </span>
          <span class="dropzone__title">点击选择或拖拽试卷照片</span>
          <span class="dropzone__desc">支持一次选择多张，上传后逐张裁剪</span>
        </button>

        <div v-else class="shots">
          <article v-for="(shot, index) in shots" :key="shot.id" class="shot">
            <button class="shot__frame" type="button" title="点击裁剪" @click="openCropper(index)">
              <img :src="shot.croppedUrl || shot.originalUrl" :alt="shot.name" />
              <span class="shot__index">{{ index + 1 }}</span>
              <span v-if="shot.croppedBlob === null" class="shot__badge">未裁剪</span>
            </button>

            <div class="shot__bar">
              <span class="shot__name" :title="shot.name">{{ shot.name }}</span>
              <div class="shot__actions">
                <button class="btn btn--sm btn--ghost" type="button" @click="openCropper(index)">
                  裁剪
                </button>
                <button class="btn btn--sm btn--ghost" type="button" @click="removeShot(index)">
                  移除
                </button>
              </div>
            </div>
          </article>

          <button class="shot-add" type="button" @click="openFileDialog">
            <AppIcon name="plus" :size="20" />
            <span>添加图片</span>
          </button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <div v-if="shots.length > 0" class="panel__foot">
        <span class="panel__hint">共 {{ total }} 张 · 已裁剪 {{ croppedCount }} 张</span>

        <div class="foot-actions">
          <button
            class="btn btn--sm btn--ghost"
            type="button"
            :disabled="isSubmitting"
            @click="clearAll"
          >
            清空
          </button>
          <button
            class="btn btn--sm btn--primary"
            type="button"
            :disabled="isSubmitting"
            @click="submitForRecognize"
          >
            <AppIcon name="scan" :size="14" />
            {{ isSubmitting ? '提交中…' : `提交识别（${total}）` }}
          </button>
        </div>
      </div>

      <p v-if="submitError" class="error error--foot">{{ submitError }}</p>
    </section>

    <ImageCropper
      :open="isCropperOpen"
      :src="cropperSrc"
      :file-name="cropperName"
      @close="closeCropper"
      @confirm="confirmCrop"
    />
  </div>
</template>

<style scoped>
.capture-page {
  max-width: 1080px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ---------- 上传区 ---------- */
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 340px;
  padding: 32px 24px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
  background: var(--bg-app);
  transition:
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.dropzone:hover,
.dropzone--active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dropzone__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  background: var(--bg-surface);
}

.dropzone__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.dropzone__desc {
  font-size: 12px;
  color: var(--text-muted);
}

/* ---------- 图片网格 ---------- */
.shots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.shot {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.shot__frame {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 3 / 4;
  padding: 6px;
  overflow: hidden;
  background: var(--bg-app);
  cursor: zoom-in;
}

.shot__frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.shot__index {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-inverse);
  background: var(--accent);
}

.shot__badge {
  position: absolute;
  top: 8px;
  right: 8px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  font-size: 10.5px;
  line-height: 18px;
  color: var(--text-muted);
  background: var(--bg-surface);
}

.shot__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px 6px 10px;
  border-top: 1px solid var(--border-color);
}

.shot__name {
  min-width: 0;
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot__actions {
  display: flex;
  flex: none;
  gap: 2px;
}

.shot-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 200px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-app);
  transition:
    color var(--duration) var(--ease),
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.shot-add:hover {
  border-color: var(--accent);
  color: var(--text-primary);
  background: var(--accent-soft);
}

/* ---------- 底部操作条 ---------- */
.panel__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface-hover);
}

.foot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.error {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-primary);
}

.error--foot {
  margin: 0;
  padding: 0 16px 12px;
}

@media (max-width: 640px) {
  .dropzone {
    min-height: 260px;
  }

  .shots {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
</style>
