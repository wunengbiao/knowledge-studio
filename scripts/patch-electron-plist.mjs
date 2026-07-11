#!/usr/bin/env node
// Patches the bundled Electron.app (used by `electron-vite dev`) so dev mode
// shows "Knowledge Studio" with the project icon instead of "Electron":
//   1. CFBundleName / CFBundleDisplayName -> app name (menu bar, Dock, Cmd+Tab text)
//   2. Resources/electron.icns -> icon generated from resources/icon.png
//      (Dock-at-launch, Cmd+Tab icon, Finder). CFBundleIconFile already points
//      to electron.icns, so no plist key change is needed for the icon.
//
// Why this exists: macOS reads the bold menu-bar title and the bundle icon from
// the running app's Info.plist / Resources at launch time. Menu.setApplicationMenu,
// app.setName(), and app.dock.setIcon() cannot override the launch / Cmd+Tab icon
// (confirmed by Electron maintainers in electron/electron#19892). electron-builder
// sets these for packaged builds; this script does the equivalent for dev mode.
//
// Idempotent: no-ops once already patched. Re-run before every `npm run dev`
// (via the `predev` script in package.json) and after `npm install`.
import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const DESIRED_NAME = 'Knowledge Studio'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (process.platform !== 'darwin') {
  process.exit(0)
}

// require('electron') from Node.js returns the path to the Electron binary.
const electronBin = require('electron')
const appContents = resolve(dirname(electronBin), '..') // .../Electron.app/Contents
const plistPath = resolve(appContents, 'Info.plist')
const resourcesDir = resolve(appContents, 'Resources')

if (!existsSync(plistPath)) {
  console.warn('[patch-electron-plist] Info.plist not found, skipping')
  process.exit(0)
}

const readKey = (key) => {
  try {
    return execSync(`/usr/libexec/PlistBuddy -c "Print :${key}" "${plistPath}" 2>/dev/null`)
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// --- 1. App name (CFBundleName / CFBundleDisplayName) ---
const currentName = readKey('CFBundleName')
const currentDisplay = readKey('CFBundleDisplayName')
if (currentName !== DESIRED_NAME || currentDisplay !== DESIRED_NAME) {
  // Break any hardlinks (pnpm global store) before writing so we don't mutate
  // the shared store copy. Harmless no-op under npm.
  const original = readFileSync(plistPath)
  unlinkSync(plistPath)
  writeFileSync(plistPath, original)

  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName ${DESIRED_NAME}" "${plistPath}"`)
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${DESIRED_NAME}" "${plistPath}"`)
  console.log(`[patch-electron-plist] ${plistPath} -> CFBundleName=${DESIRED_NAME}`)
}

// --- 2. App icon (Resources/electron.icns) ---
// Generate an .icns from resources/icon.png (the SVG raster) via iconutil and
// install it over the default Electron icon. Cached under node_modules/.cache so
// it is only regenerated when the source PNG changes.
const pngSrc = resolve(root, 'resources', 'icon.png')
const cacheDir = resolve(root, 'node_modules', '.cache', 'rag-kb')
const cacheIcns = resolve(cacheDir, 'icon.dev.icns')
const installedIcns = resolve(resourcesDir, 'electron.icns')
const mtimeMs = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0)

if (!existsSync(pngSrc)) {
  console.warn('[patch-electron-plist] resources/icon.png not found, skipping icon')
} else {
  if (!existsSync(cacheIcns) || mtimeMs(cacheIcns) < mtimeMs(pngSrc)) {
    const iconset = join(tmpdir(), 'rag-kb-icon.iconset')
    rmSync(iconset, { recursive: true, force: true })
    mkdirSync(iconset, { recursive: true })
    // iconutil requires the conventional iconset members (base + @2x pairs).
    const specs = [
      [16, 'icon_16x16.png'],
      [32, 'icon_16x16@2x.png'],
      [32, 'icon_32x32.png'],
      [64, 'icon_32x32@2x.png'],
      [128, 'icon_128x128.png'],
      [256, 'icon_128x128@2x.png'],
      [256, 'icon_256x256.png'],
      [512, 'icon_256x256@2x.png'],
      [512, 'icon_512x512.png'],
      [1024, 'icon_512x512@2x.png']
    ]
    for (const [size, name] of specs) {
      execSync(`sips -z ${size} ${size} "${pngSrc}" --out "${join(iconset, name)}"`, {
        stdio: 'pipe'
      })
    }
    mkdirSync(cacheDir, { recursive: true })
    execSync(`iconutil -c icns "${iconset}" -o "${cacheIcns}"`, { stdio: 'pipe' })
    rmSync(iconset, { recursive: true, force: true })
    console.log(`[patch-electron-plist] generated ${cacheIcns} from ${pngSrc}`)
  }

  // Break hardlinks before overwriting (pnpm global store), then compare so we
  // only rewrite when the icon actually changed.
  const cached = readFileSync(cacheIcns)
  const installed = existsSync(installedIcns) ? readFileSync(installedIcns) : null
  if (!installed || !installed.equals(cached)) {
    if (existsSync(installedIcns)) unlinkSync(installedIcns)
    writeFileSync(installedIcns, cached)
    console.log(`[patch-electron-plist] ${installedIcns} -> project icon`)
  }
}
