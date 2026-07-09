import { BrowserWindow, dialog, ipcMain } from 'electron'
import { AssistantService } from './services/assistant-service'
import { ChatService } from './services/chat-service'
import { DocumentService } from './services/document-service'
import { embeddingService } from './services/embedding-service'
import { GraphService } from './services/graph-service'
import { KnowledgeBaseService } from './services/knowledge-base-service'
import { pdfOcrService } from './services/pdf-ocr-service'
import { SearchService } from './services/search-service'
import { SettingsService } from './services/settings-service'
import { VectorStore } from './services/vector-store'

const kbService = new KnowledgeBaseService()
const docService = new DocumentService()
const searchService = new SearchService()
const graphService = new GraphService()
const settingsService = new SettingsService()
const assistantService = new AssistantService()
const chatService = new ChatService()

export { docService }

export function registerIpcHandlers(): void {
  // ─── Knowledge Base ───────────────────────────────────
  ipcMain.handle('kb:list', async () => kbService.list())

  ipcMain.handle('kb:create', async (_e, params) => kbService.create(params))

  ipcMain.handle('kb:update', async (_e, { id, updates }) => kbService.update(id, updates))

  ipcMain.handle('kb:delete', async (_e, { id }) => {
    const vectorStore = await VectorStore.getInstance()
    await vectorStore.deleteByKb(id).catch((e) => {
      console.error('[kb:delete] LanceDB 删除失败:', e)
    })
    return kbService.delete(id)
  })

  ipcMain.handle('kb:get', async (_e, { id }) => kbService.get(id))

  // ─── Documents ────────────────────────────────────────
  ipcMain.handle('doc:list', async (_e, { kbId }) => docService.list(kbId))

  ipcMain.handle('doc:upload', async (_e, { kbId, filePath, sourceType }) => {
    const getWin = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0]
    const settings = settingsService.get()
    const mistralOcr =
      sourceType === 'pdf' && settings.mistralApiKey
        ? {
            apiUrl: settings.mistralApiUrl,
            apiKey: settings.mistralApiKey,
            model: settings.mistralOcrModel
          }
        : undefined
    const doc = await docService.upload(
      kbId,
      filePath,
      sourceType,
      (current, total, status) => {
        getWin()?.webContents.send('progress:indexing', { kbId, current, total, status })
      },
      { mistralOcr }
    )
    docService
      .processEmbeddings(doc.id, kbId, (current, total, status) => {
        getWin()?.webContents.send('progress:doc-embedding', {
          docId: doc.id,
          current,
          total,
          status
        })
      })
      .catch((e) => console.error('[doc:upload] embedding 失败:', e))
    return doc
  })

  ipcMain.handle('doc:import-url', async (_e, { kbId, url }) => {
    const getWin = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0]
    try {
      const doc = await docService.importUrl(kbId, url, (current, total, status) => {
        getWin()?.webContents.send('progress:indexing', { kbId, current, total, status })
      })
      if (doc) {
        docService
          .processEmbeddings(doc.id, kbId, (current, total, status) => {
            getWin()?.webContents.send('progress:doc-embedding', {
              docId: doc.id,
              current,
              total,
              status
            })
          })
          .catch((e) => console.error('[doc:import-url] embedding 失败:', e))
      }
      return doc
    } catch (e: any) {
      getWin()?.webContents.send('progress:indexing', {
        kbId,
        current: 0,
        total: 100,
        status: `导入失败: ${e.message}`
      })
      return null
    }
  })

  ipcMain.handle('doc:delete', async (_e, { docId }) => docService.delete(docId))

  ipcMain.handle('doc:get', async (_e, { docId }) => docService.get(docId))

  ipcMain.handle('doc:rename', async (_e, { docId, title }) => docService.rename(docId, title))

  // ─── Search ───────────────────────────────────────────
  ipcMain.handle('search:query', async (_e, { kbId, query, mode, topK }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return searchService.search(kbId, query, mode, topK, (current, total, status) => {
      win?.webContents.send('progress:embedding', { kbId, current, total, status })
    })
  })

  // ─── GraphRAG ─────────────────────────────────────────
  ipcMain.handle('graph:build', async (_e, { kbId }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return graphService.build(kbId, (current, total, status) => {
      win?.webContents.send('progress:graph-build', { kbId, current, total, status })
    })
  })

  ipcMain.handle('graph:entities', async (_e, { kbId }) => graphService.getEntities(kbId))

  ipcMain.handle('graph:relations', async (_e, { kbId }) => graphService.getRelations(kbId))

  ipcMain.handle('graph:communities', async (_e, { kbId }) => graphService.getCommunities(kbId))

  ipcMain.handle('graph:status', async (_e, { kbId }) => graphService.getStatus(kbId))

  // ─── Settings ─────────────────────────────────────────
  ipcMain.handle('settings:get', async () => settingsService.get())

  ipcMain.handle('settings:update', async (_e, updates) => settingsService.update(updates))

  ipcMain.handle('settings:test-embedding', async (_e, settings) => {
    try {
      await searchService.testEmbedding(settings)
      return { success: true, message: 'Embedding API 连接成功' }
    } catch (e: any) {
      return { success: false, message: e.message || '连接失败' }
    }
  })

  ipcMain.handle('settings:test-rerank', async (_e, settings) => {
    try {
      await searchService.testRerank(settings)
      return { success: true, message: 'ReRank API 连接成功' }
    } catch (e: any) {
      return { success: false, message: e.message || '连接失败' }
    }
  })

  ipcMain.handle('settings:test-llm', async (_e, settings) => {
    try {
      await searchService.testLlm({
        apiUrl: settings.llmApiUrl,
        apiKey: settings.llmApiKey,
        model: settings.llmModel
      })
      return { success: true, message: 'LLM API 连接成功' }
    } catch (e: any) {
      return { success: false, message: e.message || '连接失败' }
    }
  })

  ipcMain.handle('settings:test-mistral', async (_e, settings) => {
    try {
      await pdfOcrService.test({
        apiUrl: settings.mistralApiUrl,
        apiKey: settings.mistralApiKey,
        model: settings.mistralOcrModel
      })
      return { success: true, message: 'Mistral API 连接成功' }
    } catch (e: any) {
      return { success: false, message: e.message || '连接失败' }
    }
  })

  ipcMain.handle('provider:list-models', async (_e, config) => {
    try {
      const models = await searchService.listProviderModels(config)
      return { success: true, models }
    } catch (e: any) {
      return { success: false, message: e.message || '获取失败', models: [] }
    }
  })

  // ─── Embedding Management ─────────────────────────────
  ipcMain.handle('kb:test-embedding', async (_e, config) => {
    try {
      await embeddingService.test(config)
      return { success: true, message: 'Embedding API 连接成功' }
    } catch (e: any) {
      return { success: false, message: e.message || '连接失败' }
    }
  })

  ipcMain.handle('embedding:status', async (_e, { kbId }) => docService.getEmbeddingStatus(kbId))

  ipcMain.handle('embedding:retry', async (_e, { docId }) => {
    const doc = docService.get(docId)
    if (!doc) return false
    const getWin = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0]
    docService
      .retryEmbedding(docId, doc.kbId, (current, total, status) => {
        getWin()?.webContents.send('progress:doc-embedding', { docId, current, total, status })
      })
      .catch((e) => console.error('[embedding:retry] 失败:', e))
    return true
  })

  // ─── Assistants ────────────────────────────────────────
  ipcMain.handle('assistant:list', async () => assistantService.list())

  ipcMain.handle('assistant:get', async (_e, { id }) => assistantService.get(id))

  ipcMain.handle('assistant:create', async (_e, params) => assistantService.create(params))

  ipcMain.handle('assistant:update', async (_e, { id, updates }) =>
    assistantService.update(id, updates)
  )

  ipcMain.handle('assistant:delete', async (_e, { id }) => assistantService.delete(id))

  // ─── Chat Conversations ───────────────────────────────
  ipcMain.handle('conversation:list', async () => chatService.list())

  ipcMain.handle('conversation:create', async (_e, params) => chatService.create(params))

  ipcMain.handle('conversation:delete', async (_e, { id }) => chatService.delete(id))

  ipcMain.handle('conversation:rename', async (_e, { id, name }) => chatService.rename(id, name))

  ipcMain.handle('conversation:set-llm-preset', async (_e, { id, llmPresetId }) =>
    chatService.setLlmPreset(id, llmPresetId)
  )

  ipcMain.handle('conversation:set-assistant', async (_e, { id, assistantId }) =>
    chatService.setAssistant(id, assistantId)
  )

  ipcMain.handle('conversation:get', async (_e, { id }) => chatService.get(id))

  ipcMain.handle('conversation:send', async (_e, params) => {
    const win = BrowserWindow.getAllWindows()[0]
    try {
      const result = await chatService.sendMessage(params, {
        onDelta: (assistantMessageId, delta) => {
          win?.webContents.send('chat:stream-delta', { assistantMessageId, delta })
        },
        onReasoning: (assistantMessageId, delta) => {
          win?.webContents.send('chat:stream-reasoning', { assistantMessageId, delta })
        },
        onDone: (assistantMessageId, content, reasoning, createdAt, citations) => {
          win?.webContents.send('chat:stream-done', {
            assistantMessageId,
            content,
            reasoning,
            createdAt,
            citations
          })
        },
        onError: (assistantMessageId, error) => {
          win?.webContents.send('chat:error', { error, assistantMessageId })
        }
      })
      return result
    } catch (e: any) {
      win?.webContents.send('chat:error', { error: e.message || '请求失败' })
      throw e
    }
  })

  ipcMain.handle('conversation:messages', async (_e, { conversationId }) =>
    chatService.getMessages(conversationId)
  )

  ipcMain.handle('message:delete', async (_e, { messageId }) =>
    chatService.deleteMessage(messageId)
  )

  ipcMain.handle('message:edit', async (_e, { messageId, content, images }) => {
    const win = BrowserWindow.getAllWindows()[0]
    try {
      const result = await chatService.editUserMessage(
        messageId,
        content,
        {
          onDelta: (assistantMessageId, delta) => {
            win?.webContents.send('chat:stream-delta', { assistantMessageId, delta })
          },
          onReasoning: (assistantMessageId, delta) => {
            win?.webContents.send('chat:stream-reasoning', { assistantMessageId, delta })
          },
          onDone: (assistantMessageId, content2, reasoning, createdAt, citations) => {
            win?.webContents.send('chat:stream-done', {
              assistantMessageId,
              content: content2,
              reasoning,
              createdAt,
              citations
            })
          },
          onError: (assistantMessageId, error) => {
            win?.webContents.send('chat:error', { error, assistantMessageId })
          }
        },
        images
      )
      return result
    } catch (e: any) {
      win?.webContents.send('chat:error', { error: e.message || '请求失败' })
      throw e
    }
  })

  ipcMain.handle('message:update', async (_e, { messageId, content }) =>
    chatService.updateMessageContent(messageId, content)
  )

  ipcMain.handle('message:regenerate', async (_e, { assistantMessageId }) => {
    const win = BrowserWindow.getAllWindows()[0]
    try {
      const result = await chatService.regenerateAssistantMessage(assistantMessageId, {
        onDelta: (id, delta) => {
          win?.webContents.send('chat:stream-delta', { assistantMessageId: id, delta })
        },
        onReasoning: (id, delta) => {
          win?.webContents.send('chat:stream-reasoning', { assistantMessageId: id, delta })
        },
        onDone: (id, content, reasoning, createdAt, citations) => {
          win?.webContents.send('chat:stream-done', {
            assistantMessageId: id,
            content,
            reasoning,
            createdAt,
            citations
          })
        },
        onError: (id, error) => {
          win?.webContents.send('chat:error', { error, assistantMessageId: id })
        }
      })
      return result
    } catch (e: any) {
      win?.webContents.send('chat:error', { error: e.message || '请求失败' })
      throw e
    }
  })

  ipcMain.handle('chat:abort', async (_e, { assistantMessageId }) => ({
    aborted: chatService.abortStream(assistantMessageId)
  }))

  // ─── File Dialog ──────────────────────────────────────
  ipcMain.handle('dialog:open-file', async (_e, { filters }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
