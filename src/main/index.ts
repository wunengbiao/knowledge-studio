import { app, BrowserWindow, Menu, ipcMain, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import './bootstrap-paths'
import { registerIpcHandlers, docService } from './ipc-handlers'

const APP_DISPLAY_NAME = 'Knowledge Studio'

// App icon (PNG rasterized from resources/icon.svg via scripts/rasterize-logo.cjs).
// Only needed in dev: packaged builds get their dock/taskbar icon from the
// .icns/.ico that electron-builder generates from this same PNG. macOS ignores
// BrowserWindow.icon, so the dock icon is set explicitly there.
const devIconPath = is.dev ? join(__dirname, '../../resources/icon.png') : null

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
    trafficLightPosition: { x: 16, y: 12 },
    ...(devIconPath ? { icon: devIconPath } : {}),
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
  electronApp.setAppUserModelId('pub.torch.knowledge-studio')

  // Show the custom icon in the macOS dock during dev (packaged builds pick it
  // up from the .icns in the app bundle). BrowserWindow.icon covers Win/Linux.
  if (process.platform === 'darwin' && devIconPath) {
    app.dock?.setIcon(devIconPath)
  }

  app.setAboutPanelOptions({
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion(),
    copyright: 'MIT License'
  })

  // Custom app menu. On macOS the bold menu-bar title itself comes from
  // CFBundleName (patched in dev by scripts/patch-electron-plist.mjs, set by
  // electron-builder in production) and CANNOT be overridden by this label -
  // but the submenu items (About/Services/Hide/Quit with Chinese labels) are
  // still applied here.
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_DISPLAY_NAME,
      submenu: [
        { role: 'about', label: `关于 ${APP_DISPLAY_NAME}` },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${APP_DISPLAY_NAME}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${APP_DISPLAY_NAME}` }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

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
