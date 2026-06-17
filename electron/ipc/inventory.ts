import { ipcMain } from 'electron'

export function registerInventoryHandlers() {
  ipcMain.handle('inventory:list', async () => [])
  ipcMain.handle('inventory:get', async () => null)
  ipcMain.handle('inventory:create', async () => ({}))
  ipcMain.handle('inventory:update', async () => ({}))
  ipcMain.handle('inventory:delete', async () => ({}))
}
