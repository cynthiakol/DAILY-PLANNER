# Daily Planner (local-first, Windows)

Offline planner/calendar. No accounts, no cloud, no network. Built with Tauri 2 + React + TypeScript + SQLite.

## Architecture
- `src/lib.ts` – pure logic: dates (local `YYYY-MM-DD` strings, no timezone math), recurrence, templates, validation, CSV/ICS/JSON.
- `src/storage.ts` – persistence. Installed app: SQLite file `planner.db` in your app-data folder (via `tauri-plugin-sql`), saved on every change; the previous version is kept as a safety copy (`state_prev`). Browser/dev: `localStorage`.
- `src/App.tsx` – UI (dashboard, calendar month/week/day/agenda, activities, templates, history, settings).
- Recurring tasks are stored once and expanded per date; per-date completion is stored separately, so nothing duplicates. Templates are copied into new independent activities.
- Data is stored as one versioned JSON document inside SQLite (not relational tables) – simple and easy to back up.

## Build the installer (on Windows)
1. Install Node 20+, Rust (https://rustup.rs) and Visual Studio Build Tools ("Desktop development with C++"). WebView2 ships with Windows 10/11.
2. In this folder: `npm install` then `npm run tauri build`
3. Installer: `src-tauri/target/release/bundle/nsis/Daily Planner_1.0.0_x64-setup.exe` (also `.msi`). Run it; it installs per-user and adds a Start-menu entry. Right-click it → Pin to Start / Send to Desktop for a shortcut.
No Windows PC handy? Push this folder to GitHub and run the "Build Windows installer" workflow; download the artifact.

Development: `npm run tauri dev`. Tests: `npm test`.

## Tray icon and reminders
Closing the window hides Daily Planner to the system tray so reminders keep working. Right-click the tray icon > **Quit** to exit completely; left-click it to reopen. If you can't see the icon, click the ^ arrow in the taskbar and drag it onto the taskbar. Launching the app again just brings the existing window forward.
Time-blocked activities show a Windows notification at their start time (or 5-30 minutes before, see Settings > Reminders). Flexible tasks have no time, so no reminder. Reminders only fire while the app is running, and Windows Focus Assist / Do Not Disturb can silence them.

## Backup and restore
Settings → **Download JSON backup**. Restore with **Restore from backup…** (it asks before replacing everything; invalid files are rejected and change nothing). CSV and ICS (importable into Outlook/Google Calendar) exports are in the same card.
Your live data file is `planner.db` under `%APPDATA%\app.local.dailyplanner\`. Updating or reinstalling the app does not touch it; uninstalling may offer to delete it, so back up first.

## Troubleshooting
- *"Could not load your data"*: nothing was overwritten. Close the app, copy `planner.db`, then restore your latest JSON backup.
- Blank window on an old Windows 10: install the Microsoft Edge WebView2 Runtime.
- Backup download shows no dialog: check your Downloads folder.
- Build error about `link.exe`: install the C++ Build Tools.
