import { app, BrowserWindow, ipcMain, protocol, net, Tray, Menu, powerSaveBlocker } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import https from 'https'
import { exec } from 'child_process'

// needed in case process is undefined under Linux
const platform = process.platform || os.platform()

let mainWindow
let mediaDir
let tray = null
let powerBlockerId = null
app.isQuitting = false

import { screen } from 'electron'

// Registrar protocolo custom ANTES de que la app esté lista
// Esto permite servir archivos locales al renderer via localmedia://nombre.mp4
protocol.registerSchemesAsPrivileged([
  { scheme: 'localmedia', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true } }
])

// Configurar inicio automático con Windows al compilar la app con argumento oculto
if (app.isPackaged) {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
    args: ['--hidden']
  })
}

function getIconPath () {
  if (app.isPackaged) {
    return platform === 'win32'
      ? path.resolve(__dirname, 'icons/icon.ico')
      : path.resolve(__dirname, 'icons/icon.png')
  } else {
    return platform === 'win32'
      ? path.join(process.cwd(), 'src-electron/icons/icon.ico')
      : path.join(process.cwd(), 'src-electron/icons/icon.png')
  }
}

function createWindow () {
  // Obtener pantallas
  const displays = screen.getAllDisplays()

  // Buscar una pantalla extendida (secundaria)
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0
  })

  const startMinimized = process.argv.includes('--hidden') || process.argv.includes('--minimized')

  let windowOptions = {
    icon: getIconPath(),
    useContentSize: true,
    frame: false,             // Sin barra de títulos ni bordes
    fullscreen: true,         // Pantalla completa
    autoHideMenuBar: true,
    show: !startMinimized,    // Iniciar oculto si arranca con Windows
    skipTaskbar: true,        // Ocultar siempre de la barra de tareas (solo visible en el tray)
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

  // Prevenir cierre de la app al cerrar la ventana, ocultándola en segundo plano (tray)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
    }
  })

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

  // ===== IPC: DESCARGAR archivo de Cloudflare R2 al disco local =====
  ipcMain.handle('media:download', async (event, fileId, type, r2Url) => {
    // fileId ahora es la ruta completa: 'publicidad/nombre.ext'
    // Usamos solo el nombre del archivo para guardarlo localmente
    const safeName = fileId.replace(/[\\/]/g, '_') // 'publicidad/foto.png' -> 'publicidad_foto.png'
    const fileName = safeName
    const filePath = path.join(mediaDir, fileName)

    // Si ya existe, retornar inmediatamente
    if (fs.existsSync(filePath)) {
      console.log(`[Media] Ya existe localmente: ${fileName}`)
      return { success: true, fileName }
    }

    // URL directa de R2: pasada desde el renderer o construida desde el file_id
    const downloadUrl = r2Url

    return new Promise((resolve, reject) => {
      https.get(downloadUrl, { rejectUnauthorized: false }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Seguir redirección si hubiera
          https.get(response.headers.location, { rejectUnauthorized: false }, (res2) => {
            const fileStream = fs.createWriteStream(filePath)
            res2.pipe(fileStream)
            fileStream.on('finish', () => fileStream.close(() => resolve({ success: true, fileName })))
            fileStream.on('error', (err) => { fs.unlink(filePath, () => {}); reject(err) })
          }).on('error', (err) => { fs.unlink(filePath, () => {}); reject(err) })
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Error HTTP ${response.statusCode} al descargar de R2: ${downloadUrl}`))
          return
        }

        const fileStream = fs.createWriteStream(filePath)
        response.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close(() => {
            console.log(`[Media] Descargado de R2: ${fileName}`)
            resolve({ success: true, fileName })
          })
        })

        fileStream.on('error', (err) => {
          fs.unlink(filePath, () => {})
          reject(err)
        })
      }).on('error', (err) => {
        fs.unlink(filePath, () => {})
        reject(err)
      })
    }).catch(error => {
      console.error(`[Media] Error descargando ${fileId}:`, error.message)
      return { success: false, error: error.message }
    })
  })

  // ===== IPC: VERIFICAR si un archivo existe localmente =====
  ipcMain.handle('media:exists', (event, fileId) => {
    const safeName = fileId.replace(/[\\/]/g, '_')
    return fs.existsSync(path.join(mediaDir, safeName))
  })

  // ===== IPC: ELIMINAR un archivo local =====
  ipcMain.handle('media:delete', (event, fileId) => {
    const safeName = fileId.replace(/[\\/]/g, '_')
    const filePath = path.join(mediaDir, safeName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`[Media] Eliminado: ${safeName}`)
      return true
    }
    return false
  })

  // ===== IPC: LIMPIAR archivos que ya no están en la playlist activa =====
  // Recibe un array de file_ids activos (rutas como 'publicidad/foto.png'), borra todo lo demás
  ipcMain.handle('media:cleanup', (event, activeFileIds) => {
    if (!fs.existsSync(mediaDir)) return []
    const files = fs.readdirSync(mediaDir)
    const deleted = []

    // Convertir los file_ids activos al formato de nombre local
    const activeFileNames = activeFileIds.map(id => id.replace(/[\\/]/g, '_'))

    for (const file of files) {
      if (!activeFileNames.includes(file)) {
        fs.unlinkSync(path.join(mediaDir, file))
        deleted.push(file)
        console.log(`[Media] Limpieza: eliminado ${file}`)
      }
    }
    return deleted
  })

  // ===== IPC: OBTENER ESPACIO EN DISCO =====
  ipcMain.handle('system:diskspace', () => {
    return new Promise((resolve) => {
      // Comando PowerShell para consultar espacio libre y total del disco C
      const cmd = 'powershell -Command "$d = Get-WmiObject Win32_LogicalDisk -Filter \\"DeviceID=\'C:\'\\"; [Math]::Round($d.FreeSpace/1GB, 2); [Math]::Round($d.Size/1GB, 2)"'
      exec(cmd, (err, stdout) => {
        if (err) {
          resolve({ free: 'Desconocido', total: 'Desconocido' })
          return
        }
        const lines = stdout.trim().split(/\r?\n/)
        if (lines.length >= 2) {
          resolve({ free: `${lines[0]} GB`, total: `${lines[1]} GB` })
        } else {
          resolve({ free: 'N/A', total: 'N/A' })
        }
      })
    })
  })

  // Evitar suspensión de pantalla mientras reproduzca publicidad
  try {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    console.log('[System] Power save blocker activado con ID:', powerBlockerId)
  } catch (e) {
    console.error('[System] No se pudo activar powerSaveBlocker:', e.message)
  }

  createTray()
  createWindow()
})

function createTray () {
  const iconPath = getIconPath()
  tray = new Tray(iconPath)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar Reproductor',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
        }
      }
    },
    {
      label: 'Ocultar en Segundo Plano',
      click: () => {
        if (mainWindow) {
          mainWindow.hide()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Salir de la Aplicación',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Santidad TV - PC Publicidad')
  tray.setContextMenu(contextMenu)

  // Doble click para restaurar
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
    }
  })
}

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
