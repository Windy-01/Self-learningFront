/**
 * 后端接口 base url 的解析与校验（沿用父项目）。
 *
 * - 留空 / 只有空白 → 返回空串，调用方按「与站点同源」走相对路径；
 * - 合法地址（`http:` / `https:` 绝对地址）→ 返回去掉末尾斜杠的规范形式；
 * - 格式错误（其它协议、缺协议、纯文本…）→ 同样返回空串，回落到默认逻辑。
 *
 * 注意：这里只判断「能不能用」，不改写配置里存的值 ——
 * 用户填错的内容要留在输入框里让他自己改。
 */

const allowedProtocols = ['http:', 'https:']

export function normalizeApiBaseUrl(raw: string): string {
  const value = raw.trim()

  if (value === '') {
    return ''
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return ''
  }

  if (!allowedProtocols.includes(url.protocol)) {
    return ''
  }

  // 丢掉 query / hash，只保留 origin + path，再去掉末尾斜杠。
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

/** 配置值是否「填了但格式不对」；留空不算错误。 */
export function isApiBaseUrlInvalid(raw: string): boolean {
  return raw.trim() !== '' && normalizeApiBaseUrl(raw) === ''
}
