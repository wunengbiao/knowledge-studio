import { net } from 'electron'
import { readFileSync } from 'fs'

export interface MistralOcrConfig {
  apiUrl: string
  apiKey: string
  model: string
}

interface MistralOcrPage {
  index: number
  markdown: string
  images?: unknown[]
  dimensions?: unknown
}

interface MistralOcrResponse {
  pages: MistralOcrPage[]
  model?: string
  usage_info?: Record<string, unknown>
}

const DEFAULT_API_URL = 'https://api.mistral.ai/v1/ocr'
const DEFAULT_MODEL = 'mistral-ocr-latest'

export class PdfOcrService {
  /**
   * 调用 Mistral OCR API 将 PDF 文件转换为 Markdown
   */
  async convertPdfToMarkdown(
    filePath: string,
    config: MistralOcrConfig,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<string> {
    if (!config.apiKey) {
      throw new Error('未配置 Mistral API Key')
    }

    onProgress?.(5, 100, '读取 PDF 文件...')
    const buffer = readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:application/pdf;base64,${base64}`

    onProgress?.(15, 100, '上传到 Mistral OCR...')

    const url = config.apiUrl || DEFAULT_API_URL
    const model = config.model || DEFAULT_MODEL

    const response = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        document: {
          type: 'document_url',
          document_url: dataUrl
        },
        include_image_base64: false
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Mistral OCR API 错误 (${response.status}): ${errText}`)
    }

    onProgress?.(40, 100, '解析 OCR 结果...')

    const data = (await response.json()) as MistralOcrResponse
    if (!data.pages || data.pages.length === 0) {
      throw new Error('Mistral OCR 返回空结果')
    }

    const pages = [...data.pages].sort((a, b) => a.index - b.index)
    const markdown = pages
      .map((p) => p.markdown || '')
      .filter((md) => md.trim().length > 0)
      .join('\n\n---\n\n')

    if (!markdown.trim()) {
      throw new Error('Mistral OCR 未识别出文本内容')
    }

    onProgress?.(45, 100, `OCR 完成 (共 ${pages.length} 页)`)
    return markdown
  }

  /**
   * 测试 Mistral API Key 是否有效。使用空 GET 调用 models 端点。
   */
  async test(config: MistralOcrConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('未配置 Mistral API Key')
    }
    const response = await net.fetch('https://api.mistral.ai/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` }
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Mistral API 错误 (${response.status}): ${errText}`)
    }
  }
}

export const pdfOcrService = new PdfOcrService()
