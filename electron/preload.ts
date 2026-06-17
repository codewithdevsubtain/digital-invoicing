import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    const allowedChannels = [
      'auth:login',
      'auth:getCurrentUser',
      'auth:logout',
      'auth:changePassword',
      'users:list',
      'users:get',
      'users:create',
      'users:update',
      'users:deactivate',
      'users:resetPassword',
      'activityLog:list',
      'vendors:list',
      'vendors:get',
      'vendors:create',
      'vendors:update',
      'vendors:toggleActive',
      'vendors:ledger',
      'vendors:balance',
      'vendors:summary',
      'customers:list',
      'customers:get',
      'customers:create',
      'customers:update',
      'customers:toggleActive',
      'customers:ledger',
      'customers:balance',
      'customers:summary',
      'customers:projects',
      'settings:get',
      'settings:save',
      'settings:logo:upload',
      'inventory:list',
      'inventory:get',
      'inventory:create',
      'inventory:update',
      'inventory:delete',
      'projects:list',
      'projects:get',
      'projects:create',
      'projects:update',
      'projects:delete',
      'invoices:list',
      'invoices:get',
      'invoices:create',
      'invoices:update',
      'invoices:delete',
      'accounting:list',
      'accounting:get',
      'accounting:create',
      'accounting:update',
      'accounting:delete',
      'hr:list',
      'hr:get',
      'hr:create',
      'hr:update',
      'hr:delete',
      'reports:run',
    ]
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`Unauthorized IPC channel: ${channel}`)
  },
})

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}
