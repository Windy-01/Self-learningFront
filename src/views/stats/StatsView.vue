<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppIcon from '@/components/common/AppIcon.vue'

/**
 * 学习分析：知识点掌握统计。
 * 按标签汇总题目数量与通过率；没有作答记录时保持空态，不显示占位数字。
 */
</script>

<template>
  <div class="page">
    <PageHeader
      title="知识点掌握统计"
      description="按学年、科目与知识点汇总题目数量和通过率，定位薄弱环节。"
    >
      <template #actions>
        <span class="badge badge--muted">数据来自作答记录</span>
      </template>
    </PageHeader>

    <section class="panel">
      <div class="panel__body">
        <div class="filter-grid">
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

          <label class="field">
            <span class="field__label">知识点</span>
            <select class="select">
              <option value="">全部知识点</option>
            </select>
          </label>
        </div>
      </div>
    </section>

    <div class="split split--even">
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">通过率分布</h2>
          <span class="panel__hint">按知识点聚合</span>
        </div>

        <div class="panel__body">
          <EmptyState
            icon="chart"
            title="暂无统计数据"
            description="题目入库并产生作答记录后，这里会按知识点展示通过率与题目数量。"
          >
            <template #action>
              <RouterLink class="btn btn--sm" :to="{ name: 'questions' }">
                <AppIcon name="layers" :size="14" />
                查看题库
              </RouterLink>
            </template>
          </EmptyState>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">知识点明细</h2>
          <span class="panel__hint">0 个</span>
        </div>

        <div class="panel__body">
          <EmptyState
            icon="target"
            title="还没有知识点数据"
            description="先给题目打上知识点标签，统计会随作答情况自动累计。"
          >
            <template #action>
              <RouterLink class="btn btn--sm" :to="{ name: 'tags' }">
                <AppIcon name="tag" :size="14" />
                去标签管理
              </RouterLink>
            </template>
          </EmptyState>
        </div>
      </section>
    </div>

    <p class="note">
      统计口径：同一知识点下全部题目的累计作答次数与通过次数，来自本人题库；后续可扩展到同标签的公开题目。
    </p>
  </div>
</template>
