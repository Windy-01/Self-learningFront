<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue'
</script>

<template>
  <div class="dashboard">
    <header class="page-head">
      <div>
        <h1 class="page-head__title">控制台主页</h1>
        <p class="page-head__desc">临时主页，用于承载后续业务内容。</p>
      </div>
      <span class="page-head__tag">临时页面</span>
    </header>

    <!-- 正文占位：后续业务内容渲染在这里 -->
    <section class="content-slot">
      <span class="content-slot__icon">
        <AppIcon name="blocks" :size="24" :stroke-width="1.7" />
      </span>
      <p class="content-slot__title">正文区域</p>
      <p class="content-slot__desc">
        布局骨架已就绪：侧边导航栏、顶部菜单栏与正文区域。
      </p>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: var(--page-max-width);
  margin: 0 auto;
}

/* ---------- 页头 ---------- */
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-head__title {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.page-head__desc {
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-secondary);
}

.page-head__tag {
  flex: none;
  padding: 2px 10px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--accent-text);
  background: var(--accent-soft);
}

/* ---------- 正文占位 ---------- */
.content-slot {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 320px;
  padding: 40px 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.content-slot__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 10px;
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  background: var(--bg-surface-hover);
}

.content-slot__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.content-slot__desc {
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
