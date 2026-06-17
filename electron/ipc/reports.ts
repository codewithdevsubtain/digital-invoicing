import { ipcMain } from 'electron'

export function registerReportHandlers() {
  ipcMain.handle('reports:run', async () => ({}))
}
