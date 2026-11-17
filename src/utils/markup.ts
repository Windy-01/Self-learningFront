/**
 * 题干 / 选项渲染：Markdown + LaTeX（`$…$` / `$$…$$`）。
 *
 * 后端 `content.stem_markup` 的约定本来就是「Markdown + LaTeX」，所以这里真的解析 Markdown，
 * 而不是像早先那样只切公式：加粗、列表、行内代码、引用、表格、换行都要能正常显示。
 * 公式交给 `@mdit/plugin-katex`，它把 `$…$` / `$$…$$` 转成 KaTeX 的 HTML。
 *
 * 两个入口，区别只在「块级 / 行内」：
 * - `renderMarkup` → `md.render`，输出 `<p>…</p>` 之类的块级结构，给题干用；
 * - `renderInlineMarkup` → `md.renderInline`，不包 `<p>`，给选项用
 *   （选项本身已经是 `<span>`/`<button>`，里面塞 `<p>` 是非法嵌套，浏览器会把父节点拆开）。
 *
 * 安全边界：`html: false`，原文里的 `<img onerror=…>` 之类会被转义成文本；
 * `markdown-it` 默认的 `validateLink` 也会拦掉 `javascript:` 链接。
 * 唯一注入 `v-html` 的就是这里的输出。
 */

import MarkdownIt from 'markdown-it'
import { katex } from '@mdit/plugin-katex'

const md = new MarkdownIt({
  // 原文里的 HTML 一律当文本，题干不需要也不该有裸标签
  html: false,
  // 题干里出现网址不该自动变链接：很多题面是 `a.b.c` 这种变量写法
  linkify: false,
  // 单个换行即换行。OCR 抄来的题干一行一句，靠这个才不会被拼成一段
  breaks: true,
})

md.use(katex, {
  // 渲染失败不抛错：输出红色原始 TeX，用户至少能看到自己写了什么
  throwOnError: false,
  strict: 'ignore',
})

/** 块级渲染（题干、预览区）：返回可直接 `v-html` 的 HTML */
export function renderMarkup(text: string): string {
  if (text.trim() === '') return ''

  return md.render(text)
}

/** 行内渲染（选项）：不产生 `<p>` 包裹，可安全放进 `<span>` / `<button>` */
export function renderInlineMarkup(text: string): string {
  if (text.trim() === '') return ''

  return md.renderInline(text)
}

/**
 * 有没有值得预览的标记：决定「预览」区块显不显示。
 *
 * 判断方式是直接看渲染结果里除了 `<p>` / `<br>` 还有没有别的标签，
 * 而不是用正则去猜 Markdown 语法。理由是猜不准：
 * `若 |x| < 1` 会被 `\|.*\|` 当成表格，`1. 下列说法` 又确实是列表。
 * 渲染一次再比对，得到的就是「预览和输入框长得不一样」，正是要的语义。
 */
export function hasMarkup(text: string): boolean {
  return /<(?!\/?(?:p|br)\b)[a-z]/i.test(renderMarkup(text))
}
