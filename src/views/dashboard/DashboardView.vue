<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { IconName } from '@/components/common/icons'

/**
 * 控制台主页：图片入口 + 直方图统计 + 最近题目。
 *
 * 统计与最近题目目前没有数据来源，保留空数组走空态；
 * 接入接口后只需替换这两个 ref 的赋值，模板结构不用动。
 */

interface Entry {
  name: string
  title: string
  desc: string
  icon: IconName
}

interface DayStat {
  day: string
  count: number
}

interface RecentQuestion {
  id: string
  stem: string
}

const entries: Entry[] = [
  { name: 'capture', title: '拍照上传', desc: '上传试卷照片，逐张裁剪后提交识别', icon: 'camera' },
  { name: 'question-edit', title: '题目编辑', desc: '校对识别结果，修正题干与答案', icon: 'edit' },
  { name: 'questions', title: '题目管理', desc: '浏览、筛选已入库的个人题库', icon: 'layers' },
  { name: 'review', title: '复习卷', desc: '按标签与掌握度抽题组卷', icon: 'fileText' },
]

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 近 7 天做题量。当前无数据源，保持空数组。 */
const stats = ref<DayStat[]>([])

/** 最近入库的题目。当前无数据源，保持空数组。 */
const recentQuestions = ref<RecentQuestion[]>([])
</script>

<template>
  <div class="page dashboard-page">
    <PageHeader
      title="学习控制台"
      description="拍照、识别、打标签、入库到生成复习卷，一条完整的题目处理链路。"
    />

    <!-- 图片入口 -->
    <section class="panel">
      <div class="panel__head">
        <h2 class="panel__title">快速入口</h2>
        <span class="panel__hint">从任意一步开始</span>
      </div>

      <div class="panel__body">
        <div class="entries">
          <RouterLink
            v-for="entry in entries"
            :key="entry.name"
            class="entry"
            :to="{ name: entry.name }"
          >
            <span class="entry__visual">
              <span class="entry__glyph">
                <AppIcon :name="entry.icon" :size="26" :stroke-width="1.5" />
              </span>
            </span>

            <span class="entry__body">
              <strong class="entry__title">{{ entry.title }}</strong>
              <small class="entry__desc">{{ entry.desc }}</small>
            </span>
          </RouterLink>
        </div>
      </div>
    </section>

    <div class="split">
      <!-- 直方图统计 -->
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">学习统计</h2>
          <span class="panel__hint">最近 7 天做题量</span>
        </div>

        <div class="panel__body">
          <div class="chart">
            <div class="chart__plot">
              <span
                v-for="line in 3"
                :key="line"
                class="chart__line"
                :style="{ top: `${line * 25}%` }"
              />

              <div v-if="stats.length === 0" class="chart__empty">
                <AppIcon name="chart" :size="20" />
                <p class="chart__empty-title">还没有学习记录</p>
                <span class="chart__empty-desc">完成一次练习后，这里会按天展示做题量</span>
              </div>

              <div v-else class="chart__bars">
                <span
                  v-for="item in stats"
                  :key="item.day"
                  class="chart__bar"
                  :style="{ height: `${item.count}%` }"
                />
              </div>
            </div>

            <div class="chart__days">
              <span v-for="day in weekdays" :key="day">{{ day }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 最近题目 -->
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">最近题目</h2>
          <span class="panel__hint">按入库时间</span>
        </div>

        <EmptyState
          v-if="recentQuestions.length === 0"
          icon="layers"
          title="还没有题目"
          description="拍照上传一份试卷，校对完成后题目会出现在这里。"
        >
          <template #action>
            <RouterLink class="btn btn--primary" :to="{ name: 'capture' }">去拍照上传</RouterLink>
          </template>
        </EmptyState>

        <ul v-else class="recent">
          <li v-for="item in recentQuestions" :key="item.id" class="recent__item">
            <span class="recent__stem">{{ item.stem }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  max-width: 1120px;
}

/* ---------- 图片入口 ---------- */
.entries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  transition:
    border-color var(--duration) var(--ease),
    background var(--duration) var(--ease);
}

.entry:hover {
  border-color: var(--accent-border);
  background: var(--bg-surface-hover);
}

/* 网格纹理代替真实图片，保持纯黑白灰且不引入外部资源 */
.entry__visual {
  display: grid;
  place-items: center;
  height: 104px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--bg-app);
  background-image:
    linear-gradient(var(--border-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-color) 1px, transparent 1px);
  background-size: 22px 22px;
  background-position: -1px -1px;
  transition: border-color var(--duration) var(--ease);
}

.entry:hover .entry__visual {
  border-color: var(--accent-border);
}

.entry__glyph {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  background: var(--bg-surface);
  transition:
    color var(--duration) var(--ease),
    border-color var(--duration) var(--ease);
}

.entry:hover .entry__glyph {
  border-color: var(--accent-border);
  color: var(--accent-text);
}

.entry__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 4px 4px;
}

.entry__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.entry__desc {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ---------- 直方图 ---------- */
.chart__plot {
  position: relative;
  height: 176px;
  border-bottom: 1px solid var(--border-color);
}

.chart__line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-color);
  opacity: 0.6;
}

.chart__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-muted);
}

.chart__empty-title {
  margin-top: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.chart__empty-desc {
  font-size: 11.5px;
  color: var(--text-muted);
}

.chart__bars {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 0 4px;
}

.chart__bar {
  flex: 1;
  min-height: 2px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--accent);
}

.chart__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  padding: 8px 4px 0;
}

.chart__days span {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

/* ---------- 最近题目 ---------- */
.recent {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
}

.recent__item {
  padding: 11px 16px;
  border-bottom: 1px solid var(--border-color);
}

.recent__item:last-child {
  border-bottom: none;
}

.recent__stem {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 640px) {
  .entries {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .entry__visual {
    height: 84px;
  }
}
</style>
