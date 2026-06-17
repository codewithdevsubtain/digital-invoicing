import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDatabase } from './database/db.js'
import { registerAuthHandlers } from './ipc/auth.js'
import { registerUserHandlers } from './ipc/users.js'
import { registerSettingsHandlers } from './ipc/settings.js'
import { registerVendorHandlers } from './ipc/vendors.js'
import { registerCustomerHandlers } from './ipc/customers.js'
import { registerInventoryHandlers } from './ipc/inventory.js'
import { registerProjectHandlers } from './ipc/projects.js'
import { registerInvoiceHandlers } from './ipc/invoices.js'
import { registerAccountingHandlers } from './ipc/accounting.js'
import { registerHRHandlers } from './ipc/hr.js'
import { registerReportHandlers } from './ipc/reports.js'
import { registerPurchaseHandlers } from './ipc/purchases.js'
import { registerFabricationHandlers } from './ipc/fabrication.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const iconPath = path.join(__dirname, '../build/icon.png')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'HVAC ERP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    await initDatabase()
    registerAuthHandlers()
    registerUserHandlers()
    registerSettingsHandlers()
    registerVendorHandlers()
    registerCustomerHandlers()
    registerInventoryHandlers()
    registerProjectHandlers()
    registerInvoiceHandlers()
    registerAccountingHandlers()
    registerHRHandlers()
    registerReportHandlers()
    registerPurchaseHandlers()
    registerFabricationHandlers()
    createWindow()
  } catch (err) {
    console.error('Failed to initialize app:', err)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
