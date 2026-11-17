<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import RegionPicker from '@/components/capture/RegionPicker.vue'
import CaptureCard from '@/components/capture/CaptureCard.vue'
import type { CaptureCardModel, Paper, Region } from '@/components/capture/types'
import { askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/api/http'
import { defaultOptions, stringifyContent } from '@/api/content'
import {
  addQuestionKnowledge,
  addQuestionTag,
  updateQuestion,
  uploadQuestion,
} from '@/api/question'
import { createLabel, listLabels } from '@/api/label'
import { createKnowledgePoint, listKnowledgePoints } from '@/api/knowledge'
import { cropToBlob, cropToDataUrl, dataUrlToBlob, downscaleToDataUrl, loadImage } from '@/utils/crop'
import { disposeOcr, recognizeImage, type OcrProgressInfo } from '@/utils/ocr'
import { parseOcrText } from '@/utils/ocrText'
import {
  clearCaptureDraft,
  readCaptureDraft,
  writeCaptureDraft,
  type CaptureDraft,
} from '@/utils/captureDraft'
import type { QuestionPatch } from '@/api/types'

/**
 * 录入题目：一张卷子 → N 道题。
 *
 * 为什么是三步而不是一页堆满：`Q3` 只支持「一图一题」，所以必须先在本机把整页切成 N 块，
 * 再逐块建题。流程拆成「选图 → 框选 → 填写」，每一步只做一件事，
 * 出错时也能退回到具体那一步，而不是从头再来。
 *
 * 提交编排（串行，单题失败不影响其它题）：
 * `Q3` 建题（带裁切图）→ 有答案/来源则 `Q6` → 逐条 `Q9` / `Q12`。
 * 建题成功即记下 `questionId`，重试时跳过 `Q3`，避免同一道题被传两遍。
 */

interface OptionItem {
  id: number
  name: string
  system: boolean
}

interface CardView {
  card: CaptureCardModel
  /** 在 `cards` 里的下标，供 v-model 用 */
  at: number
  /** 展示用题号，从 1 开始 */
  label: number
  region: Region
}

const router = useRouter()
const { push } = useToast()

const papers = ref<Paper[]>([])
const cards = ref<CaptureCardModel[]>([])
const activePaperId = ref('')
/** 当前选中的框：图上高亮它，右侧滚到对应卡片 */
const activeRegionId = ref<string | null>(null)

const allTags = ref<OptionItem[]>([])
const allKnowledge = ref<OptionItem[]>([])

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const reading = ref(false)
const submitting = ref(false)
const restoring = ref(false)
const draftNotice = ref('')

/**
 * 识别引擎的全局进度。
 *
 * 首次识别要下载模型，几秒钟里页面必须说清楚在干什么，
 * 否则用户会以为卡死了；`null` 表示当前没有识别任务。
 */
const ocrEngine = ref<OcrProgressInfo | null>(null)

/** 待识别的 regionId 队列。worker 一次只跑一个任务，这里排队串行。 */
const ocrQueue: string[] = []
/** 已经见过的框，用来判断「新画的框」而不是每次渲染都重新识别 */
const knownRegions = new Set<string>()
let ocrPumping = false
let ocrCancelled = false
/** 引擎起不来（多半是模型下不下来）时，不要再对每道题都重试一次下载 */
let ocrDisabled = false
let ocrDisabledReason = ''

/** 草稿里图片存不下时只提示一次，不要每次输入都弹 */
let draftWarned = false
let saveTimer = 0

const activePaper = computed<Paper | null>(
  () => papers.value.find((paper) => paper.id === activePaperId.value) ?? papers.value[0] ?? null,
)

const regionCount = computed(() =>
  papers.value.reduce((total, paper) => total + paper.regions.length, 0),
)

const doneCount = computed(() => cards.value.filter((card) => card.state === 'done').length)

const failedCount = computed(() => cards.value.filter((card) => card.state === 'failed').length)

const pendingCards = computed(() => cards.value.filter((card) => card.state !== 'done'))

const hasUnfinished = computed(() => papers.value.length > 0 && pendingCards.value.length > 0)

const progressText = computed(() => {
  const total = cards.value.length

  if (total === 0) return '还没有题目'

  const head = submitting.value ? '正在保存' : '已保存'

  return failedCount.value > 0
    ? `${head} ${doneCount.value} / ${total} · 失败 ${failedCount.value}`
    : `${head} ${doneCount.value} / ${total}`
})

const progressPercent = computed(() =>
  cards.value.length === 0 ? 0 : Math.round((doneCount.value / cards.value.length) * 100),
)

const cardViews = computed<CardView[]>(() =>
  cards.value.map((card, index) => {
    const paper = paperOf(card.regionId)
    const region = paper?.regions.find((item) => item.id === card.regionId)

    return {
      card,
      at: index,
      label: index + 1,
      region: region ?? { id: card.regionId, x: 0, y: 0, w: 100, h: 100 },
    }
  }),
)

const ocrBusyCount = computed(
  () => cards.value.filter((card) => card.ocr === 'queued' || card.ocr === 'running').length,
)

/** 只关心「有哪些框」，拖动/缩放不改变这个字符串，避免每帧都同步卡片 */
const regionIdKey = computed(() =>
  papers.value.flatMap((paper) => paper.regions.map((region) => region.id)).join('|'),
)

/* ---------------- 查找 ---------------- */

function paperOf(regionId: string): Paper | null {
  return papers.value.find((paper) => paper.regions.some((region) => region.id === regionId)) ?? null
}

/* ---------------- 选图 ---------------- */

function pickFiles(): void {
  fileInput.value?.click()
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement

  if (input.files && input.files.length > 0) {
    void addFiles(input.files)
  }

  // 清空后同一个文件还能再选一次
  input.value = ''
}

function onDrop(event: DragEvent): void {
  dragging.value = false

  const files = event.dataTransfer?.files

  if (files && files.length > 0) {
    void addFiles(files)
  }
}

/** 粘贴板里的图：录题时最常用的一条路（截图 → Ctrl+V） */
function onPaste(event: ClipboardEvent): void {
  const target = event.target

  if (
    target instanceof HTMLElement
    && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return
  }

  const items = event.clipboardData?.items

  if (!items) return

  const files: File[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]

    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()

      if (file) files.push(file)
    }
  }

  if (files.length > 0) {
    event.preventDefault()
    void addFiles(files)
  }
}

async function addFiles(files: FileList | File[]): Promise<void> {
  const images = Array.from(files).filter((file) => file.type.startsWith('image/'))

  if (images.length === 0) {
    push('只能添加图片文件（JPG / PNG）')
    return
  }

  reading.value = true

  let added = 0

  for (const file of images) {
    try {
      const url = URL.createObjectURL(file)
      const image = await loadImage(url)

      const paper: Paper = {
        id: `p${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name || '试卷图片',
        blob: file,
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
        draftUrl: '',
        regions: [],
      }

      papers.value = [...papers.value, paper]
      activePaperId.value = paper.id
      added += 1

      // 草稿副本异步生成，不挡住进入框选
      void downscaleToDataUrl(url).then((dataUrl) => {
        const target = papers.value.find((item) => item.id === paper.id)

        if (target) target.draftUrl = dataUrl
      })
    } catch (cause) {
      push(errorMessage(cause))
    }
  }

  reading.value = false

  if (added > 0) activeRegionId.value = null
}

async function removePaper(id: string): Promise<void> {
  const paper = papers.value.find((item) => item.id === id)

  if (!paper) return

  if (paper.regions.length > 0) {
    const ok = await askConfirm({
      title: '移除这张图？',
      body: `图上已经框了 ${paper.regions.length} 道题，移除后这些框和已填内容都会丢掉。`,
      confirmText: '移除',
      danger: true,
    })

    if (!ok) return
  }

  URL.revokeObjectURL(paper.url)

  const removedIds = new Set(paper.regions.map((region) => region.id))

  papers.value = papers.value.filter((item) => item.id !== id)
  cards.value = cards.value.filter((card) => !removedIds.has(card.regionId))

  if (activePaperId.value === id) activePaperId.value = papers.value[0]?.id ?? ''
}

/* ---------------- 卡片 ---------------- */

function createCard(regionId: string): CaptureCardModel {
  return {
    regionId,
    type: 'single',
    stem: '',
    options: defaultOptions(),
    answer: '',
    source: '',
    tagIds: [],
    knowledgeIds: [],
    state: 'idle',
    error: '',
    questionId: null,
    ocr: 'idle',
    ocrProgress: 0,
    ocrError: '',
    ocrRect: '',
    ocrWarnings: [],
  }
}

/** 按「图 → 框」的顺序对齐卡片：新框补卡、删掉的框去卡，已填内容保留 */
function syncCards(): void {
  const existing = new Map(cards.value.map((card) => [card.regionId, card]))
  const next: CaptureCardModel[] = []

  for (const paper of papers.value) {
    for (const region of paper.regions) {
      next.push(existing.get(region.id) ?? createCard(region.id))
    }
  }

  cards.value = next
}

/* ---------------- 识别 ---------------- */

/**
 * 框一画完就开始识别。
 *
 * 为什么不等进第三步再批量识别：用户在第二步还在看图，识别结果此时出来，
 * 他可以直接决定「这个框画歪了、重画」，而不是到第三步才发现。
 *
 * 识别只填**空着的**卡片：如果用户在识别期间已经手打了内容，绝不覆盖。
 */

function cardOf(regionId: string): CaptureCardModel | null {
  return cards.value.find((card) => card.regionId === regionId) ?? null
}

/** 框的位置快照。识别后框被拖动过，结果就跟图对不上了。 */
function rectKey(region: Region): string {
  return [region.x, region.y, region.w, region.h].map((value) => value.toFixed(1)).join('/')
}

function regionOf(regionId: string): { paper: Paper; region: Region } | null {
  const paper = paperOf(regionId)
  const region = paper?.regions.find((item) => item.id === regionId)

  return paper && region ? { paper, region } : null
}

/* ---------------- 联动 ---------------- */

/**
 * 图上新画一个框：高亮它，并把右侧对应卡片滚进视野。
 *
 * 用 `block: 'nearest'` 而不是 `start`：卡片已经在屏幕里时不动，
 * 避免每画一个框整页都跳一下。
 */
function onRegionSelect(regionId: string): void {
  activeRegionId.value = regionId

  void nextTick(() => {
    document
      .getElementById(`card-${regionId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

/** 点卡片头部：反向高亮图上的框，图被滚走了就滚回来 */
function onCardActivate(regionId: string): void {
  activeRegionId.value = regionId

  document
    .getElementById('capture-stage')
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/** 引擎初始化失败大多是因为拿不到模型，这时要把「要联网」说清楚 */
function ocrErrorMessage(cause: unknown): string {
  const text = errorMessage(cause)

  if (/fetch|network|worker|import|load|failed/i.test(text)) {
    return `识别引擎没起来（首次使用需要联网下载中文模型）。${text}`
  }

  return text
}

function enqueueOcr(regionId: string): void {
  const card = cardOf(regionId)

  if (!card || card.ocr === 'queued' || card.ocr === 'running') return

  card.ocr = 'queued'
  card.ocrProgress = 0
  card.ocrError = ''
  card.ocrWarnings = []
  ocrQueue.push(regionId)
  void pumpOcr()
}

async function pumpOcr(): Promise<void> {
  if (ocrPumping) return

  ocrPumping = true

  try {
    while (ocrQueue.length > 0 && !ocrCancelled) {
      const regionId = ocrQueue.shift()

      if (!regionId) continue

      // 引擎已经确认起不来：剩下的题直接标失败，不再逐个重试下载
      if (ocrDisabled) {
        const card = cardOf(regionId)

        if (card) {
          card.ocr = 'failed'
          card.ocrError = ocrDisabledReason
        }

        continue
      }

      await runOcr(regionId)
    }
  } finally {
    ocrPumping = false
    ocrEngine.value = null
  }
}

async function runOcr(regionId: string): Promise<void> {
  const card = cardOf(regionId)
  const target = regionOf(regionId)

  if (!card || !target) return

  const before = card.stem

  card.ocr = 'running'
  card.ocrProgress = 0
  card.ocrError = ''
  card.ocrWarnings = []

  try {
    const image = await cropToDataUrl(target.paper.url, target.region)
    const text = await recognizeImage(image, (info) => {
      ocrEngine.value = info
      card.ocrProgress = Math.round(info.progress * 100)
    })

    const parsed = parseOcrText(text)

    if (parsed.stem === '') {
      throw new Error('这一块没识别出文字，检查一下框是不是只框住了题目。')
    }

    // 识别期间用户已经手打了内容：不覆盖，只提示
    if (card.stem.trim() !== '' && card.stem !== before) {
      card.ocr = 'done'
      card.ocrRect = rectKey(target.region)
      card.ocrWarnings = ['识别完成，但你已经手动填写，没有覆盖当前内容']

      return
    }

    card.stem = parsed.stem
    card.type = parsed.type
    // 选择题才有选项；识别到的选项少于两个时保持默认的空 A–D，让用户自己填
    card.options = parsed.options.length >= 2 ? parsed.options : defaultOptions()
    card.ocr = 'done'
    card.ocrRect = rectKey(target.region)
    card.ocrWarnings = parsed.warnings
  } catch (cause) {
    const message = ocrErrorMessage(cause)

    card.ocr = 'failed'
    card.ocrError = message

    // 引擎级失败：后续题目不再逐个重试下载，用户修好网络后点「重新识别」即可
    if (message.startsWith('识别引擎没起来')) {
      ocrDisabled = true
      ocrDisabledReason = message
    }
  } finally {
    card.ocrProgress = 0
    ocrEngine.value = null
  }
}

/** 手动重识别：会覆盖已填内容，所以先问一句 */
async function rerunOcr(regionId: string): Promise<void> {
  const card = cardOf(regionId)

  if (!card || card.ocr === 'queued' || card.ocr === 'running') return

  // 手动重识别是用户明确要求的重试：解除引擎级熔断
  ocrDisabled = false

  const dirty =
    card.stem.trim() !== '' || card.options.some((option) => option.markup.trim() !== '')

  if (dirty) {
    const ok = await askConfirm({
      title: '重新识别这道题？',
      body: '识别结果会覆盖当前的题干与选项，手动改过的内容会丢失。',
      confirmText: '重新识别',
      danger: true,
    })

    if (!ok) return

    card.stem = ''
    card.options = defaultOptions()
    card.type = 'single'
  }

  enqueueOcr(regionId)
}

/* ---------------- 标签 / 知识点 ---------------- */

async function loadOptions(): Promise<void> {
  try {
    const [tags, points] = await Promise.all([listLabels(), listKnowledgePoints()])

    allTags.value = tags.map((tag) => ({
      id: tag.tag_id,
      name: tag.name,
      system: tag.userid === 0,
    }))

    allKnowledge.value = points.map((point) => ({
      id: point.knowledge_point_id,
      name: point.name,
      system: point.userid === 0,
    }))
  } catch {
    /* 不影响录题，只是暂时挂不上标签 */
  }
}

async function createTagFor(card: CaptureCardModel, name: string): Promise<void> {
  try {
    const tag = await createLabel(name)

    if (!allTags.value.some((item) => item.id === tag.tag_id)) {
      allTags.value = [
        ...allTags.value,
        { id: tag.tag_id, name: tag.name, system: tag.userid === 0 },
      ]
    }

    if (!card.tagIds.includes(tag.tag_id)) {
      card.tagIds = [...card.tagIds, tag.tag_id]
    }
  } catch (cause) {
    push(errorMessage(cause))
  }
}

async function createKnowledgeFor(card: CaptureCardModel, name: string): Promise<void> {
  try {
    const point = await createKnowledgePoint(name)

    if (!allKnowledge.value.some((item) => item.id === point.knowledge_point_id)) {
      allKnowledge.value = [
        ...allKnowledge.value,
        {
          id: point.knowledge_point_id,
          name: point.name,
          system: point.userid === 0,
        },
      ]
    }

    if (!card.knowledgeIds.includes(point.knowledge_point_id)) {
      card.knowledgeIds = [...card.knowledgeIds, point.knowledge_point_id]
    }
  } catch (cause) {
    push(errorMessage(cause))
  }
}

function applySource(source: string): void {
  let count = 0

  for (const card of cards.value) {
    if (card.state === 'done' || card.source === source) continue

    card.source = source
    count += 1
  }

  push(count > 0 ? `已把来源应用到另外 ${count} 道题` : '其它题已经是这个来源')
}

/* ---------------- 提交 ---------------- */

/**
 * 提交一道题。
 *
 * 顺序有意义：先建题拿到 ID，再补答案/来源，最后挂标签。
 * 任何一步失败都会抛出，但**已经建好的 ID 会留在卡片上**，
 * 所以点「重试」只会补没做完的那几步，不会产生重复题目。
 */
async function submitCard(card: CaptureCardModel): Promise<void> {
  const stem = card.stem.trim()

  if (stem === '') {
    throw new Error('题干为空，这道题没有提交。')
  }

  const paper = paperOf(card.regionId)
  const region = paper?.regions.find((item) => item.id === card.regionId)

  if (!paper || !region) {
    throw new Error('找不到对应的裁切区域，请返回框选重画。')
  }

  let questionId = card.questionId

  if (questionId === null) {
    const blob = await cropToBlob(paper.url, region)
    const content = stringifyContent({ type: card.type, stem, options: card.options })
    const created = await uploadQuestion(blob, content, `${card.regionId}.jpg`)

    questionId = created.questionId
    card.questionId = questionId
  }

  const patch: QuestionPatch = {}
  const answer = card.answer.trim()
  const source = card.source.trim()

  if (answer !== '') patch.answer = answer
  if (source !== '') patch.source = source

  if (Object.keys(patch).length > 0) {
    await updateQuestion(questionId, patch)
  }

  const problems: string[] = []

  for (const tagId of card.tagIds) {
    try {
      await addQuestionTag(questionId, tagId)
    } catch (cause) {
      problems.push(`标签 ${tagId}：${errorMessage(cause)}`)
    }
  }

  for (const pointId of card.knowledgeIds) {
    try {
      await addQuestionKnowledge(questionId, pointId)
    } catch (cause) {
      problems.push(`知识点 ${pointId}：${errorMessage(cause)}`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`题目已建（#${questionId}），但关联没挂完 —— ${problems[0]}，点重试只补这一步。`)
  }
}

async function submit(): Promise<void> {
  if (submitting.value) return

  const targets = cards.value.filter((card) => card.state !== 'done')

  if (targets.length === 0) return

  submitting.value = true

  let failed = 0

  for (const card of targets) {
    card.state = 'submitting'
    card.error = ''

    try {
      await submitCard(card)
      card.state = 'done'
    } catch (cause) {
      card.state = 'failed'
      card.error = errorMessage(cause)
      failed += 1
    }
  }

  submitting.value = false

  if (failed > 0) {
    push(`成功 ${targets.length - failed} 道，失败 ${failed} 道`)
    return
  }

  const total = cards.value.length

  clearCaptureDraft()
  resetState()
  push(`已存入 ${total} 道题`)
  void router.push({ name: 'questions' })
}

async function retryCard(card: CaptureCardModel): Promise<void> {
  if (submitting.value) return

  submitting.value = true
  card.state = 'submitting'
  card.error = ''

  try {
    await submitCard(card)
    card.state = 'done'
    push('这道题已保存')
  } catch (cause) {
    card.state = 'failed'
    card.error = errorMessage(cause)
  } finally {
    submitting.value = false
  }
}

function resetState(): void {
  for (const paper of papers.value) URL.revokeObjectURL(paper.url)

  ocrQueue.length = 0
  knownRegions.clear()
  ocrEngine.value = null
  ocrDisabled = false
  ocrDisabledReason = ''

  papers.value = []
  cards.value = []
  activePaperId.value = ''
  activeRegionId.value = null
  draftNotice.value = ''
  clearCaptureDraft()
}

async function resetAll(): Promise<void> {
  if (submitting.value) return

  const ok = await askConfirm({
    title: '放弃本次录入？',
    body: '已选的图片、框选和填写内容都会清空，本地草稿也会删除。已经保存的题目不受影响。',
    confirmText: '清空',
    danger: true,
  })

  if (!ok) return

  resetState()
}

/* ---------------- 草稿 ---------------- */

function saveDraft(): void {
  if (papers.value.length === 0 && cards.value.length === 0) {
    clearCaptureDraft()
    return
  }

  // 压缩副本还没生成完就先别写：写进去的是一份「有框没图」的草稿，恢复时会被整份丢掉。
  // 生成完成会改 `draftUrl`，深度监听会再排一次保存。
  if (papers.value.some((paper) => paper.draftUrl === '')) return

  const draft: CaptureDraft = {
    version: 1,
    savedAt: new Date().toISOString(),
    papers: papers.value.map((paper) => ({
      id: paper.id,
      name: paper.name,
      width: paper.width,
      height: paper.height,
      dataUrl: paper.draftUrl,
      regions: paper.regions.map((region) => ({ ...region })),
    })),
    cards: cards.value.map((card) => ({
      regionId: card.regionId,
      type: card.type,
      stem: card.stem,
      options: card.options.map((option) => ({ ...option })),
      answer: card.answer,
      source: card.source,
      tagIds: [...card.tagIds],
      knowledgeIds: [...card.knowledgeIds],
    })),
  }

  const result = writeCaptureDraft(draft)

  if (result === 'quota' && !draftWarned) {
    draftWarned = true
    draftNotice.value = '本地空间不足：草稿只保留了文字，图片没有存下来。刷新后需要重新选图。'
    push(draftNotice.value)
  }
}

function scheduleSave(): void {
  if (restoring.value) return

  // 草稿要序列化整张图的 base64，别每敲一个字就写一次
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(saveDraft, 1000)
}

/**
 * 恢复草稿。
 *
 * 图没了（配额不足 / 用户清过浏览器数据）就整份丢掉 ——
 * 只剩一堆没有图的框，比从头开始更让人困惑。
 */
async function restoreDraft(): Promise<void> {
  const draft = readCaptureDraft()

  if (!draft || draft.papers.length === 0) return

  restoring.value = true

  try {
    const restored: Paper[] = []

    for (const item of draft.papers) {
      if (!item.dataUrl) continue

      try {
        const blob = await dataUrlToBlob(item.dataUrl)
        const url = URL.createObjectURL(blob)
        const image = await loadImage(url)

        restored.push({
          id: item.id,
          name: item.name,
          blob,
          url,
          width: image.naturalWidth || item.width,
          height: image.naturalHeight || item.height,
          draftUrl: item.dataUrl,
          regions: item.regions.map((region) => ({ ...region })),
        })
      } catch {
        /* 单张图坏了就跳过，别拖垮整份草稿 */
      }
    }

    if (restored.length === 0) return

    const regionIds = new Set(restored.flatMap((paper) => paper.regions.map((region) => region.id)))

    // 恢复出来的框视为「已见过」：草稿里的文字是用户自己写的，
    // 不能因为重新进页面就被自动识别覆盖一遍。
    for (const id of regionIds) knownRegions.add(id)

    papers.value = restored
    activePaperId.value = restored[0].id
    cards.value = draft.cards
      .filter((card) => regionIds.has(card.regionId))
      .map((card) => ({
        ...card,
        // 草稿是 localStorage 里的数据，用户可能手改过，结构得兜一层
        options: Array.isArray(card.options) ? card.options : defaultOptions(),
        tagIds: Array.isArray(card.tagIds) ? card.tagIds : [],
        knowledgeIds: Array.isArray(card.knowledgeIds) ? card.knowledgeIds : [],
        state: 'idle',
        error: '',
        questionId: null,
        // 草稿里的文字是用户自己写/改过的，恢复后不重跑识别
        ocr: 'idle',
        ocrProgress: 0,
        ocrError: '',
        ocrRect: '',
        ocrWarnings: [],
      }))

    syncCards()
    push('已恢复上次未提交的草稿')
  } finally {
    restoring.value = false
  }
}

/* ---------------- 生命周期 ---------------- */

watch([papers, cards], scheduleSave, { deep: true })

/**
 * 新框 → 补卡片 → 排队识别。
 *
 * 用「框 id 拼成的字符串」当触发源：拖动和缩放只改坐标、不改 id，
 * 所以这个 watcher 不会在拖拽过程中反复触发。
 */
watch(regionIdKey, () => {
  syncCards()

  const current = new Set(papers.value.flatMap((paper) => paper.regions.map((region) => region.id)))

  for (const id of current) {
    if (knownRegions.has(id)) continue

    knownRegions.add(id)
    if (!restoring.value) enqueueOcr(id)
  }

  for (const id of [...knownRegions]) {
    if (!current.has(id)) knownRegions.delete(id)
  }
})

onBeforeRouteLeave(async () => {
  if (submitting.value) {
    return await askConfirm({
      title: '正在保存，确定离开？',
      body: '离开会中断这次提交：已保存的题目不会丢，没保存的会留在本机草稿里。',
      confirmText: '离开',
    })
  }

  if (!hasUnfinished.value) return true

  return await askConfirm({
    title: '离开录入？',
    body: `还有 ${pendingCards.value.length} 道题没提交。已填内容会留在本机草稿里，下次进来可以接着填。`,
    confirmText: '离开',
  })
})

onMounted(() => {
  void loadOptions()
  window.addEventListener('paste', onPaste)
  void restoreDraft()
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  window.clearTimeout(saveTimer)

  for (const paper of papers.value) URL.revokeObjectURL(paper.url)

  // 识别 worker 是 wasm，占几百 MB；离开页面就放掉，模型本身在浏览器缓存里
  ocrCancelled = true
  ocrQueue.length = 0
  void disposeOcr()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="录入题目"
      description="上传试卷照片，在图上框出每道题；题干就在右边改，左边随时对照原图。"
    >
      <template #actions>
        <button
          v-if="papers.length > 0"
          class="btn btn--sm btn--ghost"
          type="button"
          :disabled="submitting"
          @click="resetAll"
        >
          重新开始
        </button>
      </template>
    </PageHeader>

    <p v-if="draftNotice" class="note">{{ draftNotice }}</p>

    <!-- 还没有图片：整页只放一个拖放区 -->
    <section v-if="papers.length === 0" class="panel">
      <div class="panel__body">
        <div
          class="dropzone"
          :class="{ 'is-dragging': dragging }"
          @click="pickFiles"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <AppIcon name="upload" :size="26" />
          <span class="dropzone__title">{{ reading ? '正在读取图片…' : '拖入图片，或点击选择' }}</span>
          <span class="dropzone__desc">
            支持 JPG / PNG，可一次选多张，也可以直接 Ctrl+V 粘贴 · 图片只在本机裁切
          </span>
        </div>

        <p class="note gap-top">
          框好一道题就会在本机识别文字（浏览器内 OCR，图片不会先上传）。
          中文正文基本能认，公式、上下标、希腊字母认不出来，请对着原图核对。
        </p>
      </div>
    </section>

    <!-- 左图右题：框选、校对、保存都在这一页 -->
    <div v-else class="capture">
      <section id="capture-stage" class="panel capture__stage">
      <div class="panel__head">
        <h2 class="panel__title">框出每道题</h2>
        <span class="panel__hint">
          已框 {{ regionCount }} 道<span v-if="ocrBusyCount > 0"> · 识别中 {{ ocrBusyCount }}</span>
        </span>
      </div>

      <div class="panel__body">
        <div class="papers">
          <button
            v-for="paper in papers"
            :key="paper.id"
            class="papers__item"
            :class="{ 'is-active': paper.id === activePaperId }"
            type="button"
            :title="paper.name"
            @click="activePaperId = paper.id"
          >
            <img :src="paper.url" alt="" />
            <span class="papers__count">{{ paper.regions.length }}</span>
          </button>

          <button class="papers__add" type="button" title="添加图片" @click="pickFiles">
            <AppIcon name="plus" :size="14" />
          </button>
        </div>

        <p v-if="ocrEngine" class="ocr-banner">
          <span class="ocr-banner__dot" aria-hidden="true" />
          <span class="ocr-banner__text">{{ ocrEngine.message }}</span>
          <span class="ocr-banner__track">
            <i :style="{ width: `${Math.round(ocrEngine.progress * 100)}%` }" />
          </span>
          <span class="ocr-banner__hint">首次使用要下载模型，之后走浏览器缓存</span>
        </p>

        <div v-if="activePaper" class="stage__frame">
          <RegionPicker
            :key="activePaper.id"
            v-model:regions="activePaper.regions"
            v-model:active="activeRegionId"
            :src="activePaper.url"
            :alt="activePaper.name"
            @select="onRegionSelect"
          />
        </div>

        <div class="stage__foot">
          <p class="note stage__note">
            按住拖动框出题目，松手即识别；框太小（小于 24px）会被忽略，拖控制点可缩放，点框右上角 × 删除。
          </p>
          <button
            v-if="papers.length > 1 && activePaper"
            class="btn btn--sm btn--ghost"
            type="button"
            @click="removePaper(activePaper.id)"
          >
            移除这张
          </button>
        </div>
      </div>
      </section>

      <section class="capture__list">
        <div class="list__head">
          <h2 class="list__title">题目</h2>
          <span class="list__hint">{{ progressText }}</span>
        </div>

        <EmptyState
          v-if="cardViews.length === 0"
          icon="camera"
          title="在图上框出第一道题"
          description="按住拖动，松手就会生成一张卡片，并开始识别。"
        />

        <template v-else>
          <p class="note">
            题干与选项由浏览器内 OCR 生成，公式、上下标、括号最容易错 —— 对着左边的框核对。
            公式写成 <code>$…$</code>，下面的按钮可插常用符号，改完立刻能看到预览。
          </p>

          <div class="cards">
            <CaptureCard
              v-for="view in cardViews"
              :id="`card-${view.card.regionId}`"
              :key="view.card.regionId"
              v-model="cards[view.at]"
              :index="view.label"
              :region="view.region"
              :active="activeRegionId === view.card.regionId"
              :tag-options="allTags"
              :knowledge-options="allKnowledge"
              @activate="onCardActivate(view.card.regionId)"
              @retry="retryCard(view.card)"
              @recognize="rerunOcr(view.card.regionId)"
              @apply-source="applySource"
              @create-tag="(name) => createTagFor(view.card, name)"
              @create-knowledge="(name) => createKnowledgeFor(view.card, name)"
            />
          </div>

          <div class="submitbar">
            <div class="progress">
              <span class="progress__text">{{ progressText }}</span>
              <span class="progress__track">
                <i class="progress__bar" :style="{ width: `${progressPercent}%` }" />
              </span>
            </div>

            <button
              class="btn btn--primary"
              type="button"
              :disabled="submitting || pendingCards.length === 0"
              @click="submit"
            >
              {{ submitting ? '正在保存…' : `保存剩余 ${pendingCards.length} 道` }}
            </button>
          </div>
        </template>
      </section>
    </div>

    <input
      ref="fileInput"
      class="hidden-input"
      type="file"
      accept="image/*"
      multiple
      @change="onFileChange"
    />
  </div>
</template>

<style scoped>
.hidden-input {
  display: none;
}

.gap-top {
  margin-top: 12px;
}

/* ---------- 左图右题 ---------- */
.capture {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(380px, 1fr);
  gap: 14px;
  align-items: start;
}

/* 图跟着滚：改下面那串长卡片时，不用来回找框 */
.capture__stage {
  position: sticky;
  top: calc(var(--header-height) + 16px);
}

.stage__frame {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-app);
}

/* 单页布局里图不能太高，否则右侧卡片永远在屏幕外 */
.stage__frame :deep(.stage__img) {
  max-height: 54vh;
}

.stage__foot {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
}

.stage__note {
  flex: 1;
  min-width: 0;
}

.capture__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.list__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
}

.list__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.list__hint {
  font-size: 11.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ---------- 拖放区 ---------- */
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 260px;
  padding: 28px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  background: var(--bg-app);
  text-align: center;
  cursor: pointer;
  transition:
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.dropzone:hover,
.dropzone.is-dragging {
  border-color: var(--accent-border);
  background: var(--bg-surface-hover);
}

.dropzone__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.dropzone__desc {
  max-width: 420px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-muted);
}

/* ---------- 识别进度 ---------- */
.ocr-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--bg-app);
}

.ocr-banner__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.ocr-banner__text {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.ocr-banner__track {
  display: block;
  flex: 1;
  max-width: 140px;
  height: 3px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--border-color);
}

.ocr-banner__track i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width var(--duration) var(--ease);
}

.ocr-banner__hint {
  margin-left: auto;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---------- 多图切换 ---------- */
.papers {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  overflow-x: auto;
}

.papers__item {
  position: relative;
  flex: none;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-app);
}

.papers__item.is-active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--text-primary);
}

.papers__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.papers__count {
  position: absolute;
  right: 0;
  bottom: 0;
  min-width: 16px;
  padding: 0 3px;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  color: var(--text-inverse);
  background: var(--accent);
}

.papers__add {
  display: grid;
  flex: none;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-muted);
}

.papers__add:hover {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

/* ---------- 填写区 ---------- */
.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.submitbar {
  position: sticky;
  bottom: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.progress {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.progress__text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.progress__track {
  display: block;
  width: 140px;
  height: 4px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--border-color);
}

.progress__bar {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width var(--duration) var(--ease);
}

@media (max-width: 1100px) {
  .capture {
    grid-template-columns: minmax(0, 1fr);
  }

  .capture__stage {
    position: static;
  }
}

@media (max-width: 900px) {
  .ocr-banner__hint {
    display: none;
  }

  .submitbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
