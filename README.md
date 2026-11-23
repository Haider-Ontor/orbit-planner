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
Everything works offline straight away. To link the phone and the PC, turn on cloud sync on both (see [Setup inside the app](#setup-inside-the-app-settings)). To use smart capture and AI goal planning, add a Claude API key.

---

| Screen | What it does |
|---|---|
| **Today** | "Do next" ranked by impact, urgency and deadline · overdue · due today · routines · calendar · 7-day lookahead · quick add |
| **Weekly goals** | "This week I will…" goals for each week. Break a goal into steps (tasks → sub-tasks with deadlines), yourself or planned by Claude; the goal's progress follows its steps. Unfinished goals stay open and can be carried into the next week. Last-8-weeks history bar. |
| **Priority matrix** | The four quadrants (First / Second / Third priority / Eliminate). Drag tasks between them. Deadlines push tasks toward *Critical* automatically. |
| **All tasks** | Search, filter by project/quadrant, sort by priority or deadline |
| **Routines** | Daily / weekday / weekly / every-N-days habits with a 7-day check grid, streaks and 30-day completion rate |
| **Projects & learning** | Each project is a list of tasks, each with sub-tasks that have deadlines. Tick things off, see progress, and switch to a **Timeline** view (bars per task, a marker for every sub-task deadline, a today line). Built for the phone: big tap targets and the phone's own date picker. Upcoming and overdue steps also appear on **Today**. |
| **Done & history** | Everything you finished, day by day: to-dos, plan steps, routines and goals, with a bar chart for the week. Each item has **Reopen** in case it was ticked by mistake. **Recently deleted** keeps deleted items for 30 days with **Restore**. |
| **Undo** | Ticking, unticking, deleting, moving or archiving shows an **Undo** button for 10 seconds. Finished items never vanish: they stay under **Done today** on Today and in Done & history. |
| **Backups** | Saved instantly on the device, plus an automatic daily copy inside the app (last 14 days, Settings → Your data & backups → Restore). On Windows the same copy is also written to `Documents\Orbit Backups` (last 30 days). |
| **Updates** | **Settings → Updates** checks GitHub for a newer version and installs it, on Windows and Android. |
| **Notes & voice** | Text notes and voice notes (speech → text). "Organise into tasks" turns a note into tasks with Claude. |
| **Agenda** | Google Calendar events + timed tasks + deadlines + routines for the next 7/14/30 days |
| **Smart capture** | Paste an email or message; Claude extracts tasks, deadlines, times, links and a checklist of what you need (documents, fees, signatures). You review before anything is added. |

Quick-add syntax: `Submit form fri 5pm !!` → due Friday 17:00, high impact + critical. `!` = important, `!!` = important and critical. Understands `today`, `tomorrow`, weekday names, `in 3 days`, `12/3` (day/month), `2026-12-03`, `5pm`, `17:30`.

Keyboard (desktop): `N` new task · `/` smart capture.

---

## Setup inside the app (Settings)

### 1. Claude (smart capture, organising notes)
Create an API key at console.anthropic.com → API keys and paste it in **Settings → AI**. Default model: Claude Opus 5.5; Sonnet 5.5 / Haiku 5.5 are cheaper. The key is stored only on that device and calls go straight from the app to the Claude API. If the model declines a request, the API retries it on a fallback model automatically.

### 2. Cloud sync (desktop ↔ phone)
1. Create a free project at supabase.com.
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Project Settings → API: copy the **Project URL** and the **anon public** key.
4. In Orbit on **both** devices: Settings → Cloud sync → paste both → Connect → create an account on one device and sign in with the same email/password on the other.
   (If email confirmation is on in Supabase → Authentication → Providers → Email, confirm the email once, or switch "Confirm email" off for a personal project.)

Sync is offline-first: everything works without internet and pushes when back online. Conflicts resolve last-write-wins per record. Voice-note audio stays on the device that recorded it; the transcript syncs.

### 3. Google Calendar (from the Windows app)
1. console.cloud.google.com → new project → **APIs & Services → Library** → enable **Google Calendar API**.
2. **OAuth consent screen** → External → add your Gmail as a *test user*.
3. **Credentials → Create credentials → OAuth client ID → Application type: Desktop app**. Copy the client ID and secret.
4. Orbit (Windows) → Settings → Google Calendar → paste both → **Connect Google Calendar** → approve in the browser.

Then: tasks with a time (a due date + time, or a scheduled start) appear in Google Calendar, with their checklist in the description. Your calendar events appear in Today and Agenda. Both directions run every 10 minutes and shortly after edits. Events reach the phone through cloud sync.

### 4. Voice notes
- **Windows:** records audio, then transcribes on your PC with Whisper (no cloud, no key). The model downloads once (base ≈ 80 MB). Pick tiny/base/small and the language in Settings.
- **Android:** uses the phone's speech recogniser with live text (set the language, e.g. Bangla, in Settings).

### 5. Reminders
Notifications before timed tasks and routines, plus a morning digest of your top three tasks. On Windows, Orbit keeps running in the tray when you close the window (enable "Start Orbit when Windows starts" in Settings). On Android, reminders are scheduled with the OS for the next 7 days and fire even when the app is closed.

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
src/lib/sync.ts          Supabase push/pull + realtime
src/lib/priority.ts      quadrants, deadline-driven urgency, "do next" score
src/lib/ai.ts            Claude structured extraction (tasks, deadlines, requirements)
src/lib/gcal.ts          Google Calendar two-way sync
src/lib/voice.ts         Android speech recogniser / desktop Whisper worker
src/lib/notify.ts        reminders (OS notifications on Android, tray app on Windows)
src/components/Plan.tsx  project / goal plans: tasks → sub-tasks, list + timeline
src/lib/update.ts        in-app update check and install (GitHub Releases)
android/app/src/main/java/com/orbit/planner/ApkUpdaterPlugin.java   downloads the APK and opens the Android installer
supabase/schema.sql      cloud table + row-level security
```
