<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 标签 / 知识点的挂载器。
 *
 * 两件事：
 * 1. 已挂的显示成胶囊，点 × 摘掉（幂等接口，不弹确认）；
 * 2. 未挂的从弹层里挑，搜不到就直接新建 —— 建完顺手挂上，不用跳去「整理」页。
 *
 * 父组件负责调接口，这里只管交互，所以标签和知识点可以共用。
 */

interface PickerItem {
  id: number
  name: string
  system?: boolean
}

const props = withDefaults(
  defineProps<{
    items: PickerItem[]
    options: PickerItem[]
    placeholder?: string
    addText?: string
    creatable?: boolean
  }>(),
  {
    placeholder: '未设置',
    addText: '添加',
    creatable: true,
  },
)

const emit = defineEmits<{
  (e: 'add', id: number): void
  (e: 'remove', id: number): void
  (e: 'create', name: string): void
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const keyword = ref('')

const trimmed = computed(() => keyword.value.trim())

const filtered = computed(() => {
  const picked = new Set(props.items.map((item) => item.id))

  return props.options.filter(
    (option) =>
      !picked.has(option.id) && (trimmed.value === '' || option.name.includes(trimmed.value)),
  )
})

/** 输入了库里没有的名字才允许新建；同名已存在时直接让用户从列表里选。 */
const canCreate = computed(
  () =>
    props.creatable
    && trimmed.value !== ''
    && !props.options.some((option) => option.name === trimmed.value),
)

function toggle(): void {
  open.value = !open.value
  if (open.value) keyword.value = ''
}

function pick(id: number): void {
  emit('add', id)
  close()
}

function create(): void {
  if (!canCreate.value) return

  emit('create', trimmed.value)
  close()
}

function close(): void {
  open.value = false
  keyword.value = ''
}

function onEnter(): void {
  if (canCreate.value) {
    create()
    return
  }

  if (filtered.value.length === 1) {
    pick(filtered.value[0].id)
  }
}

/** 点到外面就收起，避免弹层挂在页面上挡内容。 */
function onDocumentClick(event: MouseEvent): void {
  if (!open.value) return
  if (event.target instanceof Node && root.value?.contains(event.target)) return

  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="picker">
    <div class="chip-row">
      <span v-for="item in items" :key="item.id" class="chip">
        {{ item.name }}
        <button class="chip__x" type="button" :aria-label="`移除 ${item.name}`" @click="emit('remove', item.id)">
          ×
        </button>
      </span>

      <span v-if="items.length === 0" class="chip chip--empty">{{ placeholder }}</span>

      <button class="chip chip--add" type="button" @click="toggle">
        <AppIcon name="plus" :size="12" :stroke-width="2" />
        {{ addText }}
      </button>
    </div>

    <div v-if="open" class="picker__pop">
      <input
        v-model="keyword"
        class="input picker__input"
        type="text"
        placeholder="搜索，或输入新名称"
        spellcheck="false"
        @keydown.enter.prevent="onEnter"
      />

      <div class="picker__list">
        <button
          v-for="option in filtered"
          :key="option.id"
          class="picker__item"
          type="button"
          @click="pick(option.id)"
        >
          <span class="picker__name">{{ option.name }}</span>
          <span v-if="option.system" class="badge badge--muted">系统</span>
        </button>

        <button
          v-if="canCreate"
          class="picker__item picker__item--create"
          type="button"
          @click="create"
        >
          新建「{{ trimmed }}」
        </button>

        <p v-if="filtered.length === 0 && !canCreate" class="picker__empty">没有可添加的项</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
}

.picker__pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 248px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}

.picker__input {
  height: 30px;
  font-size: 12px;
}

.picker__list {
  display: flex;
  flex-direction: column;
  max-height: 220px;
  margin-top: 6px;
  overflow-y: auto;
}

.picker__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  color: var(--text-secondary);
  text-align: left;
}

.picker__item:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.picker__item--create {
  color: var(--text-primary);
  font-weight: 600;
}

.picker__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker__empty {
  padding: 8px;
  font-size: 11.5px;
  color: var(--text-muted);
}
</style>
