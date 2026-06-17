import { ipcMain } from 'electron'
import { getAllSettings, setManySettings, setSetting, logActivity } from '../database/db.js'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    return getAllSettings()
  })

  ipcMain.handle(
    'settings:save',
    async (_event, userId: number, settings: Record<string, string>) => {
      setManySettings(settings)
      logActivity(userId, 'update', 'settings', null, 'Updated company settings')
      return getAllSettings()
    }
  )

  ipcMain.handle('settings:logo:upload', async (_event, userId: number, base64Logo: string) => {
    setSetting('company_logo', base64Logo)
    logActivity(userId, 'update', 'settings', null, 'Uploaded company logo')
    return base64Logo
  })
}
