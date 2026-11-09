# ADB Controller by Samsad for VS Code 🚀

Fast, 100% offline 1-click ADB controls for Android physical devices and emulators inside Visual Studio Code.

---

## ✨ Features & How to Use

### 📱 1. Connected Device & Package Selection
- **Device Selector**: Automatically scans all connected physical devices and emulators. Click **🔄** to rescan.
- **Auto Detect Package**: Scans your workspace files for Android package name / `applicationId`.
- **Package Selector**: Pick from installed debuggable packages on the device or type manually.

### 🕹️ 2. Virtual Hardware Navigation Bar
Compact button strip with tooltips:
- **◀ Back** (`KEYCODE_BACK`)
- **⏺ Home** (`KEYCODE_HOME`)
- **⏹ Recent Apps** (`KEYCODE_APP_SWITCH`)
- **🔒 Lock / Wake** (`KEYCODE_POWER`)
- **🔉 Volume Down** (`KEYCODE_VOLUME_DOWN`)
- **🔊 Volume Up** (`KEYCODE_VOLUME_UP`)

### ⚡ 3. App Management
- **🔄 Restart App**: Force-stops and re-launches the main launcher activity.
- **🧹 Clear App Data**: Wipes app cache, storage, and databases via `pm clear`.
- **✨ Clear Data & Restart**: Wipes app storage and immediately relaunches in a clean state.
- **🛑 Force Stop**: Terminates running foreground/background processes.
- **🗑️ Uninstall App**: Uninstalls the APK from the target device.
- **⚙️ App Info**: Opens the native Android OS Settings App Info page.

### 🎨 4. Device Quick Tools
- **📸 Screenshot to Clipboard**: Captures device screen directly into your system clipboard (paste with `Cmd+V` / `Ctrl+V`).
- **🌗 Toggle Dark Mode**: Switches system UI theme between Light and Dark mode.
- **📐 Toggle Layout Bounds**: Shows/hides developer inspection bounding boxes (`debug.layout`).
- **⚡ Toggle System Animations**: Switches animation scales between `0.0x` (instant) and `1.0x`.

### 🪫 5. Battery & Doze Simulator
- **Quick Presets (🪫 5%, 🔋 20%, 🔋 50%, ⚡ 100%)**: Simulate critical, low, half, or full battery levels.
- **🔌 Unplug (Discharge)**: Simulates USB unplug / battery discharge while staying connected over ADB.
- **🔄 Reset Battery**: Restores device to real physical hardware battery status.
- **💤 Enter Doze (Idle)**: Forces Android `DeviceIdle` mode to test background jobs and WorkManager.
- **☀️ Exit Doze**: Wakes device from Doze mode.
- **⏳ App Standby**: Puts package into App Standby bucket to test app hibernation.

### 🗂️ 6. App Data, SharedPreferences & SQLite Database Inspector
- **📝 SharedPreferences Live Editor**:
  - Pick XML file from dropdown.
  - Inline editing of values (String, Boolean, Int, Long, Float).
  - Add new keys or delete keys.
  - Click **Save Changes** or **Save & Restart** to immediately reload in-memory state.
- **🗄️ Database Live Inspector & SQL Query Console**:
  - Select any `.db` / `.sqlite` file and table.
  - **Live Table Editor**: View rows and columns, edit any cell value inline with real-time updates.
  - **SQL Console**: Run custom queries (`SELECT`, `UPDATE`, `DELETE`, `INSERT`, `PRAGMA`), with instant tabular outputs.
  - **Insert Row & Save & Restart**: Insert records and soft restart app in 1 click.
- **💾 Export SQLite DBs & Prefs**: Pulls all databases and XML files to `.adb_exports/<package>/` in your project workspace.

### 📂 7. Remote Device File Explorer
- Browse on-device files and folders (`/sdcard`, download directories, app sandboxes).
- View file metadata (permissions, file sizes, last modified dates).
- Directly view and inspect text/log files on device.
- Create new folders, rename/move items, and delete files/folders remotely.
- Integrated file upload (push to device) and file download (pull to host).

### ☁️ 8. Google Cloud Device Streaming
- Connect to remote physical Android devices hosted in Google Cloud (Pixel 10 Pro, Pixel 9 Pro, Galaxy S24, Pixel Fold) directly from the VS Code Webview sidebar.
- One-click **Start Stream** creates an encrypted ADB-over-SSL bridge tunnel.
- One-click **Stop Stream** safely disconnects and releases the cloud reservation.

### 🎯 9. Semantic UI & Automator Actions
- **👆 Tap by Text**: Locate any visible button, header, or label by text (e.g. `"Sign In"`, `"Submit"`) and tap its center.
- **👆 Tap by Resource ID**: Directly tap components by ID (`"btn_submit"`).
- **🔍 Assert UI Element**: Validate whether a required element or text is present on the screen with instant pass/fail status.
- **🌳 Dump UI Tree**: Inspect the live UI hierarchy tree with bounding boxes.

### ▶️ 10. Web Project Play Runner (Dev, Prod, Build, Deploy)
- **Status Bar Play Button**: Click **`$(play) Run Project`** on the status bar or the Webview header.
- **Auto Configuration Detector**: Automatically scans `package.json` and detects Next.js, Vite, React, Vue, Angular, Astro, or Svelte.
- **Presets & Configurations**:
  - `⚡ Dev Mode` (`npm run dev` / `npm start`)
  - `🚀 Production Run` (`npm start` / `npm run serve`)
  - `📦 Build Project` (`npm run build`)
  - `🌐 Deploy Project` (`npm run deploy`)
  - `⚡ Custom Scripts...` (interactive QuickPick menu)
- Spawns in an integrated VS Code terminal named `"Web Project Runner"`.

### 🔗 11. Deep Link & URL Tester
- Enter custom scheme (e.g. `myapp://details?id=123`) or web link (e.g. `https://example.com`).
- Click **🚀 Open Deep Link** to dispatch directly to the device.

### 📢 12. Broadcast & Intent Tester
- Enter broadcast action (e.g. `com.example.MY_NOTIFICATION`).
- Enter optional extra parameters (`key=value`).
- Click **📢 Send Broadcast** to trigger local receivers.

---

## 🛠️ Requirements
- `adb` (Android Debug Bridge) installed and available in PATH.
- Android device with USB Debugging enabled, or an Android emulator.
- For SharedPreferences & Database Export: App build must be **debuggable** (`debuggable true`).

---

## 📄 License
Apache 2.0

