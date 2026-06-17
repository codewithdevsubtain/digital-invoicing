import { ipcMain } from 'electron'

export function registerHRHandlers() {
  ipcMain.handle('hr:list', async () => [])
  ipcMain.handle('hr:get', async () => null)
  ipcMain.handle('hr:create', async () => ({}))
  ipcMain.handle('hr:update', async () => ({}))
  ipcMain.handle('hr:delete', async () => ({}))
}
