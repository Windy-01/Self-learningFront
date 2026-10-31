<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import FlowNav from '@/components/flow/FlowNav.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppIcon from '@/components/common/AppIcon.vue'

/**
 * 步骤 4：题目管理。
 * 题库列表 + 筛选；数据接口接入前只保留表头与空态，不填充示例题目。
 */
const keyword = ref('')
const grade = ref('')
const subject = ref('')
const point = ref('')

const hasFilter = computed(
  () => Boolean(keyword.value || grade.value || subject.value || point.value),
)

function resetFilters(): void {
  keyword.value = ''
  grade.value = ''
  subject.value = ''
  point.value = ''
}
</script>

<template>
  <div class="page">
    <PageHeader
      title="题目管理"
      description="保存识别后的题目、答案与作答记录，形成可按标签检索的个人题库。"
      tag="步骤 4 / 5"
    >
      <template #actions>
        <RouterLink class="btn btn--sm btn--primary" :to="{ name: 'capture' }">
          <AppIcon name="plus" :size="14" />
          新增题目
        </RouterLink>
      </template>
    </PageHeader>

    <FlowNav />

    <section class="panel">
      <div class="panel__body">
        <div class="filter-grid">
          <label class="field">
            <span class="field__label">搜索题干</span>
            <input v-model="keyword" class="input" type="search" placeholder="输入题干关键词" />
          </label>

          <label class="field">
            <span class="field__label">学年</span>
            <select v-model="grade" class="select">
              <option value="">全部学年</option>
            </select>
          </label>

          <label class="field">
            <span class="field__label">科目</span>
            <select v-model="subject" class="select">
              <option value="">全部科目</option>
            </select>
          </label>

          <label class="field">
            <span class="field__label">知识点</span>
            <select v-model="point" class="select">
              <option value="">全部知识点</option>
            </select>
          </label>
        </div>

        <div class="filter-actions">
          <button class="btn btn--sm btn--ghost" type="button" :disabled="!hasFilter" @click="resetFilters">
            重置筛选
          </button>
          <span class="filter-actions__hint">标签选项将在标签体系接通后自动填充</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <h2 class="panel__title">题目列表</h2>
        <span class="panel__hint">0 道</span>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>题干</th>
              <th>学年</th>
              <th>科目</th>
              <th>知识点</th>
              <th>通过率</th>
              <th>作答次数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="7">
                <EmptyState
                  icon="layers"
                  title="题库还是空的"
                  description="从拍照上传开始，识别并保存第一道题；入库后可按学年、科目与知识点筛选。"
                >
                  <template #action>
                    <RouterLink class="btn btn--sm" :to="{ name: 'capture' }">
                      <AppIcon name="camera" :size="14" />
                      去拍照上传
                    </RouterLink>
                  </template>
                </EmptyState>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.filter-actions__hint {
  font-size: 11.5px;
  color: var(--text-muted);
}
</style>
