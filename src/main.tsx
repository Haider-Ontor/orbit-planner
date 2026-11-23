import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { removeOldSamples } from './lib/models';
import { ensurePersistentStorage, startAutoBackup } from './lib/backup';
import { startDriveSync } from './lib/driveSync';
import { initSync } from './lib/sync';
import { onLocalChange } from './lib/db';
import { startDesktopReminders, rescheduleAndroid } from './lib/notify';
import { syncCalendar, gcalAvailable } from './lib/gcal';

async function boot() {
  ensurePersistentStorage();
  try { await removeOldSamples(); } catch (e) { console.warn('sample cleanup failed', e); }
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

  initSync().catch((e) => console.warn('sync init failed', e));
  startDesktopReminders();
  startAutoBackup();
  startDriveSync();
  rescheduleAndroid();
  onLocalChange(() => rescheduleAndroid());

  // Google Calendar: on start, then every 10 minutes, plus shortly after task edits.
  if (gcalAvailable()) {
    const cal = () => syncCalendar().catch((e) => console.warn('calendar sync', e));
    setTimeout(cal, 4000);
    setInterval(cal, 10 * 60_000);
    let t: number | undefined;
    onLocalChange(() => { clearTimeout(t); t = window.setTimeout(cal, 8000); });
  }
}
boot();
