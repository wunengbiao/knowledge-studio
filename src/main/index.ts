import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, docService } from './ipc-handlers'

async function backfillPendingEmbeddings(): Promise<void> {
  try {
    const docIds = docService.getPendingChunkDocIds()
    if (docIds.length === 0) return
    console.log(`[backfill] 发现 ${docIds.length} 个文档待补算 embedding`)

    const win = BrowserWindow.getAllWindows()[0]
    let processed = 0
    for (const docId of docIds) {
      const doc = docService.get(docId)
      if (!doc) {
        processed++
        continue
      }
      win?.webContents.send('progress:backfill', {
        current: processed,
        total: docIds.length,
        status: `正在补算 ${doc.title} (${processed + 1}/${docIds.length})`
      })
      try {
        await docService.processEmbeddings(docId, doc.kbId, (cur, total, status) => {
          win?.webContents.send('progress:doc-embedding', { docId, current: cur, total, status })
        })
      } catch (e) {
        console.error(`[backfill] 文档 ${docId} 补算失败:`, e)
      }
      processed++
    }
    win?.webContents.send('progress:backfill', {
      current: docIds.length,
      total: docIds.length,
      status: '补算完成'
    })
  } catch (e) {
    console.error('[backfill] 启动补算失败:', e)
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.rag.knowledge-base')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  setTimeout(() => {
    backfillPendingEmbeddings().catch((e) => console.error('[backfill] 失败:', e))
  }, 3000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
