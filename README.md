# Samsad ADB Controller

**Samsad ADB Controller** is a fast, 100% offline tool window plugin for Android Studio and IntelliJ IDEA. It provides 1-click device management, app control actions, and display utilities directly inside your IDE without requiring any API keys or external authentication.

---

## ⚡ Features

### 📱 Connected Device Manager
- **Auto Device Detection**: Detects all connected emulators and physical Android devices (`adb devices -l`).
- **Refresh Control**: One-click **🔄 Refresh** button updates the connected devices dropdown.

### 📦 Auto Package Name Detection
- Automatically scans your project's `AndroidManifest.xml` or Gradle build files (`applicationId` / `namespace`).
- Manual override field provided for targeting specific package names.

### 🛠️ App Actions Card Grid
- **🔄 Restart App**: Force-stops and launches the app's main launcher activity.
- **🧹 Clear App Data**: Clears app cache and storage (`adb shell pm clear <package>`).
- **🛑 Force Stop**: Kills running app background tasks (`adb shell am force-stop <package>`).
- **🗑️ Uninstall App**: Removes the app build from the device (`adb uninstall <package>`).

### 🎨 Device Quick Tools Card Grid
- **📸 Screenshot to Clipboard**: Takes a device screenshot (`screencap -p`) and saves it directly into your system clipboard.
- **🌗 Toggle Dark Mode**: Switches device dark/light UI theme (`adb shell cmd uimode night toggle`).
- **📐 Toggle Layout Bounds**: Enables/disables component layout inspection boxes (`debug.layout`).
- **⚡ Toggle Animations**: Toggles window and transition animation scales between `0.0x` (faster UI) and `1.0x`.

---

## 🚀 Getting Started & Installation

### Option A: Install via ZIP Archive
1. Download `SamsadADBController-1.0.0.zip` from releases or build it locally.
2. In Android Studio / IntelliJ IDEA, open **Settings / Preferences -> Plugins -> ⚙️ (Gear Icon) -> Install Plugin from Disk...**.
3. Select `SamsadADBController-1.0.0.zip` and restart your IDE.
4. Open the **Samsad ADB** tool window on the right sidebar!

### Option B: Build & Run Locally
```bash
# Clone the repository
git clone https://github.com/samsad-chalil_dewa/SamsadADBController.git
cd SamsadADBController

# Build plugin package
./gradlew buildPlugin

# Run in sandbox IDE
./gradlew runIde
```

---

## 🛠️ Requirements & Tech Stack

- **Target IDE**: Android Studio / IntelliJ IDEA 2024.1+
- **Language**: Kotlin 1.9 / Java 17
- **Dependencies**: 100% offline, zero external API keys required (uses standard local `adb`).

---

## 📄 License

Distributed under the Apache 2.0 License. See `LICENSE` for more details.
