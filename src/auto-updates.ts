import { app } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import { is } from 'electron-util'

import { viewLogs } from './logs'
import { createNotification } from './notifications'

const UPDATE_CHECK_INTERVAL = 60000 * 60 * 3 // 3 Hours

function onUpdateAvailable(): void {
  createNotification(
    'Update available',
    'Please restart to update to the latest version',
    {
      action: () => {
        app.relaunch()
        app.quit()
      },
      text: 'Restart'
    }
  )
}

export function init(): void {
  if (!is.development) {
    log.transports.file.level = 'info'
    autoUpdater.logger = log

    autoUpdater.on('update-downloaded', onUpdateAvailable)

    setInterval(() => autoUpdater.checkForUpdates, UPDATE_CHECK_INTERVAL)
    autoUpdater.checkForUpdates()
  }
}

export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    log.error('Check for updates failed', error)

    createNotification(
      'Check for updates failed',
      'View the logs for more information',
      {
        action: viewLogs,
        text: 'View Logs'
      }
    )
  }
}
