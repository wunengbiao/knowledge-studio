/*
 * Rasterize resources/icon.svg to a 1024x1024 transparent PNG (resources/icon.png)
 * using the project's own Electron (Chromium) for SVG rendering. No external deps.
 *
 * Run:  ./node_modules/.bin/electron scripts/rasterize-logo.cjs
 */
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')

function rasterize(svgText, size, outPath) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: size,
      height: size,
      x: 0,
      y: 0,
      show: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      enableLargerThanScreen: true,
      webPreferences: { sandbox: false, offscreen: false }
    })
    const sized = svgText.replace(/<svg /, `<svg width="${size}" height="${size}" `)
    const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style></head><body>${sized}</body></html>`
    win.webContents.on('did-finish-load', async () => {
      try {
        // Give Chromium a paint tick to flush the SVG rasterization.
        await new Promise((r) => setTimeout(r, 500))
        // Explicit rect so capturePage returns the full square (transparent
        // windows otherwise return the non-transparent bounding box on macOS).
        const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
        writeFileSync(outPath, img.toPNG())
        win.destroy()
        resolve()
      } catch (err) {
        reject(err)
      }
    })
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch(reject)
  })
}

app.whenReady().then(async () => {
  try {
    const svg = readFileSync(join(root, 'resources', 'icon.svg'), 'utf8')
    mkdirSync(join(root, 'resources'), { recursive: true })
    await rasterize(svg, 1024, join(root, 'resources', 'icon.png'))
    console.log('[rasterize] wrote resources/icon.png (1024x1024)')
    app.quit()
  } catch (err) {
    console.error('[rasterize] failed:', err)
    app.exit(1)
  }
})
