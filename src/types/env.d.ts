/**
 * 环境变量声明。
 *
 * OCR 的模型与内核默认从公共 CDN 取；想完全离线部署时，
 * 把资源放到 `public/` 下，再用这几个变量指向同源地址即可（见 `utils/ocr.ts`）。
 */
interface ImportMetaEnv {
  /** 语言模型目录，默认 `https://tessdata.projectnaptha.com/4.0.0_fast` */
  readonly VITE_OCR_LANG_PATH?: string
  /** 内核目录，默认走 tesseract.js 自带的 CDN */
  readonly VITE_OCR_CORE_PATH?: string
  /** worker 脚本地址，默认走 tesseract.js 自带的 CDN */
  readonly VITE_OCR_WORKER_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
