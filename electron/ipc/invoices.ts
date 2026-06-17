import { ipcMain } from 'electron'

export function registerInvoiceHandlers() {
  ipcMain.handle('invoices:list', async () => [])
  ipcMain.handle('invoices:get', async () => null)
  ipcMain.handle('invoices:create', async () => ({}))
  ipcMain.handle('invoices:update', async () => ({}))
  ipcMain.handle('invoices:delete', async () => ({}))
}
