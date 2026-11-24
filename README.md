# Orbit

Personal planner for study, projects and daily life. Windows app (.exe) and Android app (.apk) built from one codebase and synced through the cloud.

## Download & install

| | Download | Install |
|---|---|---|
| **Windows 10 / 11** | [**Orbit-Setup.exe**](https://github.com/Haider-Ontor/orbit-planner/releases/latest/download/Orbit-Setup.exe) (~120 MB) | Double-click it. Orbit installs and opens on its own. No questions, no admin rights needed. |
| **Android 7+** | [**Orbit.apk**](https://github.com/Haider-Ontor/orbit-planner/releases/latest/download/Orbit.apk) (~13 MB) | Open the downloaded file on the phone and tap **Install**. |

All versions: [Releases page](https://github.com/Haider-Ontor/orbit-planner/releases). Orbit starts empty; nothing is pre-filled.

### Windows: step by step
1. Download **Orbit-Setup.exe** and double-click it.
2. If Windows shows **"Windows protected your PC"**: click **More info → Run anyway**. (The app is not code-signed, so SmartScreen warns about any new exe.)
3. Orbit installs into your user folder, puts a shortcut on the Desktop and in the Start menu, and opens.
4. To update later: **Settings → Updates → Check for updates → Update**. Orbit downloads the new version, installs it and reopens. (Or download the new **Orbit-Setup.exe** and run it.) Your tasks, goals and notes are kept.
5. To remove: **Settings → Apps → Installed apps → Orbit → Uninstall**. Your data is kept unless you delete `%APPDATA%\Orbit`.

Closing the window keeps Orbit in the system tray (bottom-right, next to the clock) so reminders still arrive. Right-click the tray icon → **Quit** to exit fully.

### Android: step by step
1. On the phone, open the **Orbit.apk** link (or copy the file over by USB / Google Drive / WhatsApp to yourself).
2. Tap the downloaded file. If Android says installing unknown apps is blocked, tap **Settings**, turn on **Allow from this source** for your browser or file manager, then go back.
3. Tap **Install**, then **Open**.
4. If Google Play Protect asks about an unrecognised app, choose **Install anyway**. It is not on the Play Store, so Play Protect checks it.
5. Allow **notifications** (reminders) and **microphone** (voice notes) when Orbit asks.
6. To update later: **Settings → Updates → Check for updates → Update**, then tap **Install**. The first time, Android asks you to allow Orbit to install apps: turn it on and tap Update again. (Or install the new **Orbit.apk** over the old one.) Your data is kept.

### First run
Everything works offline straight away. To keep the phone and the PC in sync (and backed up), connect **Google Drive** on both (see [Google Drive: sync and backup](#2-google-drive-sync-and-backup-phone--computer)). AI features are optional (Settings → AI helper).

---

| Screen | What it does |
|---|---|
| **Today** | A dashboard: gauges for today, this week's goals and repeating tasks, a live clock and status light, a 14-day "finished" trace, then *Do next*, **Deadlines coming up** (goal and project steps in time order with a live countdown, e.g. *Tomorrow · 9am · in 15 h*), repeating tasks, goals and *Done today*. Tap **+** (or *Add a task*) to add anything. |
| **Goals** | **New goal** walks you through it: what you want, what kind of goal it is (finish something → SMART; habit or number → Minimum / Target / Outrageous; or both), the criteria, then **Start** and **Finish by**, each as a **Week**, a **Month** or an exact **Date** (the finish date can have a time, e.g. *Sun 29 Nov · 11:59pm*), top priority or normal, and the steps. Each step is either done **on certain days** or **by a deadline** (day + optional time). Use **‹ ›** on a goal to move it a week (or a month) later as often as needed (it stays open in between), or earlier but never into the past; an exact deadline keeps its weekday and time. Shows past-due goals, coming up, and recently achieved. |
| **Priorities** | **Urgent** (red) → **Important** (yellow) → **Not urgent** (green) → **Not important** (sky blue), top to bottom. Each task has one **Move ▾** menu (on a computer you can also drag the ⋮⋮ handle). Empty sections fold away. Deadlines move tasks up on their own. |
| **All tasks** | Search, filter by project/quadrant, sort by priority or deadline |
| **Repeating tasks** | Things you do every day or on chosen days (e.g. water the plants on Mon and Thu). Add them from **+** → *Some days*. 7-day tick grid, streaks, 30-day rate. |
| **Projects** | Its own tab. Each project is a list of tasks, each with sub-tasks that have deadlines (a day, and a time if it matters). Tick things off, see progress, **Sort by deadline**, and switch to a **Timeline** view. Built for the phone. Upcoming and overdue steps also appear on **Today**. |
| **Deadlines** | Every deadline uses the same picker: tap a day (the rest of the week, or *Other date*), then a time (*9 am, 12 pm, 2 pm, 5 pm, 9 pm, 11:59 pm*, *Other time*, or *Any time that day* = end of day). It shows the time left and turns orange, then red, as it gets close or passes. |
| **Explanations** | Hover over any tile, button or chip (or long-press it on the phone) to see what it does. |
| **Done & history** | Everything you finished, day by day: to-dos, plan steps, routines and goals, with a bar chart for the week. Each item has **Reopen** in case it was ticked by mistake. **Recently deleted** keeps deleted items for 30 days with **Restore**. |
| **Undo** | Ticking, unticking, deleting, moving or archiving shows an **Undo** button for 10 seconds. Finished items never vanish: they stay under **Done today** on Today and in Done & history. |
| **Backups** | Saved instantly on the device, plus an automatic daily copy inside the app (last 14 days, Settings → Your data & backups → Restore). On Windows the same copy is also written to `Documents\Orbit Backups` (last 30 days). |
| **Themes** | Settings → Theme: Automatic, Ivory, Graphite, Paper, Sage or Circuit. |
| **Updates** | **Settings → Updates** checks GitHub for a newer version and installs it, on Windows and Android. |
| **Notes & voice** | Text notes and voice notes (speech → text). With AI connected, *Organise into tasks* turns a note into tasks. |
| **Calendar** | Google Calendar events + timed tasks + deadlines + repeating tasks for the next 7/14/30 days |
| **Paste & extract (AI)** | Hidden until an AI service is connected in Settings. Paste an email or message; the AI extracts tasks, deadlines, times, links and a checklist of what you need. You review before anything is added. |

Quick-add syntax: `Submit form fri 5pm !!` → due Friday 17:00, high impact + critical. `!` = important, `!!` = important and critical. Understands `today`, `tomorrow`, weekday names, `in 3 days`, `12/3` (day/month), `2026-12-03`, `5pm`, `17:30`.

Keyboard (desktop): `N` new task · `/` smart capture.

---

## Setup inside the app (Settings)

### 1. AI helper (optional)
Orbit works fully without AI. To turn on *Paste & extract*, *Organise note* and *Suggest steps*, open **Settings → AI helper** and connect one service:
- **Claude:** paste an API key from console.anthropic.com → API keys (default model Claude Opus 5.5; Sonnet 5.5 / Haiku 5.5 are cheaper). If the model declines a request, the API retries it on a fallback model automatically.
- **Other service:** any OpenAI-compatible API. Tap a preset (OpenAI, Google Gemini, Groq, OpenRouter, or Ollama on your own PC), paste its key and a model name. Gemini, Groq and OpenRouter offer free tiers; Ollama is free and runs offline.

Press **Test connection**. Keys stay on that device. There is no keyless public AI service that is reliable enough to build on, so a (free) key is needed.

### 2. Google Drive: sync and backup (phone ↔ computer)
Orbit keeps everything in a folder called **Orbit** in your own Google Drive:
`orbit-data.json` (the shared copy every device merges with) and one `orbit-backup-YYYY-MM-DD.json` per day (last 14 kept).
Orbit can only see the files it creates there (Google's `drive.file` permission), not the rest of your Drive.

**How sync works:** each sync downloads the shared copy, keeps the newer version of every item on both sides, and uploads the result if this device had something newer. It runs on start, 15 seconds after an edit, every 5 minutes, and when you switch back to the app. Two devices editing at the same time don't lose each other's changes. Deleted items are remembered for 90 days so deletions reach every device.

**One-time setup (about 5 minutes, done once by whoever builds the app):**
1. Open [console.cloud.google.com](https://console.cloud.google.com/projectcreate) and create a project called **Orbit**.
2. **APIs & Services → Library:** enable **Google Drive API** (and **Google Calendar API** if you want calendar sync).
3. **OAuth consent screen:** choose **External**, fill in the app name and your email, and add every Google account that will use Orbit under **Test users**. (Drive access with `drive.file` is a non-sensitive permission, so you can also press **Publish app** without Google's review.)
4. **Credentials → Create credentials → OAuth client ID → Desktop app.** Paste the client ID and secret into Orbit on Windows: **Settings → Google Drive → One-time Google setup**.
   To build them into the installer so nobody has to paste anything, set `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_SECRET` before `npm run dist:all` (a desktop client's "secret" is not secret for installed apps; Google expects it to ship in the app).
5. **For the phone:** **Create credentials → OAuth client ID → Android**, package name `com.orbit.planner`, SHA-1 `D7:AB:96:D3:23:A1:F0:7A:2F:7D:89:AD:07:41:8F:A7:7F:8E:6E:27` (the certificate the released APKs are signed with). Nothing is typed on the phone.

**Then on each device:** Settings → Google Drive → **Connect Google Drive**, using the **same Google account** everywhere. Windows opens your browser to sign in; Android shows the normal Google account picker.

**Restore:** Settings → Google Drive → **Restore from Drive…** lists the daily backups.

### 3. Google Calendar
Uses the same Google connection as Drive (the one-time setup above also enables the **Google Calendar API**). On Windows and Android:
- every task with a date goes to your Google Calendar: a timed event if it has a time, an all-day event otherwise, coloured by priority (red Urgent, yellow Important, green Not urgent, blue Not important);
- every goal and project step with a deadline, and every goal with a finish date or month, becomes a "Due: …" event ending at the deadline time (all-day without a time);
- every repeating task becomes a recurring event on its days;
- finished tasks keep their event with a ✓; deleted tasks remove it;
- your own calendar events show up in Today and Calendar.

Event ids are derived from Orbit's ids, so the phone and the PC never create duplicates. Both switches are in **Settings → Google**.

**If sign-in says it was cancelled or blocked**, Orbit now shows the exact reason under the button. On Android this almost always means the **Android OAuth client** (package `com.orbit.planner`, SHA-1 above) is missing from the Google Cloud project, or your Gmail is not listed under **Test users**.

### 4. Voice notes
- **Windows:** records audio, then transcribes on your PC with Whisper (no cloud, no key). The model downloads once (base ≈ 80 MB). Pick tiny/base/small and the language in Settings.
- **Android:** uses the phone's speech recogniser with live text (set the language, e.g. Bangla, in Settings).

### 5. Reminders
Notifications before timed tasks, routines and goal/project deadlines that have a time, plus a morning digest: what's due today, what's due tomorrow, and your top three tasks. On Windows, Orbit keeps running in the tray when you close the window (enable "Start Orbit when Windows starts" in Settings). On Android, reminders are scheduled with the OS for the next 7 days and fire even when the app is closed.

---

## Build from source

You only need this to change the app. To just use it, download from [Releases](https://github.com/Haider-Ontor/orbit-planner/releases).

```powershell
npm install
npm run electron:dev      # desktop app with hot reload
npm run dist:win          # → release\Orbit-Setup.exe   (one-click installer)
npm run android:apk       # → release\Orbit.apk         (needs the Android SDK, below)
npm run dist:all          # both
```

Before publishing a new release, bump `version` in `package.json` and `versionCode` / `versionName` in `android/app/build.gradle`. Android refuses an update whose `versionCode` is not higher. Then attach `release\Orbit-Setup.exe` and `release\Orbit.apk` to a new GitHub release with exactly those names, so the download links above keep pointing at the newest version:

```powershell
gh release create v0.2.1 release\Orbit-Setup.exe release\Orbit.apk --title "Orbit 0.2.1"
```

### Android SDK (once, for the APK)

Either install **Android Studio** (it installs the SDK to `%LOCALAPPDATA%\Android\Sdk`), or only the command-line tools:

1. Download "Command line tools only" for Windows from developer.android.com/studio and unzip to `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`.
2. In PowerShell:
   ```powershell
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   & "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
   & "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
   ```
3. Create `android\local.properties` containing `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`, then `npm run android:apk`.

The APK is signed with this PC's Android debug key (`%USERPROFILE%\.android\debug.keystore`). An APK built on another PC has a different key, so it can only be installed after uninstalling the old one (which deletes the phone's local data; sync first). Keep that keystore file if you change PCs.

---

## Code map

```
electron/main.cjs        desktop shell: orbit:// protocol, tray, mic permission, Google OAuth (loopback + PKCE)
src/lib/db.ts            local database (IndexedDB / Dexie); every record is offline-first
src/lib/driveSync.ts     Google Drive sync + daily Drive backups (merge in src/lib/merge.ts)
src/lib/google.ts        Google sign-in for Drive (desktop loopback / Android Play Services)
src/lib/sync.ts          (legacy) Supabase sync, no longer shown in the app
src/lib/priority.ts      quadrants, deadline-driven urgency, "do next" score
src/lib/ai.ts            Claude structured extraction (tasks, deadlines, requirements)
src/lib/gcal.ts          Google Calendar two-way sync
src/lib/voice.ts         Android speech recogniser / desktop Whisper worker
src/lib/notify.ts        reminders (OS notifications on Android, tray app on Windows)
src/components/Plan.tsx  project / goal plans: tasks → sub-tasks, list + timeline
src/components/DeadlinePicker.tsx  the one day + time picker used for every deadline
src/lib/deadline.ts      deadline moments, countdowns ("in 3 h"), labels
src/lib/update.ts        in-app update check and install (GitHub Releases)
android/app/src/main/java/com/orbit/planner/ApkUpdaterPlugin.java   downloads the APK and opens the Android installer
supabase/schema.sql      (legacy) Supabase table for the old sync option
```
