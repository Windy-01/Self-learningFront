<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import FlowNav from '@/components/flow/FlowNav.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppIcon from '@/components/common/AppIcon.vue'

/**
 * 步骤 3：标签管理。
 * 左侧维护三个标签维度（学年 / 科目 / 知识点），右侧编辑当前题目的标签。
 * 标签数据接入前只渲染维度骨架，不预置任何示例标签。
 */
const dimensions = [
  { key: 'grade', label: '学年', hint: '单选', placeholder: '尚未配置学年' },
  { key: 'subject', label: '科目', hint: '单选', placeholder: '尚未配置科目' },
  { key: 'point', label: '知识点', hint: '多选', placeholder: '尚未配置知识点' },
]
</script>

<template>
  <div class="page">
    <PageHeader
      title="标签管理"
      description="为题目标注学年、科目与知识点。标签决定后续的掌握统计与复习卷抽取范围。"
      tag="步骤 3 / 5"
    >
      <template #actions>
        <span class="badge badge--muted">按账户保存</span>
      </template>
    </PageHeader>

    <FlowNav />

    <div class="split">
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">标签维度</h2>
          <span class="panel__hint">共 3 个维度</span>
        </div>

        <div class="panel__body">
          <div v-for="item in dimensions" :key="item.key" class="dimension">
            <div class="dimension__head">
              <span class="field__label">{{ item.label }}</span>
              <span class="dimension__hint">{{ item.hint }}</span>
            </div>
            <div class="chip-row">
              <span class="chip chip--empty">{{ item.placeholder }}</span>
            </div>
          </div>

          <p class="note">
            标签体系接通后，这里会列出该账户已使用过的标签，可直接复用或新建；题目入库时写入，也可随时修改。
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">当前题目</h2>
          <RouterLink class="panel__hint" :to="{ name: 'questions' }">去题目管理</RouterLink>
        </div>

        <div class="panel__body">
          <EmptyState
            icon="tag"
            title="未选择题目"
            description="从题目管理选择一道题后，在这里维护它的学年、科目与知识点。"
          >
            <template #action>
              <RouterLink class="btn btn--sm" :to="{ name: 'questions' }">
                <AppIcon name="layers" :size="14" />
                选择题目
              </RouterLink>
            </template>
          </EmptyState>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dimension {
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}

.dimension:first-child {
  padding-top: 0;
}

.dimension:last-of-type {
  border-bottom: none;
}

.dimension__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.dimension__hint {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
