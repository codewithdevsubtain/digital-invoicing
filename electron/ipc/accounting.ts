import { ipcMain } from 'electron'

export function registerAccountingHandlers() {
  ipcMain.handle('accounting:list', async () => [])
  ipcMain.handle('accounting:get', async () => null)
  ipcMain.handle('accounting:create', async () => ({}))
  ipcMain.handle('accounting:update', async () => ({}))
  ipcMain.handle('accounting:delete', async () => ({}))
}
