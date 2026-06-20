import { ipcMain } from 'electron'
import { getAllSettings, setManySettings, setSetting, logActivity } from '../database/db.js'
import { assertAdmin } from './guard.js'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    return getAllSettings()
  })

  ipcMain.handle(
    'settings:save',
    async (_event, token: string, userId: number, settings: Record<string, string>) => {
      assertAdmin(token, userId)
      setManySettings(settings)
      logActivity(userId, 'update', 'settings', null, 'Updated company settings')
      return getAllSettings()
    }
  )

  ipcMain.handle('settings:logo:upload', async (_event, token: string, userId: number, base64Logo: string) => {
    assertAdmin(token, userId)
    setSetting('company_logo', base64Logo)
    logActivity(userId, 'update', 'settings', null, 'Uploaded company logo')
    return base64Logo
  })
}
