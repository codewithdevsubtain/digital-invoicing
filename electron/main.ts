import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDatabase, getDb } from './database/db.js'
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
import { registerExpenseHandlers } from './ipc/expenses.js'
import { registerCashBankHandlers } from './ipc/cashbank.js'

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

  // Update title with company name
  try {
    const setting = getDb().prepare("SELECT value FROM settings WHERE key = 'company_name'").get() as { value: string } | undefined
    if (setting?.value) mainWindow.setTitle(`HVAC ERP - ${setting.value}`)
  } catch { /* ignore */ }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Backup / Restore handlers
function registerBackupHandlers() {
  ipcMain.handle('app:backup', async () => {
    const dbPath = path.join(app.getPath('userData'), 'database', 'hvac-erp.db')
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Backup Database',
      defaultPath: path.join(app.getPath('desktop'), `hvac_erp_backup_${new Date().toISOString().split('T')[0]}.db`),
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return { success: false }
    try {
      fs.copyFileSync(dbPath, result.filePath)
      return { success: true, path: result.filePath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:restore', async (_event, confirmed: boolean) => {
    if (!confirmed) return { success: false, error: 'Please confirm' }
    const dbPath = path.join(app.getPath('userData'), 'database', 'hvac-erp.db')
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Restore Database',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths?.[0]) return { success: false }
    try {
      // Close current connection and replace file
      getDb().close()
      fs.copyFileSync(result.filePaths[0], dbPath)
      app.relaunch()
      app.quit()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:settingsPath', async () => {
    const backupsDir = path.join(app.getPath('userData'), 'backups')
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
    return { userData: app.getPath('userData'), backups: backupsDir, version: app.getVersion() }
  })
}

// Application Menu
function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About HVAC ERP',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About HVAC ERP',
              message: 'HVAC ERP',
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode.js: ${process.versions.node}\n\nOffline Desktop ERP for HVAC Contracting Businesses.\n\nAll data is stored locally on this machine.`,
            })
          },
        },
      ],
    },
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
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
    registerExpenseHandlers()
    registerCashBankHandlers()
    registerBackupHandlers()
    createMenu()
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
