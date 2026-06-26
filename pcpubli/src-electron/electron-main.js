import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import https from 'https'

// needed in case process is undefined under Linux
const platform = process.platform || os.platform()

let mainWindow
let mediaDir

import { screen } from 'electron'

// Registrar protocolo custom ANTES de que la app esté lista
// Esto permite servir archivos locales al renderer via localmedia://nombre.mp4
protocol.registerSchemesAsPrivileged([
  { scheme: 'localmedia', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true } }
])

// Configurar inicio automático con Windows al compilar la app
if (app.isPackaged) {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe')
  })
}

function createWindow () {
  // Obtener pantallas
  const displays = screen.getAllDisplays()

  // Buscar una pantalla extendida (secundaria)
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0
  })

  let windowOptions = {
    icon: path.resolve(__dirname, 'icons/icon.png'), // tray icon
    useContentSize: true,
    frame: false,             // Sin barra de títulos ni bordes
    fullscreen: true,         // Pantalla completa
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD)
    }
  }

  // Si se detecta pantalla extendida, posicionar la ventana en ella
  if (externalDisplay) {
    windowOptions.x = externalDisplay.bounds.x
    windowOptions.y = externalDisplay.bounds.y
    windowOptions.width = externalDisplay.bounds.width
    windowOptions.height = externalDisplay.bounds.height
  }

  mainWindow = new BrowserWindow(windowOptions)

  mainWindow.loadURL(process.env.APP_URL)

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools()
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===== INICIALIZACIÓN =====
app.whenReady().then(() => {
  // Crear directorio de media local
  mediaDir = path.join(app.getPath('userData'), 'media')
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true })
  }

  // Registrar protocolo localmedia:// para servir archivos locales al renderer
  // Uso: <video src="localmedia://publicidad_xxx.mp4">
  protocol.handle('localmedia', (request) => {
    const fileName = decodeURIComponent(request.url.slice('localmedia://'.length))
    const filePath = path.join(mediaDir, fileName)
    // Convertir backslashes de Windows a forward slashes para file:// URL
    return net.fetch('file://' + filePath.replace(/\\/g, '/'))
  })

  // ===== IPC: DESCARGAR archivo de Google Drive al disco local =====
  ipcMain.handle('media:download', async (event, fileId, type) => {
    const ext = type === 'video' ? 'mp4' : 'jpg'
    const fileName = `publicidad_${fileId}.${ext}`
    const filePath = path.join(mediaDir, fileName)

    // Si ya existe, retornar inmediatamente
    if (fs.existsSync(filePath)) {
      return { success: true, fileName }
    }

    const url = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`

    return new Promise((resolve, reject) => {
      const downloadFile = (downloadUrl) => {
        https.get(downloadUrl, (response) => {
          // Seguir redirecciones (típico de Google Drive)
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            downloadFile(response.headers.location)
            return
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Error HTTP ${response.statusCode} al descargar de Drive`))
            return
          }

          const fileStream = fs.createWriteStream(filePath)
          response.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close(() => {
              console.log(`[Media] Descargado: ${fileName}`)
              resolve({ success: true, fileName })
            })
          })

          fileStream.on('error', (err) => {
            fs.unlink(filePath, () => {}) // Borrar archivo parcial
            reject(err)
          })
        }).on('error', (err) => {
          fs.unlink(filePath, () => {}) // Borrar archivo parcial
          reject(err)
        })
      }

      downloadFile(url)
    }).catch(error => {
      console.error(`[Media] Error descargando ${fileId}:`, error.message)
      return { success: false, error: error.message }
    })
  })

  // ===== IPC: VERIFICAR si un archivo existe localmente =====
  ipcMain.handle('media:exists', (event, fileId, type) => {
    const ext = type === 'video' ? 'mp4' : 'jpg'
    const fileName = `publicidad_${fileId}.${ext}`
    return fs.existsSync(path.join(mediaDir, fileName))
  })

  // ===== IPC: ELIMINAR un archivo local =====
  ipcMain.handle('media:delete', (event, fileId, type) => {
    const ext = type === 'video' ? 'mp4' : 'jpg'
    const fileName = `publicidad_${fileId}.${ext}`
    const filePath = path.join(mediaDir, fileName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`[Media] Eliminado: ${fileName}`)
      return true
    }
    return false
  })

  // ===== IPC: LIMPIAR archivos que ya no están en la playlist activa =====
  // Recibe un array de file_ids activos, borra todo lo demás del disco
  ipcMain.handle('media:cleanup', (event, activeFileIds) => {
    if (!fs.existsSync(mediaDir)) return []
    const files = fs.readdirSync(mediaDir)
    const deleted = []

    for (const file of files) {
      // Extraer fileId del nombre: publicidad_FILEID.ext
      const match = file.match(/^publicidad_(.+)\.(mp4|jpg)$/)
      if (match) {
        const fileId = match[1]
        if (!activeFileIds.includes(fileId)) {
          fs.unlinkSync(path.join(mediaDir, file))
          deleted.push(file)
          console.log(`[Media] Limpieza: eliminado ${file}`)
        }
      }
    }
    return deleted
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
