# @samsadch/adb-mcp 🤖📱

**Model Context Protocol (MCP)** server that empowers AI coding agents (**Google Antigravity, Claude Code, Cursor, Windsurf, Claude Desktop**) to directly see, control, inspect, and debug connected Android devices and emulators over ADB.

Part of [ADB Controller by Samsad](https://github.com/samsadch/SamsadADBController). Powered by the shared capability layer [`@samsadch/adb-core`](https://github.com/samsadch/SamsadADBController/tree/main/packages/adb-core).

---

## ⚡ Highlights

* **100% Offline & Private**: Direct local ADB bridge communication. Zero telemetry, zero cloud relay.
* **Sticky Target Pinning**: Call `set_target` once; all subsequent tools infer the active device and package.
* **Multimodal Vision**: Real-time PNG screen capture for multimodal visual reasoning.
* **Structured UI Automator Inspection**: Complete UI hierarchy extraction with bounding box calculations and clickable state resolution.
* **Smart Touch & Gestures**: Tap by text, ID, or coordinates; swipe with auto-calculated screen geometry; dispatch hardware keycodes.
* **App Lifecycle & Runtime Permissions**: Install APKs, clear caches, restart apps, grant/revoke permissions dynamically.
* **Deep SQLite & SharedPreferences Inspection**: Query SQLite databases, browse tables, create tables, truncate, delete rows, and edit SharedPreferences XML with strict data typing.
* **Non-blocking Logcat & Memory Diagnostics**: Real-time log capture with PID/tag/severity filters and `dumpsys meminfo` process allocation breakdowns.
* **Hardware & Power Simulator**: Simulated battery levels, discharge states, Doze idle states, UI theme toggles, and broadcast intent injection.
* **File Transfers & Shell Execution**: Push/pull files and directories, and execute ad-hoc device shell commands.

---

## 🚀 Quick Setup & Usage

### 1. Claude Code
```bash
claude mcp add adb -- npx -y @samsadch/adb-mcp
```

### 2. Google Antigravity / Cursor / Windsurf / Claude Desktop
Add to your `mcp_config.json` or MCP settings:

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

### 3. Run Locally from Source
```bash
git clone https://github.com/samsadch/SamsadADBController.git
cd SamsadADBController
npm install
npm run build --workspace=@samsadch/adb-mcp
node packages/adb-mcp/out/index.js
```

---

## 🛠️ Complete MCP Tool Catalog (51 Tools)

### 1. Device Discovery & Sticky Target (3 Tools)
| Tool | Description |
| :--- | :--- |
| `list_devices` | Lists connected devices and emulators with ID, model, and state. |
| `set_target` | Pins the active device and/or Android package for all subsequent operations. |
| `get_device_info` | Retrieves OS version, SDK level, screen size, density, battery level, and dark mode. |

### 2. Eyes & Hands: UI Vision & Precision Automation (8 Tools)
| Tool | Description |
| :--- | :--- |
| `take_screenshot` | Captures a live screenshot as a multimodal PNG image. |
| `dump_view_hierarchy` | Dumps structured on-screen UI hierarchy JSON with bounding boxes, center coordinates, IDs, and click states. |
| `tap_element` | Finds an on-screen UI element by visible text, resource-id, or content-desc and taps its center. |
| `tap_coordinates` | Performs a touch event at specific `(x, y)` pixel coordinates. |
| `input_text` | Types text into the active input field with automated character and space escaping. |
| `press_key` | Dispatches hardware/navigation keys (`BACK`, `HOME`, `RECENTS`, `ENTER`, `LOCK`, `VOLUP`, `VOLDOWN`, `TAB`, `DELETE`, etc.) or keycodes. |
| `swipe_screen` | Swipes by direction (`"up"`, `"down"`, `"left"`, `"right"`) or explicit start/end coordinates. |
| `open_deep_link` | Dispatches Android `VIEW` Intents with URI schemes and App Links. |

### 3. App Lifecycle & Permission Management (10 Tools)
| Tool | Description |
| :--- | :--- |
| `install_app` | Installs an APK from the host machine with permission grant (`-g`) and reinstall (`-r`) flags. |
| `uninstall_app` | Uninstalls an application with optional data retention (`-k`). |
| `list_packages` | Lists installed packages filtered by `third_party`, `system`, `enabled`, `disabled`, with optional APK paths. |
| `start_app` | Launches main activity or specific Component class, with optional `stopFirst` cold start. |
| `stop_app` | Force-stops the target application (`am force-stop`). |
| `restart_app` | Atomically force-stops and re-launches the application. |
| `clear_app_data` | Resets application user data and cache (`pm clear`). |
| `grant_permission` | Grants runtime permissions (e.g. `CAMERA`, `POST_NOTIFICATIONS`, `ACCESS_FINE_LOCATION`). |
| `revoke_permission` | Revokes granted runtime permissions from the application. |
| `get_app_info` | Inspects package version name, version code, target SDK, min SDK, and requested/granted permissions. |

### 4. SQLite Database Inspection & Modification (10 Tools)
| Tool | Description |
| :--- | :--- |
| `list_databases` | Discovers all SQLite database files in `/data/data/<pkg>/databases/`. |
| `inspect_database_overview` | Generates a complete inventory table of all tables with row counts and column counts. |
| `list_database_tables` | Lists all table names defined inside the specified database. |
| `get_table_schema` | Inspects column names, data types, nullability, default values, and primary keys. |
| `get_table_data` | Browses and paginates table rows with sorting and total row count. |
| `create_database_table` | Creates a new SQLite table with structured column definitions or raw SQL. |
| `query_database` | Executes arbitrary SQL queries (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, etc.) with JSON results. |
| `delete_database_row` | Deletes specific row(s) matching a `WHERE` condition (e.g. `id = 42`). |
| `clear_database_table` | Wipes all records from a table and resets auto-increment sequence counters. |
| `export_database` | Pulls the database file and merged WAL journals to a local host path. |

### 5. SharedPreferences Management (6 Tools)
| Tool | Description |
| :--- | :--- |
| `list_shared_preferences` | Discovers all `.xml` preference files in `/data/data/<pkg>/shared_prefs/`. |
| `read_shared_preferences` | Reads all stored key-value pairs with exact data types. |
| `get_shared_preference` | Fetches a single key's value and explicit data type. |
| `set_shared_preference` | Inserts or updates a preference key-value pair (`string`, `int`, `long`, `float`, `boolean`, `set`). |
| `delete_shared_preference` | Removes a specific key from the preference XML file. |
| `clear_shared_preferences` | Resets a preference file to an empty map (`<map></map>`). |

### 6. Logs, Performance & System Diagnostics (3 Tools)
| Tool | Description |
| :--- | :--- |
| `get_logcat` | Captures non-blocking Logcat buffer with PID filtering, severity thresholds (`V`, `D`, `I`, `W`, `E`, `F`), tag filtering, search queries, and line limits. |
| `clear_logcat` | Clears the circular Logcat buffer on the device. |
| `get_app_memory` | Inspects process memory consumption using `dumpsys meminfo` (Total PSS/RSS in MB, Java Heap, Native Heap, Graphics, Code, Stack). |

### 7. Device Controls & Power Simulator (8 Tools)
| Tool | Description |
| :--- | :--- |
| `set_battery_level` | Simulates a specific battery level percentage (0-100) and unplugs device power. |
| `unplug_battery` | Simulates disconnecting device from AC/USB charger (sets battery state to discharging). |
| `reset_battery` | Restores battery status to actual physical hardware state. |
| `force_doze_mode` | Forces device into deep Doze mode (idle state) for testing background tasks and battery optimizations. |
| `exit_doze_mode` | Wakes device from Doze mode (unforce). |
| `toggle_dark_mode` | Switches system UI theme between Dark Mode and Light Mode, or sets an explicit mode (`light`, `dark`, `toggle`). |
| `toggle_animations` | Enables or disables system animations (window, transition, and animator scales) or toggles between 1.0x and 0.0x. |
| `send_broadcast` | Sends custom broadcast intent with action, package, component, and typed extras dictionary. |

### 8. File Transfers & Safe Ad-hoc Shell (3 Tools)
| Tool | Description |
| :--- | :--- |
| `push_file` | Transfers a local file or directory from the host machine to the Android device. |
| `pull_file` | Transfers a file or directory from the Android device to the host machine. |
| `execute_shell_command` | Executes an arbitrary ADB shell command on the target device and returns standard output. |

---

## 🔧 Environment Configuration

All environment variables are optional. The server automatically discovers SDK paths:

| Variable | Description |
| :--- | :--- |
| `ADB_PATH` | Explicit path to the `adb` binary. |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Android SDK root directory (`platform-tools/adb` is derived automatically). |
| `SQLITE_PATH` | Explicit path to host `sqlite3` binary for database extraction tools. |

---

## 📄 License

MIT © [Samsad Chalil Valappil](https://github.com/samsadch)
