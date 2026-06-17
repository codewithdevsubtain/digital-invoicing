import { ipcMain } from 'electron'

export function registerProjectHandlers() {
  ipcMain.handle('projects:list', async () => [])
  ipcMain.handle('projects:get', async () => null)
  ipcMain.handle('projects:create', async () => ({}))
  ipcMain.handle('projects:update', async () => ({}))
  ipcMain.handle('projects:delete', async () => ({}))
}
