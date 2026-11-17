<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import { useToast } from '@/composables/useToast'
import { generateReviewSheet } from '@/api/review'
import { labelStatistics } from '@/api/label'
import { knowledgeStatistics } from '@/api/knowledge'
import { errorMessage } from '@/api/http'
import { nowSheetTitle } from '@/utils/format'

/**
 * 生成复习卷。
 *
 * 只有三个输入：标题、题量、范围。其余交给抽题规则（得分率升序、没做过的排后面）。
 *
 * 范围选项**只列有题目的标签 / 知识点**（`L7` / `K3` 里 `question_count > 0`）：
 * 让用户选一个空分类，点生成必然 400，这是可以提前避免的失败。
 *
 * 生成成功后直接进作答页 —— 生成页留在这里没有任何意义。
 */
type Scope = 'all' | 'knowledge' | 'tag'

interface ScopeOption {
  id: number
  name: string
  count: number
}

const route = useRoute()
const router = useRouter()
const { push } = useToast()

const title = ref(nowSheetTitle())
const countText = ref('10')
const scope = ref<Scope>('all')
const targetId = ref<number | null>(null)

const knowledgeOptions = ref<ScopeOption[]>([])
const tagOptions = ref<ScopeOption[]>([])

const optionsLoading = ref(true)
const optionsError = ref('')

const submitting = ref(false)
const error = ref('')

const activeOptions = computed<ScopeOption[]>(() => {
  if (scope.value === 'knowledge') return knowledgeOptions.value
  if (scope.value === 'tag') return tagOptions.value

  return []
})

const targetLabel = computed(() => (scope.value === 'tag' ? '标签' : '知识点'))

const canSubmit = computed(() => {
  if (submitting.value) return false
  if (scope.value === 'all') return true

  return targetId.value !== null
})

async function loadOptions(): Promise<void> {
  optionsLoading.value = true
  optionsError.value = ''

  try {
    const [tags, points] = await Promise.all([labelStatistics(), knowledgeStatistics()])

    tagOptions.value = tags
      .filter((tag) => tag.question_count > 0)
      .map((tag) => ({ id: tag.tag_id, name: tag.name, count: tag.question_count }))

    knowledgeOptions.value = points
      .filter((point) => point.question_count > 0)
      .map((point) => ({
        id: point.knowledge_point_id,
        name: point.name,
        count: point.question_count,
      }))
  } catch (cause) {
    optionsError.value = errorMessage(cause)
  } finally {
    optionsLoading.value = false
    applyPrefill()
    ensureTarget()
  }
}

/** 选项到得比用户点「按知识点」晚时，补一个有效选择，避免下拉框显示第一项但模型是 null。 */
function ensureTarget(): void {
  if (scope.value === 'all' || targetId.value !== null) return

  const list = scope.value === 'tag' ? tagOptions.value : knowledgeOptions.value

  targetId.value = list[0]?.id ?? null
}

/**
 * 从分析页 / 工作台带 `?knowledgePointId=`、`?tagId=`、`?number=` 进来时预填。
 *
 * 范围只在选项里确实存在时预选 —— 选一个不在列表里的 id，下拉框会显示空白。
 */
function applyPrefill(): void {
  const numberParam = Number(route.query.number)

  if (Number.isFinite(numberParam) && numberParam > 0) {
    countText.value = String(Math.min(50, Math.max(1, Math.round(numberParam))))
  }

  const pointId = Number(route.query.knowledgePointId)
  const tagId = Number(route.query.tagId)

  if (Number.isFinite(pointId) && pointId > 0 && knowledgeOptions.value.some((item) => item.id === pointId)) {
    scope.value = 'knowledge'
    targetId.value = pointId
    return
  }

  if (Number.isFinite(tagId) && tagId > 0 && tagOptions.value.some((item) => item.id === tagId)) {
    scope.value = 'tag'
    targetId.value = tagId
  }
}

/** 切换范围时保留仍然有效的选择，否则落到第一项。 */
watch(scope, (value) => {
  if (value === 'all') {
    targetId.value = null
    return
  }

  const list = value === 'tag' ? tagOptions.value : knowledgeOptions.value

  if (!list.some((item) => item.id === targetId.value)) {
    targetId.value = list[0]?.id ?? null
  }
})

function normalizeCount(): void {
  const value = Math.round(Number(countText.value))

  countText.value = String(
    Number.isFinite(value) && value > 0 ? Math.min(50, value) : 10,
  )
}

async function generate(): Promise<void> {
  if (!canSubmit.value) return

  error.value = ''

  const number = Math.round(Number(countText.value))

  if (!Number.isFinite(number) || number < 1 || number > 50) {
    error.value = '题量需要在 1–50 之间。'
    return
  }

  if (scope.value !== 'all' && targetId.value === null) {
    error.value = `先选一个${targetLabel.value}。`
    return
  }

  submitting.value = true

  try {
    const detail = await generateReviewSheet({
      number,
      title: title.value.trim() || undefined,
      knowledgePointId: scope.value === 'knowledge' ? (targetId.value ?? undefined) : undefined,
      tagId: scope.value === 'tag' ? (targetId.value ?? undefined) : undefined,
    })

    push(`已生成，共 ${detail.sheet.question_count} 题`)

    // replace：生成页不该留在返回栈里，从作答页返回应回到列表
    await router.replace({
      name: 'review-detail',
      params: { id: detail.sheet.review_sheet_id },
    })
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    submitting.value = false
  }
}

onMounted(loadOptions)
</script>

<template>
  <div class="page page--narrow">
    <div>
      <RouterLink class="back" :to="{ name: 'review' }">‹ 返回复习卷</RouterLink>
      <PageHeader title="生成复习卷" description="三个输入就够了，其余交给抽题规则。" />
    </div>

    <section class="panel">
      <div class="form">
        <label class="field">
          <span class="field__label">卷标题</span>
          <input v-model="title" class="input" type="text" maxlength="60" spellcheck="false" />
          <span class="field__hint">留空也可以，列表里会用创建时间代替。</span>
        </label>

        <label class="field field--count">
          <span class="field__label">题量</span>
          <input
            v-model="countText"
            class="input"
            type="number"
            min="1"
            max="50"
            inputmode="numeric"
            @blur="normalizeCount"
          />
          <span class="field__hint">1–50 题，默认 10。题库里的题不够时，会抽到多少算多少。</span>
        </label>

        <div class="field">
          <span class="field__label">范围</span>

          <div class="scopes">
            <label class="scope" :class="{ 'is-picked': scope === 'all' }">
              <input v-model="scope" type="radio" value="all" name="scope" />
              <span class="scope__text">
                <b>全部题目</b>
                <small>从整个题库里抽，最薄弱优先。</small>
              </span>
            </label>

            <label class="scope" :class="{ 'is-picked': scope === 'knowledge' }">
              <input v-model="scope" type="radio" value="knowledge" name="scope" />
              <span class="scope__text">
                <b>按知识点</b>
                <small>只抽某个知识点下的题。</small>
              </span>
            </label>

            <label class="scope" :class="{ 'is-picked': scope === 'tag' }">
              <input v-model="scope" type="radio" value="tag" name="scope" />
              <span class="scope__text">
                <b>按标签</b>
                <small>按自由标签圈定范围。</small>
              </span>
            </label>
          </div>

          <template v-if="scope !== 'all'">
            <ErrorBar
              v-if="optionsError"
              :message="optionsError"
              @retry="loadOptions"
            />

            <select v-else v-model.number="targetId" class="select scope__select" :disabled="optionsLoading">
              <option v-if="optionsLoading" :value="null">正在读取{{ targetLabel }}…</option>
              <option v-else-if="activeOptions.length === 0" :value="null">
                还没有挂{{ targetLabel }}的题目
              </option>
              <option v-for="option in activeOptions" :key="option.id" :value="option.id">
                {{ option.name }}（{{ option.count }} 题）
              </option>
            </select>

            <span v-if="!optionsLoading && !optionsError && activeOptions.length === 0" class="field__hint">
              去题库给题目挂上{{ targetLabel }}，或者先用「全部题目」抽一份。
            </span>
          </template>
        </div>

        <p class="note">
          抽题规则：在当前范围内按题目得分率升序取题，没做过的题排在做过之后，同档按题目 ID 倒序。
        </p>

        <p v-if="error" class="form__error">{{ error }}</p>

        <div class="form__actions">
          <RouterLink class="btn btn--ghost" :to="{ name: 'review' }">取消</RouterLink>
          <button class="btn btn--primary" type="button" :disabled="!canSubmit" @click="generate">
            <AppIcon name="sparkles" :size="14" :stroke-width="1.8" />
            {{ submitting ? '生成中…' : '生成并开始作答' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page--narrow {
  max-width: 640px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}

.field--count .input {
  max-width: 120px;
}

.scopes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scope {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.scope:hover {
  border-color: var(--border-strong);
  background: var(--bg-surface-hover);
}

.scope.is-picked {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.scope input {
  margin-top: 3px;
  accent-color: var(--accent);
}

.scope__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scope__text b {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.scope__text small {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.scope__select {
  margin-top: 2px;
}

.form__error {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .form {
    padding: 14px;
  }

  .form__actions {
    flex-direction: column-reverse;
  }

  .form__actions .btn {
    width: 100%;
  }
}
</style>
