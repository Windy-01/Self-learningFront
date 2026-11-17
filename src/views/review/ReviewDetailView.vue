<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorBar from '@/components/common/ErrorBar.vue'
import SkeletonList from '@/components/common/SkeletonList.vue'
import ReviewQuiz from '@/components/review/ReviewQuiz.vue'
import ReviewResult from '@/components/review/ReviewResult.vue'
import { getReviewSheet } from '@/api/review'
import { errorMessage, isNotFound } from '@/api/http'
import type { ReviewSheetDetail, ReviewSheetEntity } from '@/api/types'

/**
 * 复习卷详情的容器。
 *
 * **作答与结果共用一个地址**（`/review/:id`），按卷子状态分流：
 * 待作答 → 作答页；已提交 / 已作废 → 结果页。
 *
 * 这样交卷后不需要跳转 —— 状态一变，同一个地址自然渲染成结果页，
 * 用户刷新也不会看到一个已经交过的卷子的作答界面。
 */
const route = useRoute()
const router = useRouter()

const id = computed(() => Number(route.params.id))

const detail = ref<ReviewSheetDetail | null>(null)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)

const mode = computed<'quiz' | 'result'>(() => {
  const status = detail.value?.sheet.status

  return status === 0 || status === 1 ? 'quiz' : 'result'
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  notFound.value = false

  try {
    detail.value = await getReviewSheet(id.value)
  } catch (cause) {
    detail.value = null

    if (isNotFound(cause)) {
      notFound.value = true
    } else {
      error.value = errorMessage(cause)
    }
  } finally {
    loading.value = false
  }
}

/** 交卷成功：不重新请求，直接用返回的卷头替换 —— 页面当场变成结果页。 */
function onSubmitted(sheet: ReviewSheetEntity): void {
  if (!detail.value) return

  detail.value = { sheet, items: detail.value.items }
}

function onDeleted(): void {
  void router.replace({ name: 'review' })
}

onMounted(load)
</script>

<template>
  <div class="page">
    <section v-if="loading" class="panel">
      <SkeletonList :rows="5" />
    </section>

    <ErrorBar v-else-if="error" :message="error" @retry="load" />

    <EmptyState
      v-else-if="notFound"
      icon="fileText"
      title="这份复习卷不存在"
      description="可能已经被删除，或者不属于当前学生。"
    >
      <template #action>
        <button class="btn btn--sm" type="button" @click="router.push({ name: 'review' })">
          返回复习卷
        </button>
      </template>
    </EmptyState>

    <ReviewQuiz
      v-else-if="detail && mode === 'quiz'"
      :detail="detail"
      @submitted="onSubmitted"
      @refresh="load"
    />

    <ReviewResult
      v-else-if="detail"
      :detail="detail"
      @deleted="onDeleted"
      @refresh="load"
    />
  </div>
</template>
