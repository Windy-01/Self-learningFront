<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import FlowNav from '@/components/flow/FlowNav.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppIcon from '@/components/common/AppIcon.vue'

/**
 * 步骤 5：复习卷生成。
 * 左侧收集抽取条件，右侧预览生成的复习卷；题库为空时按钮不可用。
 */
const count = ref(10)
const strategy = ref<'accuracy' | 'random'>('accuracy')
</script>

<template>
  <div class="page">
    <PageHeader
      title="复习卷生成"
      description="按标签筛选题库，结合通过率抽取题目，组成一份可直接打印的复习卷。"
      tag="步骤 5 / 5"
    >
      <template #actions>
        <span class="badge badge--muted">按标签抽取</span>
      </template>
    </PageHeader>

    <FlowNav />

    <div class="split">
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">生成条件</h2>
        </div>

        <div class="panel__body">
          <div class="form-grid">
            <label class="field">
              <span class="field__label">学年</span>
              <select class="select">
                <option value="">全部学年</option>
              </select>
            </label>

            <label class="field">
              <span class="field__label">科目</span>
              <select class="select">
                <option value="">全部科目</option>
              </select>
            </label>
          </div>

          <div class="field form-block">
            <span class="field__label">知识点</span>
            <div class="chip-row">
              <span class="chip chip--empty">尚未配置知识点</span>
            </div>
            <span class="field__hint">不选则从全部已入库题目中抽取。</span>
          </div>

          <label class="field form-block">
            <span class="field__label">题目数量</span>
            <input v-model.number="count" class="input input--narrow" type="number" min="1" max="50" />
            <span class="field__hint">单张复习卷最多 50 题。</span>
          </label>

          <div class="field form-block" role="radiogroup" aria-labelledby="strategy-label">
            <span id="strategy-label" class="field__label">抽取策略</span>
            <div class="strategy">
              <label class="strategy__item" :class="{ 'is-active': strategy === 'accuracy' }">
                <input v-model="strategy" type="radio" value="accuracy" />
                <span class="strategy__body">
                  <strong>通过率优先</strong>
                  <small>优先抽通过率偏低的题目，集中补薄弱知识点。</small>
                </span>
              </label>

              <label class="strategy__item" :class="{ 'is-active': strategy === 'random' }">
                <input v-model="strategy" type="radio" value="random" />
                <span class="strategy__body">
                  <strong>同标签随机</strong>
                  <small>在所选标签内随机抽取，适合整体过一遍。</small>
                </span>
              </label>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn--primary" type="button" disabled>
              <AppIcon name="sparkles" :size="15" />
              生成复习卷
            </button>
            <span class="field__hint">题库为空，暂不可生成</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">复习卷预览</h2>
          <div class="panel__tools">
            <button class="btn btn--sm" type="button" disabled>
              <AppIcon name="download" :size="14" />
              导出
            </button>
          </div>
        </div>

        <div class="panel__body">
          <EmptyState
            icon="fileText"
            title="还没有生成复习卷"
            description="设置抽取条件后生成，题目会按通过率排列，并保留原图与题干。"
          >
            <template #action>
              <RouterLink class="btn btn--sm" :to="{ name: 'questions' }">
                <AppIcon name="layers" :size="14" />
                先完善题库
              </RouterLink>
            </template>
          </EmptyState>
        </div>
      </section>
    </div>

    <p class="note">
      抽取逻辑：先按标签圈定题目范围，再根据策略排序或随机抽样，最后按题目顺序组装成卷。
    </p>
  </div>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-block {
  margin-top: 16px;
}

.input--narrow {
  max-width: 140px;
}

.strategy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.strategy__item {
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

.strategy__item:hover {
  background: var(--bg-surface-hover);
}

.strategy__item.is-active {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.strategy__item input {
  margin-top: 3px;
  accent-color: var(--accent);
}

.strategy__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.strategy__body strong {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.strategy__body small {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

@media (max-width: 520px) {
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
