# ADB Controller by Samsad 🚀

**ADB Controller by Samsad** is a high-productivity, 100% offline control panel plugin for **Android Studio**, **IntelliJ IDEA**, and **Visual Studio Code**. It provides 1-click device management, app lifecycle controls, hardware navigation, power simulators, live SharedPreferences editing, and intent testers directly inside your IDE — with zero terminal commands, zero external APIs, and zero configuration.

---

## 📑 Table of Contents
- [✨ Key Highlights](#-key-highlights)
- [📱 Feature Breakdown & How to Use](#-feature-breakdown--how-to-use)
  - [1. Device & Package Selection](#1-device--package-selection)
  - [2. Virtual Hardware Navigation Bar](#2-virtual-hardware-navigation-bar)
  - [3. App Management](#3-app-management)
  - [4. Device Quick Tools](#4-device-quick-tools)
  - [5. Battery & Doze Simulator](#5-battery--doze-simulator)
  - [6. SharedPreferences Live Editor & App Data](#6-sharedpreferences-live-editor--app-data)
  - [7. Deep Link & URL Tester](#7-deep-link--url-tester)
  - [8. Broadcast & Intent Tester](#8-broadcast--intent-tester)
- [📦 Installation Guide](#-installation-guide)
  - [Android Studio / IntelliJ IDEA](#android-studio--intellij-idea)
  - [Visual Studio Code](#visual-studio-code)
- [🛠️ Prerequisites & Requirements](#️-prerequisites--requirements)
- [📄 License](#-license)

---

## ✨ Key Highlights

- ⚡ **100% Offline & Private**: Communicates exclusively via your local `adb` server. No telemetry, no cloud log-in, no telemetry tracking.
- 🎯 **Automatic Workspace Detection**: Auto-discovers package names (`applicationId` or `namespace`) from Gradle and Manifest files.
- 📝 **Live SharedPreferences Table Editor**: View, modify, add, and delete SharedPreferences keys in real-time without writing test code or clearing all data.
- 🪫 **Deep Sleep & Battery Simulation**: Test low-power states, Doze idle mode, and standby buckets in 1 click.
- 🖥️ **Dual IDE Support**: Seamless workflow parity between Android Studio / IntelliJ IDEA and VS Code.

---

## 📱 Feature Breakdown & How to Use

### 1. Device & Package Selection
*Connect and target specific devices and applications with ease.*

- **Target Device Dropdown**:
  - Automatically lists all online emulators and physical Android devices connected via USB or Wi-Fi.
  - **How to use**: Select your target device from the dropdown. Click the **🔄 Refresh** button anytime you attach or detach a device.
- **Package Name Selector**:
  - **Auto Detect**: Click **Auto Detect** to parse your current project workspace for `applicationId` / `namespace`.
  - **Debuggable App Dropdown / Manual Entry**: Select from debuggable apps installed on the device or type a custom package name directly into the editable field.

---

### 2. Virtual Hardware Navigation Bar
*Compact icon-only strip for quick device interaction without reaching for the device/emulator.*

| Icon | Action | Keycode | How to Use |
| :---: | :--- | :---: | :--- |
| **◀** | **Back** | `KEYCODE_BACK (4)` | Click to trigger back navigation in the current screen. |
| **⏺** | **Home** | `KEYCODE_HOME (3)` | Click to return immediately to the Android launcher home screen. |
| **⏹** | **Recent Apps** | `KEYCODE_APP_SWITCH (187)` | Click to open the Android task switcher / multi-tasking overview. |
| **🔒** | **Lock / Wake** | `KEYCODE_POWER (26)` | Click to toggle the screen between asleep and awake. |
| **🔉** | **Volume Down** | `KEYCODE_VOLUME_DOWN (25)` | Click to decrease device media volume. |
| **🔊** | **Volume Up** | `KEYCODE_VOLUME_UP (24)` | Click to increase device media volume. |

> **Tip**: Hover over any icon button to see its tooltip description.

---

### 3. App Management
*Perform everyday app lifecycle operations in 1 click without memorizing ADB terminal commands.*

- **🔄 Restart App**:
  - **What it does**: Force-stops the target package and launches its main launcher activity.
  - **How to use**: Click after pushing code or when you need a fast soft restart.
- **🧹 Clear App Data**:
  - **What it does**: Runs `adb shell pm clear <package>` to wipe cache, databases, and local preferences.
  - **How to use**: Click when testing fresh first-launch onboarding or token expiry flows.
- **✨ Clear & Restart**:
  - **What it does**: Wipes all app data and immediately starts the launcher activity in one step.
  - **How to use**: Click for the ultimate "clean install" test without actually uninstalling the APK.
- **🛑 Force Stop**:
  - **What it does**: Kills all foreground activities, background services, and processes for the target app (`am force-stop`).
  - **How to use**: Click to terminate background sync, media playback, or stuck background threads.
- **🗑️ Uninstall App**:
  - **What it does**: Completely deletes the app from the target device (`adb uninstall <package>`).
  - **How to use**: Click before performing a clean APK install or when testing permission prompts.
- **⚙️ App Info**:
  - **What it does**: Opens the native Android OS **App Info** screen for the target package.
  - **How to use**: Click to inspect runtime permissions, storage breakdown, notification channels, or battery optimization settings.

---

### 4. Device Quick Tools
*Handy environment toggles and shortcuts for UI verification.*

- **📸 Screenshot to Clipboard**:
  - **What it does**: Takes an instant device screenshot (`screencap -p`) and places the image bytes directly onto your computer's system clipboard.
  - **How to use**: Click the button, then immediately press `Cmd+V` (macOS) or `Ctrl+V` (Windows/Linux) in Slack, Figma, GitHub PRs, or Jira.
- **🌗 Toggle Dark Mode**:
  - **What it does**: Flips the system UI theme between Day (Light) and Night (Dark) mode (`cmd uimode night toggle`).
  - **How to use**: Click to test color contrast, dynamic colors, and Material 3 theme switching.
- **📐 Toggle Layout Bounds**:
  - **What it does**: Enables or disables developer visual bounds (`debug.layout`), drawing clip bounds, margins, and padding on all UI elements.
  - **How to use**: Click to verify layout alignments, padding, and nested view hierarchies.
- **⚡ Toggle System Animations**:
  - **What it does**: Switches `window_animation_scale`, `transition_animation_scale`, and `animator_duration_scale` between `0.0x` (off) and `1.0x` (normal).
  - **How to use**: Turn animations off (`0.0x`) for ultra-snappy testing and deterministic UI automated tests.

---

### 5. Battery & Doze Simulator
*Test real-world edge cases like critical battery thresholds and OS power-saving modes.*

- **Quick Presets (🪫 5%, 🔋 20%, 🔋 50%, ⚡ 100%)**:
  - **How to use**: Click **5%** or **20%** to simulate critical/low battery warnings, power-saving banner triggers, or degraded GPS polling modes. Click **100%** to test full battery behaviors.
- **🔌 Unplug (Discharge)**:
  - **How to use**: Simulates unplugging the USB power cord (`dumpsys battery unplug`) so the OS treats the device as running on battery power while maintaining your ADB debug connection.
- **🔄 Reset Battery**:
  - **How to use**: Click after battery simulation to restore the device to actual physical battery telemetry (`dumpsys battery reset`).
- **💤 Enter Doze (Idle)**:
  - **How to use**: Forces the device into Android's deep `DeviceIdle` state (`dumpsys deviceidle force-idle`). Use this to test if your background sync, WorkManager tasks, or push notifications respect Doze mode maintenance windows.
- **☀️ Exit Doze**:
  - **How to use**: Wakes the device out of Doze mode (`dumpsys deviceidle unforce`), immediately executing deferred background tasks.
- **⏳ App Standby (Inactive)**:
  - **How to use**: Puts the target package directly into the Android App Standby bucket (`am set-inactive <package> true`) to test how the app behaves when idle.

---

### 6. App Data, SharedPreferences & SQLite Database Inspector
*Inspect, modify, and query application preferences and live SQLite databases in real-time without wiping the app.*

- **📝 SharedPreferences Live Editor**:
  - **How to use**:
    1. Click **📝 SharedPreferences Live Editor** in the sidebar.
    2. A dialog / editor panel opens showing all XML preference files found in `/data/data/<package>/shared_prefs/`.
    3. Select the XML file you want to inspect from the dropdown.
    4. View all stored keys, their detected data types (`String`, `Boolean`, `Int`, `Long`, `Float`), and current values.
    5. **Edit Values**: Double-click any value cell to modify it.
    6. **Add Keys**: Click **➕ Add Key**, select the type, enter the key name and initial value.
    7. **Delete Keys**: Select any row and click **🗑️ Delete Key**.
    8. **Save Changes**: Click **💾 Save Changes** to write the modified XML back to the device.
    9. **Save & Restart**: Click **⚡ Save & Restart App** to save the XML and immediately relaunch the app so in-memory singletons pick up the new preference values!

- **🗄️ Database Live Inspector & SQL Query Simulator**:
  - **How to use**:
    1. Click **🗄️ Database Live Inspector & SQL** in the sidebar.
    2. **Pick Database & Table**: Select any `.db` / `.sqlite` file (e.g. `app_database.db`) and target table from the top dropdowns.
    3. **Live Table Data View**:
       - View columns, primary keys, and data rows in an interactive table.
       - **Edit Cells Inline**: Double-click any cell to change its value — updates are written directly to the SQLite database on-device!
       - **➕ Insert Row**: Inserts a new record into the table.
       - **🗑️ Delete Row**: Removes selected row by primary key.
    4. **⚡ SQL Query Simulator**:
       - Switch to the **SQL Simulator** tab (or console pane).
       - Type custom queries (`SELECT * FROM users WHERE status = 1;`, `UPDATE ...`, `DELETE ...`, `PRAGMA table_info(...)`).
       - Click **▶ Execute SQL** or press `Ctrl/Cmd + Enter`.
       - View query outputs in a dedicated results table with row count and query execution timing.
    5. **⚡ Save & Restart App**: 1-click button to restart the application so Room / SQLite DAOs reload the freshly updated data!

- **💾 Export SQLite DBs & Prefs**:
  - **How to use**:
    1. Click **💾 Export SQLite DBs & Prefs**.
    2. The plugin pulls all SQLite databases (`.db`, `.sqlite`) and XML preference files from `/data/data/<package>/`.
    3. Files are saved into your workspace project folder under `.adb_exports/<package>/`.
    4. Open the SQLite database directly in Android Studio Database Inspector or your favorite SQLite viewer!

> **Note**: SharedPreferences Live Editor, Database Inspector, and Database Export require the app build to be **debuggable** (`debuggable true` in your build variant), which uses standard Android `run-as` permissions.

---

### 7. Deep Link & URL Tester
*Test custom URI schemes and App Links without typing complex terminal commands.*

- **How to use**:
  1. Enter your target URI scheme or HTTP/HTTPS link into the input field:
     - Example Custom Scheme: `myapp://checkout?orderId=9821&promo=SUMMER`
     - Example Web Link: `https://example.com/products/headphones`
  2. Click **🚀 Open Deep Link**.
  3. The plugin dispatches `adb shell am start -a android.intent.action.VIEW -d "<url>"` directly to your selected device.
  4. The device immediately opens your app's matching Activity or displays the disambiguation dialog.

---

### 8. Broadcast & Intent Tester
*Simulate push notifications, system broadcasts, and custom event receivers.*

- **How to use**:
  1. **Action**: Enter the broadcast intent action name:
     - Example: `com.example.myapp.ACTION_NOTIFY`
     - Example: `com.example.myapp.FORCE_SYNC`
  2. **Extra Parameters** *(Optional)*: Enter key-value pairs to pass with the broadcast intent:
     - Example: `message=Order Dispatched`
     - Example: `userId=42`
  3. Click **📢 Send Broadcast**.
  4. The plugin executes `adb shell am broadcast -a "<action>" ...` and displays the broadcast delivery result code in the status bar.

---

## 📦 Installation Guide

### Android Studio / IntelliJ IDEA

#### Method 1: Install from ZIP Archive
1. Download `ADBControllerBySamsad-1.0.1.zip` from releases or build it locally.
2. In Android Studio / IntelliJ IDEA, go to **Settings / Preferences -> Plugins**.
3. Click the **⚙️ (Gear Icon)** at the top right and select **Install Plugin from Disk...**.
4. Select `ADBControllerBySamsad-1.0.1.zip` and click **OK**.
5. Restart the IDE when prompted.
6. Look for **ADB Controller by Samsad** on your left or right sidebar tool window area!

#### Method 2: Build Locally from Source
```bash
git clone https://github.com/samsadch/SamsadADBController.git
cd SamsadADBController

# Build the plugin ZIP package
./gradlew clean buildPlugin

# Run in an isolated sandbox IDE for testing
./gradlew runIde
```
The output `.zip` will be located in `build/distributions/ADBControllerBySamsad-1.0.1.zip`.

---

### Visual Studio Code

#### Method 1: Install from VSIX Package
1. Download `adb-controller-by-samsad-1.0.0.vsix` from releases or build it locally.
2. In VS Code, open the Extensions view (`Cmd+Shift+X` or `Ctrl+Shift+X`).
3. Click the **`...` (Views and More Actions)** menu at the top of the Extensions sidebar.
4. Select **Install from VSIX...** and choose `adb-controller-by-samsad-1.0.0.vsix`.
5. Click the Android phone icon on the Activity Bar on the left!

#### Method 2: Build Locally from Source
```bash
cd vscode-extension
npm install
npm run build
npx @vscode/vsce package --no-dependencies
```

---

---

## 🤖 Model Context Protocol (MCP) Server for AI Agents

Drive, inspect, and debug your Android device directly from **Google Antigravity**, **Claude Code**, **Cursor**, **Windsurf**, or **Claude Desktop** using `@samsadch/adb-mcp`.

### Quick Setup

#### 1. Claude Code
```bash
claude mcp add adb -- npx -y @samsadch/adb-mcp
```

#### 2. Antigravity / Cursor / Windsurf / Claude Desktop
Add to your `mcp_config.json`:
```json
{
  "mcpServers": {
    "adb": {
      "command": "npx",
      "args": ["-y", "@samsadch/adb-mcp"]
    }
  }
}
```

### 📋 MCP Toolset (51 Tools Available)

| Domain | Tools |
| :--- | :--- |
| **Discovery & Sticky Target (3)** | `list_devices`, `set_target`, `get_device_info` |
| **Eyes & Hands: UI & Input (8)** | `take_screenshot`, `dump_view_hierarchy`, `tap_element`, `tap_coordinates`, `input_text`, `press_key`, `swipe_screen`, `open_deep_link` |
| **App Lifecycle & Permissions (10)** | `install_app`, `uninstall_app`, `list_packages`, `start_app`, `stop_app`, `restart_app`, `clear_app_data`, `grant_permission`, `revoke_permission`, `get_app_info` |
| **Database & SharedPreferences (16)** | `list_databases`, `inspect_database_overview`, `list_database_tables`, `get_table_schema`, `get_table_data`, `create_database_table`, `query_database`, `delete_database_row`, `clear_database_table`, `export_database`, `list_shared_preferences`, `read_shared_preferences`, `get_shared_preference`, `set_shared_preference`, `delete_shared_preference`, `clear_shared_preferences` |
| **Diagnostics & Memory (3)** | `get_logcat`, `clear_logcat`, `get_app_memory` |
| **Device Controls & Power (8)** | `set_battery_level`, `unplug_battery`, `reset_battery`, `force_doze_mode`, `exit_doze_mode`, `toggle_dark_mode`, `toggle_animations`, `send_broadcast` |
| **File Transfers & Shell (3)** | `push_file`, `pull_file`, `execute_shell_command` |

See [packages/adb-mcp/README.md](packages/adb-mcp/README.md) for full MCP tool documentation.

---

## 🛠️ Prerequisites & Requirements

- **Android Debug Bridge (`adb`)**:
  - `adb` must be installed and accessible in your system PATH, or installed with Android Studio SDK platform-tools.
- **Android Device / Emulator**:
  - Physical device with **USB Debugging** enabled in Developer Options, or an Android Virtual Device (AVD) running in emulator.
- **Debuggable App Build (for SharedPreferences & App Data Export)**:
  - The app must be compiled with `debuggable true` (standard for `debug` build types).

---

## 📄 License

Distributed under the Apache 2.0 License. See [LICENSE](LICENSE) for more details.

