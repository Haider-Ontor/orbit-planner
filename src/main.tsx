import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import './styles.css';
import { removeOldSamples } from './lib/models';
import { ensurePersistentStorage, startAutoBackup } from './lib/backup';
import { startDriveSync } from './lib/driveSync';
import { initSync } from './lib/sync';
import { onLocalChange } from './lib/db';
import { startDesktopReminders, rescheduleAndroid } from './lib/notify';
import { calendarSoon } from './lib/gcal';

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

  // Google Calendar (Windows and Android): on start, every 10 minutes, and shortly after edits.
  calendarSoon(4000);
  setInterval(() => calendarSoon(0), 10 * 60_000);
  onLocalChange(() => calendarSoon(8000));
}
boot();
