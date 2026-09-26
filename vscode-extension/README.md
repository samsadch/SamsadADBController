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

### 🔗 7. Deep Link & URL Tester
- Enter custom scheme (e.g. `myapp://details?id=123`) or web link (e.g. `https://example.com`).
- Click **🚀 Open Deep Link** to dispatch directly to the device.

### 📢 8. Broadcast & Intent Tester
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

