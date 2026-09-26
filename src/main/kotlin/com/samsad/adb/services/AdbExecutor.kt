package com.samsad.adb.services

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import java.awt.Image
import java.awt.Toolkit
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.Transferable
import java.awt.datatransfer.UnsupportedFlavorException
import java.io.File
import java.io.InputStream
import java.sql.ResultSet
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO

data class AdbDevice(
    val id: String,
    val model: String,
    val isEmulator: Boolean
) {
    override fun toString(): String {
        val type = if (isEmulator) "Emulator" else "Device"
        val cleanModel = model.replace('_', ' ')
        return "📱 $type: $cleanModel ($id)"
    }
}

@Service(Service.Level.APP)
class AdbExecutor {

    /**
     * Opens a connection to a local SQLite file.
     *
     * The xerial driver is instantiated directly instead of going through DriverManager:
     * DriverManager resolves drivers against the caller's classloader, which inside a
     * plugin does not reliably see the bundled jar and fails with "No suitable driver".
     */
    private fun openDb(dbFile: File): java.sql.Connection {
        val conn = org.sqlite.JDBC().connect("jdbc:sqlite:${dbFile.absolutePath}", java.util.Properties())
        return conn ?: throw RuntimeException("Could not open ${dbFile.name} as a SQLite database")
    }

    /**
     * Builds the absolute path of a file inside an app's private data directory,
     * rejecting names that could break out of the quoting in [writeFileCommand].
     */
    private fun devicePath(packageName: String, subDir: String, fileName: String): String {
        for (part in listOf(packageName, fileName)) {
            require(part.matches(Regex("[A-Za-z0-9._-]+"))) { "Unsupported name for a device path: '$part'" }
        }
        return "/data/data/$packageName/$subDir/$fileName"
    }

    /**
     * Builds a single shell command that writes stdin to [remotePath] as the app's own user.
     *
     * adb joins its arguments into one command line without quoting, so passing `sh -c` and
     * the redirect as separate arguments makes the device's outer shell (uid shell) perform
     * the redirect, which cannot write into /data/data. Pre-quoting keeps it inside run-as.
     */
    private fun writeFileCommand(packageName: String, remotePath: String): String =
        "run-as $packageName sh -c 'cat > \"$remotePath\"'"

    private val adbExecutablePath: String by lazy {
        findAdbPath()
    }

    private fun findAdbPath(): String {
        val userHome = System.getProperty("user.home") ?: ""
        val candidatePaths = listOf(
            System.getenv("ANDROID_HOME")?.let { "$it/platform-tools/adb" },
            System.getenv("ANDROID_SDK_ROOT")?.let { "$it/platform-tools/adb" },
            "$userHome/Library/Android/sdk/platform-tools/adb",
            "$userHome/Android/Sdk/platform-tools/adb",
            "/usr/local/bin/adb",
            "/opt/homebrew/bin/adb",
            "adb"
        ).filterNotNull()

        for (path in candidatePaths) {
            val file = File(path)
            if (file.exists() && file.canExecute()) {
                return file.absolutePath
            }
        }
        return "adb"
    }

    /**
     * Executes ADB command and returns output.
     */
    fun runAdb(deviceId: String? = null, vararg args: String): Result<String> {
        val command = mutableListOf(adbExecutablePath)
        if (!deviceId.isNullOrBlank()) {
            command.add("-s")
            command.add(deviceId)
        }
        command.addAll(args)

        return try {
            val process = ProcessBuilder(command)
                .redirectErrorStream(true)
                .start()

            val output = process.inputStream.bufferedReader().use { it.readText() }
            val finished = process.waitFor(10, TimeUnit.SECONDS)

            if (!finished) {
                process.destroyForcibly()
                Result.failure(RuntimeException("ADB command timed out"))
            } else if (process.exitValue() != 0) {
                Result.failure(RuntimeException(output.ifBlank { "ADB process returned exit code ${process.exitValue()}" }))
            } else {
                Result.success(output.trim())
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Lists all connected devices & emulators.
     */
    fun getConnectedDevices(): List<AdbDevice> {
        val result = runAdb(null, "devices", "-l")
        val devices = mutableListOf<AdbDevice>()

        result.onSuccess { output ->
            val lines = output.lines()
            for (line in lines) {
                if (line.isBlank() || line.startsWith("List of devices")) continue
                val parts = line.split(Regex("\\s+"))
                if (parts.size >= 2 && parts[1] == "device") {
                    val id = parts[0]
                    var model = id
                    val modelPart = parts.find { it.startsWith("model:") }
                    if (modelPart != null) {
                        model = modelPart.removePrefix("model:")
                    }
                    val isEmulator = id.startsWith("emulator-") || line.contains("emulator")
                    devices.add(AdbDevice(id, model, isEmulator))
                }
            }
        }
        return devices
    }

    /**
     * Clears App Data and Cache (`pm clear`).
     */
    fun clearAppData(deviceId: String, packageName: String): Result<String> {
        return runAdb(deviceId, "shell", "pm", "clear", packageName)
    }

    /**
     * Force Stops App (`am force-stop`).
     */
    fun forceStopApp(deviceId: String, packageName: String): Result<String> {
        return runAdb(deviceId, "shell", "am", "force-stop", packageName)
    }

    /**
     * Restarts App.
     */
    fun restartApp(deviceId: String, packageName: String): Result<String> {
        forceStopApp(deviceId, packageName)
        return runAdb(deviceId, "shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1")
    }

    /**
     * Clears App Data and immediately launches/restarts the App.
     */
    fun clearDataAndRestartApp(deviceId: String, packageName: String): Result<String> {
        val clearResult = clearAppData(deviceId, packageName)
        if (clearResult.isFailure) return clearResult
        return runAdb(deviceId, "shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1")
    }

    /**
     * Uninstalls App.
     */
    fun uninstallApp(deviceId: String, packageName: String): Result<String> {
        return runAdb(deviceId, "uninstall", packageName)
    }

    /**
     * Opens Android System App Info / Settings screen for target package.
     */
    fun openAppInfo(deviceId: String, packageName: String): Result<String> {
        return runAdb(deviceId, "shell", "am", "start", "-a", "android.settings.APPLICATION_DETAILS_SETTINGS", "-d", "package:$packageName")
    }

    /**
     * Toggles Dark/Light Mode on device.
     */
    fun toggleDarkMode(deviceId: String): Result<String> {
        val current = runAdb(deviceId, "shell", "cmd", "uimode", "night").getOrDefault("")
        val isNight = current.contains("yes", ignoreCase = true)
        val targetMode = if (isNight) "no" else "yes"
        val switchResult = runAdb(deviceId, "shell", "cmd", "uimode", "night", targetMode)
        return switchResult.map {
            if (targetMode == "yes") "Dark Mode set to ON" else "Dark Mode set to OFF"
        }
    }

    /**
     * Toggles Layout Bounds (`debug.layout`).
     */
    fun toggleLayoutBounds(deviceId: String): Result<String> {
        val current = runAdb(deviceId, "shell", "getprop", "debug.layout").getOrDefault("false")
        val newValue = if (current.trim() == "true") "false" else "true"
        runAdb(deviceId, "shell", "setprop", "debug.layout", newValue)
        // Send broadcast to update UI instantly
        runAdb(deviceId, "shell", "service", "call", "activity", "1599295570")
        return Result.success("Layout bounds set to $newValue")
    }

    /**
     * Toggles system window/transition animation scales between 0.0 (off) and 1.0 (on).
     */
    fun toggleAnimations(deviceId: String): Result<String> {
        val current = runAdb(deviceId, "shell", "settings", "get", "global", "window_animation_scale").getOrDefault("1.0")
        val newScale = if (current.trim() == "0" || current.trim() == "0.0") "1.0" else "0.0"

        runAdb(deviceId, "shell", "settings", "put", "global", "window_animation_scale", newScale)
        runAdb(deviceId, "shell", "settings", "put", "global", "transition_animation_scale", newScale)
        runAdb(deviceId, "shell", "settings", "put", "global", "animator_duration_scale", newScale)

        val status = if (newScale == "0.0") "OFF (Faster UI)" else "ON (1.0x)"
        return Result.success("Animations set to $status")
    }

    /**
     * Sends a hardware/navigation keyevent to the device.
     */
    fun sendKeyEvent(deviceId: String, keyCode: Int): Result<String> {
        return runAdb(deviceId, "shell", "input", "keyevent", keyCode.toString())
    }

    /**
     * Dispatches a deep link or app link URI via intent action VIEW.
     */
    fun sendDeepLink(deviceId: String, url: String, packageName: String? = null): Result<String> {
        val args = mutableListOf("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url)
        if (!packageName.isNullOrBlank()) {
            args.add(packageName)
        }
        return runAdb(deviceId, *args.toTypedArray()).map { "Dispatched Deep Link: $url" }
    }

    /**
     * Broadcasts a custom intent action with optional string extra.
     */
    fun sendBroadcast(deviceId: String, action: String, extraKey: String? = null, extraVal: String? = null, packageName: String? = null): Result<String> {
        val args = mutableListOf("shell", "am", "broadcast", "-a", action)
        if (!extraKey.isNullOrBlank() && !extraVal.isNullOrBlank()) {
            args.addAll(listOf("--es", extraKey, extraVal))
        }
        if (!packageName.isNullOrBlank()) {
            args.add(packageName)
        }
        return runAdb(deviceId, *args.toTypedArray()).map { "Broadcast Sent: $action" }
    }

    /**
     * Checks if the device is currently in Night / Dark Mode.
     */
    fun isNightMode(deviceId: String): Boolean {
        val current = runAdb(deviceId, "shell", "cmd", "uimode", "night").getOrDefault("")
        return current.contains("yes", ignoreCase = true)
    }

    /**
     * Lists third-party / user installed package names on device.
     */
    fun getInstalledPackages(deviceId: String): List<String> {
        val result = runAdb(deviceId, "shell", "pm", "list", "packages", "-3")
        val packages = mutableListOf<String>()
        result.onSuccess { output ->
            output.lines().forEach { line ->
                val clean = line.trim().removePrefix("package:")
                if (clean.isNotBlank()) {
                    packages.add(clean)
                }
            }
        }
        return packages.sorted()
    }

    /**
     * Lists all SharedPreferences XML filenames for a package.
     */
    fun getSharedPrefsFiles(deviceId: String, packageName: String): List<String> {
        val listResult = runAdb(deviceId, "shell", "run-as", packageName, "ls", "/data/data/$packageName/shared_prefs/")
        if (listResult.isFailure) return emptyList()
        return listResult.getOrDefault("").lines()
            .map { it.trim() }
            .filter { it.endsWith(".xml") }
            .sorted()
    }

    /**
     * Reads raw XML content of a SharedPreferences file.
     */
    fun readSharedPrefsXml(deviceId: String, packageName: String, fileName: String): Result<String> {
        return runAdb(deviceId, "shell", "run-as", packageName, "cat", "/data/data/$packageName/shared_prefs/$fileName")
    }

    /**
     * Writes raw XML content to a SharedPreferences file on the device.
     */
    fun writeSharedPrefsXml(deviceId: String, packageName: String, fileName: String, xmlContent: String): Result<String> {
        val remote = try {
            devicePath(packageName, "shared_prefs", fileName)
        } catch (e: Exception) {
            return Result.failure(e)
        }
        val command = listOf(adbExecutablePath, "-s", deviceId, "shell", writeFileCommand(packageName, remote))
        return try {
            val process = ProcessBuilder(command).start()
            process.outputStream.bufferedWriter().use {
                it.write(xmlContent)
                it.flush()
            }
            val finished = process.waitFor(10, TimeUnit.SECONDS)
            if (!finished) {
                process.destroyForcibly()
                Result.failure(RuntimeException("Timed out writing SharedPreferences XML"))
            } else if (process.exitValue() != 0) {
                val err = process.errorStream.bufferedReader().use { it.readText() }
                Result.failure(RuntimeException(err.ifBlank { "Exit code ${process.exitValue()}" }))
            } else {
                Result.success("Saved $fileName successfully")
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun getLocalDbDir(deviceId: String, packageName: String): File {
        val cleanDev = deviceId.replace(':', '_').replace('/', '_')
        val dir = File(System.getProperty("java.io.tmpdir"), "samsad_adb_dbs/$cleanDev/$packageName")
        dir.mkdirs()
        return dir
    }

    /**
     * Pulls SQLite database and companion files (-wal, -shm) to local temp folder.
     */
    fun syncDatabaseFromDevice(deviceId: String, packageName: String, dbName: String): Result<File> {
        val localDir = getLocalDbDir(deviceId, packageName)
        val localDb = File(localDir, dbName)
        val localWal = File(localDir, "$dbName-wal")
        val localShm = File(localDir, "$dbName-shm")

        try {
            // 1. Pull main DB
            val p1 = ProcessBuilder(adbExecutablePath, "-s", deviceId, "exec-out", "run-as", packageName, "cat", "/data/data/$packageName/databases/$dbName")
                .redirectOutput(localDb)
                .start()
            p1.waitFor(8, TimeUnit.SECONDS)

            // 2. Pull WAL if present
            val p2 = ProcessBuilder(adbExecutablePath, "-s", deviceId, "exec-out", "run-as", packageName, "cat", "/data/data/$packageName/databases/$dbName-wal")
                .redirectOutput(localWal)
                .start()
            p2.waitFor(5, TimeUnit.SECONDS)

            // 3. Pull SHM if present
            val p3 = ProcessBuilder(adbExecutablePath, "-s", deviceId, "exec-out", "run-as", packageName, "cat", "/data/data/$packageName/databases/$dbName-shm")
                .redirectOutput(localShm)
                .start()
            p3.waitFor(5, TimeUnit.SECONDS)

            if (!localDb.exists() || localDb.length() == 0L) {
                return Result.failure(RuntimeException("Could not pull database '$dbName'. Ensure app is debuggable."))
            }

            return Result.success(localDb)
        } catch (e: Exception) {
            return Result.failure(e)
        }
    }

    /**
     * Checkpoints WAL and pushes updated database back to the device.
     */
    fun pushDatabaseToDevice(deviceId: String, packageName: String, dbName: String): Result<String> {
        val localDir = getLocalDbDir(deviceId, packageName)
        val localDb = File(localDir, dbName)
        if (!localDb.exists()) {
            return Result.failure(RuntimeException("Local database file not found."))
        }

        return try {
            // Checkpoint WAL locally so all updates are merged into main .db
            try {
                openDb(localDb).use { conn ->
                    conn.createStatement().use { stmt ->
                        stmt.execute("PRAGMA wal_checkpoint(TRUNCATE);")
                    }
                }
            } catch (e: Exception) {
                // Ignore if not in WAL mode
            }

            // Push main DB back
            val remote = devicePath(packageName, "databases", dbName)
            val command = listOf(adbExecutablePath, "-s", deviceId, "shell", writeFileCommand(packageName, remote))
            val process = ProcessBuilder(command).start()
            localDb.inputStream().use { input ->
                process.outputStream.use { output ->
                    input.copyTo(output)
                    output.flush()
                }
            }
            process.waitFor(10, TimeUnit.SECONDS)

            // Clean WAL and SHM on device so app starts clean with new DB
            runAdb(deviceId, "shell", "run-as", packageName, "rm", "-f", "/data/data/$packageName/databases/$dbName-wal", "/data/data/$packageName/databases/$dbName-shm")

            Result.success("Database '$dbName' synced to device")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Lists all SQLite database files for a package.
     */
    fun getDatabaseFiles(deviceId: String, packageName: String): List<String> {
        val listResult = runAdb(deviceId, "shell", "run-as", packageName, "ls", "/data/data/$packageName/databases/")
        if (listResult.isFailure) return emptyList()
        return listResult.getOrDefault("").lines()
            .map { it.trim() }
            .filter { it.isNotBlank() && !it.endsWith("-wal") && !it.endsWith("-shm") && !it.endsWith("-journal") && !it.contains("No such file") }
            .sorted()
    }

    /**
     * Lists all user tables inside a specific database file.
     */
    fun getDatabaseTables(deviceId: String, packageName: String, dbName: String): List<String> =
        getDatabaseTablesResult(deviceId, packageName, dbName).getOrDefault(emptyList())

    /**
     * Same as [getDatabaseTables] but keeps the failure, so the UI can say why a database
     * came back empty instead of showing a bare "No tables found".
     */
    fun getDatabaseTablesResult(deviceId: String, packageName: String, dbName: String): Result<List<String>> {
        val syncRes = syncDatabaseFromDevice(deviceId, packageName, dbName)
        val localDb = syncRes.getOrElse { return Result.failure(it) }

        return try {
            openDb(localDb).use { conn ->
                val sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_metadata' AND name NOT LIKE 'room_master_table' ORDER BY name;"
                conn.createStatement().use { stmt ->
                    val rs = stmt.executeQuery(sql)
                    val tables = mutableListOf<String>()
                    while (rs.next()) {
                        tables.add(rs.getString(1))
                    }
                    Result.success(tables.toList())
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Gets schema info (columns, types, pk) for a table.
     */
    fun getTableSchema(deviceId: String, packageName: String, dbName: String, tableName: String): List<ColumnInfo> {
        val localDir = getLocalDbDir(deviceId, packageName)
        val localDb = File(localDir, dbName)
        if (!localDb.exists()) {
            syncDatabaseFromDevice(deviceId, packageName, dbName)
        }
        return try {
            openDb(localDb).use { conn ->
                val sql = "PRAGMA table_info(`$tableName`);"
                conn.createStatement().use { stmt ->
                    val rs = stmt.executeQuery(sql)
                    val list = mutableListOf<ColumnInfo>()
                    while (rs.next()) {
                        list.add(
                            ColumnInfo(
                                cid = rs.getInt("cid"),
                                name = rs.getString("name"),
                                type = rs.getString("type"),
                                notNull = rs.getInt("notnull") == 1,
                                defaultValue = rs.getString("dflt_value"),
                                isPrimaryKey = rs.getInt("pk") == 1
                            )
                        )
                    }
                    list
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Executes arbitrary SQL query on target database.
     */
    fun executeSqlQuery(deviceId: String, packageName: String, dbName: String, sql: String): Result<SqlQueryResult> {
        val localDir = getLocalDbDir(deviceId, packageName)
        val localDb = File(localDir, dbName)
        if (!localDb.exists()) {
            val syncRes = syncDatabaseFromDevice(deviceId, packageName, dbName)
            if (syncRes.isFailure) return Result.failure(syncRes.exceptionOrNull() ?: RuntimeException("Failed to sync DB"))
        }

        val trimmedSql = sql.trim()
        val isSelect = trimmedSql.startsWith("SELECT", ignoreCase = true) ||
                trimmedSql.startsWith("PRAGMA", ignoreCase = true) ||
                trimmedSql.startsWith("EXPLAIN", ignoreCase = true)

        return try {
            openDb(localDb).use { conn ->
                conn.createStatement().use { stmt ->
                    if (isSelect) {
                        val rs = stmt.executeQuery(trimmedSql)
                        val meta = rs.metaData
                        val colCount = meta.columnCount
                        val columns = (1..colCount).map { meta.getColumnLabel(it) ?: meta.getColumnName(it) }
                        val rows = mutableListOf<List<String>>()
                        while (rs.next()) {
                            val row = (1..colCount).map { rs.getString(it) ?: "NULL" }
                            rows.add(row)
                        }
                        Result.success(SqlQueryResult(columns, rows, "${rows.size} row(s) returned", true))
                    } else {
                        val affected = stmt.executeUpdate(trimmedSql)
                        pushDatabaseToDevice(deviceId, packageName, dbName)
                        Result.success(SqlQueryResult(emptyList(), emptyList(), "✓ Query executed: $affected row(s) affected", false, affected))
                    }
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Updates a single cell value in a table by primary key.
     */
    fun updateTableCell(
        deviceId: String,
        packageName: String,
        dbName: String,
        tableName: String,
        pkColumn: String,
        pkValue: String,
        targetColumn: String,
        newValue: String
    ): Result<String> {
        val localDir = getLocalDbDir(deviceId, packageName)
        val localDb = File(localDir, dbName)
        return try {
            openDb(localDb).use { conn ->
                val sql = "UPDATE `$tableName` SET `$targetColumn` = ? WHERE `$pkColumn` = ?;"
                conn.prepareStatement(sql).use { pstmt ->
                    pstmt.setString(1, newValue)
                    pstmt.setString(2, pkValue)
                    pstmt.executeUpdate()
                }
            }
            pushDatabaseToDevice(deviceId, packageName, dbName)
            Result.success("Updated `$targetColumn` in `$tableName`")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Deletes a row from a table by primary key.
     */
    fun deleteTableRow(
        deviceId: String,
        packageName: String,
        dbName: String,
        tableName: String,
        pkColumn: String,
        pkValue: String
    ): Result<String> {
        val localDir = getLocalDbDir(deviceId, packageName)
        val localDb = File(localDir, dbName)
        return try {
            openDb(localDb).use { conn ->
                val sql = "DELETE FROM `$tableName` WHERE `$pkColumn` = ?;"
                conn.prepareStatement(sql).use { pstmt ->
                    pstmt.setString(1, pkValue)
                    pstmt.executeUpdate()
                }
            }
            pushDatabaseToDevice(deviceId, packageName, dbName)
            Result.success("Deleted row from `$tableName`")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Dumps all SharedPreferences XML files content from a debuggable app.
     */
    fun dumpSharedPreferences(deviceId: String, packageName: String): Result<String> {
        val listResult = runAdb(deviceId, "shell", "run-as", packageName, "ls", "/data/data/$packageName/shared_prefs/")
        if (listResult.isFailure) return listResult

        val files = listResult.getOrDefault("").lines().map { it.trim() }.filter { it.endsWith(".xml") }
        if (files.isEmpty()) {
            return Result.success("No SharedPreferences XML files found in /data/data/$packageName/shared_prefs/")
        }

        val sb = StringBuilder()
        for (file in files) {
            val content = runAdb(deviceId, "shell", "run-as", packageName, "cat", "/data/data/$packageName/shared_prefs/$file")
            sb.append("=== SharedPreferences: $file ===\n")
            sb.append(content.getOrDefault("(empty or unreadable)"))
            sb.append("\n\n")
        }
        return Result.success(sb.toString().trim())
    }

    /**
     * Pulls databases and SharedPreferences to a project subfolder: `.adb_exports/<package>/`.
     */
    fun exportAppDataToProject(deviceId: String, packageName: String, projectBaseDir: File): Result<String> {
        val exportDir = File(projectBaseDir, ".adb_exports/$packageName")
        exportDir.mkdirs()

        var exportedCount = 0

        // 1. SharedPreferences
        val prefsResult = runAdb(deviceId, "shell", "run-as", packageName, "ls", "/data/data/$packageName/shared_prefs/")
        if (prefsResult.isSuccess) {
            val prefsDir = File(exportDir, "shared_prefs")
            val files = prefsResult.getOrDefault("").lines().map { it.trim() }.filter { it.endsWith(".xml") }
            if (files.isNotEmpty()) {
                prefsDir.mkdirs()
                for (file in files) {
                    val xmlContent = runAdb(deviceId, "shell", "run-as", packageName, "cat", "/data/data/$packageName/shared_prefs/$file")
                    xmlContent.onSuccess { content ->
                        File(prefsDir, file).writeText(content)
                        exportedCount++
                    }
                }
            }
        }

        // 2. Databases
        val dbResult = runAdb(deviceId, "shell", "run-as", packageName, "ls", "/data/data/$packageName/databases/")
        if (dbResult.isSuccess) {
            val databasesDir = File(exportDir, "databases")
            val files = dbResult.getOrDefault("").lines().map { it.trim() }.filter { it.isNotBlank() && !it.contains("No such file") }
            if (files.isNotEmpty()) {
                databasesDir.mkdirs()
                for (file in files) {
                    val targetFile = File(databasesDir, file)
                    val process = ProcessBuilder(adbExecutablePath, "-s", deviceId, "exec-out", "run-as", packageName, "cat", "/data/data/$packageName/databases/$file")
                        .redirectOutput(targetFile)
                        .start()
                    val finished = process.waitFor(5, TimeUnit.SECONDS)
                    if (finished && targetFile.exists() && targetFile.length() > 0) {
                        exportedCount++
                    }
                }
            }
        }

        if (exportedCount == 0) {
            return Result.failure(RuntimeException("No data found or app is not debuggable (run-as not permitted)."))
        }

        return Result.success("Exported $exportedCount file(s) to ${exportDir.relativeTo(projectBaseDir).path}")
    }

    /**
     * Captures device screenshot directly into system clipboard.
     */
    fun captureScreenshotToClipboard(deviceId: String): Result<String> {
        val command = listOf(adbExecutablePath, "-s", deviceId, "exec-out", "screencap", "-p")
        return try {
            val process = ProcessBuilder(command).start()
            val image = process.inputStream.use { stream -> ImageIO.read(stream) }
            val finished = process.waitFor(10, TimeUnit.SECONDS)

            if (finished && image != null) {
                val transferable = ImageTransferable(image)
                Toolkit.getDefaultToolkit().systemClipboard.setContents(transferable, null)
                Result.success("Screenshot copied to clipboard!")
            } else {
                Result.failure(RuntimeException("Failed to capture screenshot image"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private class ImageTransferable(private val image: Image) : Transferable {
        override fun getTransferDataFlavors(): Array<DataFlavor> = arrayOf(DataFlavor.imageFlavor)
        override fun isDataFlavorSupported(flavor: DataFlavor): Boolean = flavor == DataFlavor.imageFlavor
        override fun getTransferData(flavor: DataFlavor): Any {
            if (flavor == DataFlavor.imageFlavor) return image
            throw UnsupportedFlavorException(flavor)
        }
    }

    /**
     * Sets battery level (0-100) and unplugs AC/USB simulation.
     */
    fun setBatteryLevel(deviceId: String, level: Int): Result<String> {
        runAdb(deviceId, "shell", "dumpsys", "battery", "unplug")
        return runAdb(deviceId, "shell", "dumpsys", "battery", "set", "level", level.toString()).map {
            "Battery level set to $level%"
        }
    }

    /**
     * Simulates unplugging power cord / discharging.
     */
    fun unplugBattery(deviceId: String): Result<String> {
        return runAdb(deviceId, "shell", "dumpsys", "battery", "unplug").map {
            "Battery set to Discharging (Unplugged)"
        }
    }

    /**
     * Resets battery to real hardware reading.
     */
    fun resetBattery(deviceId: String): Result<String> {
        return runAdb(deviceId, "shell", "dumpsys", "battery", "reset").map {
            "Battery reset to actual hardware state"
        }
    }

    /**
     * Forces device into Doze mode (Deep Idle).
     */
    fun forceDozeMode(deviceId: String): Result<String> {
        return runAdb(deviceId, "shell", "dumpsys", "deviceidle", "force-idle").map {
            "Device entered Doze mode (Force Idle)"
        }
    }

    /**
     * Wakes device and exits Doze mode.
     */
    fun exitDozeMode(deviceId: String): Result<String> {
        return runAdb(deviceId, "shell", "dumpsys", "deviceidle", "unforce").map {
            "Device exited Doze mode"
        }
    }

    /**
     * Puts target app into Standby / Inactive state.
     */
    fun setAppInactive(deviceId: String, packageName: String): Result<String> {
        return runAdb(deviceId, "shell", "am", "set-inactive", packageName, "true").map {
            "$packageName set to App Standby (Inactive)"
        }
    }

    companion object {
        fun getInstance(): AdbExecutor = service()
    }
}

data class ColumnInfo(
    val cid: Int,
    val name: String,
    val type: String,
    val notNull: Boolean,
    val defaultValue: String?,
    val isPrimaryKey: Boolean
)

data class SqlQueryResult(
    val columns: List<String>,
    val rows: List<List<String>>,
    val message: String? = null,
    val isQuery: Boolean = true,
    val rowsAffected: Int = 0
)

data class PrefEntry(var key: String, var type: String, var value: String)

object SharedPrefsXmlHelper {
    fun parseXml(xml: String): MutableList<PrefEntry> {
        val list = mutableListOf<PrefEntry>()
        // string
        val stringRegex = Regex("<string\\s+name=\"([^\"]+)\">(.*?)</string>", RegexOption.DOT_MATCHES_ALL)
        for (m in stringRegex.findAll(xml)) {
            list.add(PrefEntry(m.groupValues[1], "string", m.groupValues[2]))
        }
        // boolean
        val boolRegex = Regex("<boolean\\s+name=\"([^\"]+)\"\\s+value=\"([^\"]+)\"\\s*/>")
        for (m in boolRegex.findAll(xml)) {
            list.add(PrefEntry(m.groupValues[1], "boolean", m.groupValues[2]))
        }
        // int
        val intRegex = Regex("<int\\s+name=\"([^\"]+)\"\\s+value=\"([^\"]+)\"\\s*/>")
        for (m in intRegex.findAll(xml)) {
            list.add(PrefEntry(m.groupValues[1], "int", m.groupValues[2]))
        }
        // long
        val longRegex = Regex("<long\\s+name=\"([^\"]+)\"\\s+value=\"([^\"]+)\"\\s*/>")
        for (m in longRegex.findAll(xml)) {
            list.add(PrefEntry(m.groupValues[1], "long", m.groupValues[2]))
        }
        // float
        val floatRegex = Regex("<float\\s+name=\"([^\"]+)\"\\s+value=\"([^\"]+)\"\\s*/>")
        for (m in floatRegex.findAll(xml)) {
            list.add(PrefEntry(m.groupValues[1], "float", m.groupValues[2]))
        }
        // set
        val setRegex = Regex("<set\\s+name=\"([^\"]+)\">(.*?)</set>", RegexOption.DOT_MATCHES_ALL)
        for (m in setRegex.findAll(xml)) {
            val innerValues = Regex("<string>(.*?)</string>").findAll(m.groupValues[2]).map { it.groupValues[1] }.toList()
            list.add(PrefEntry(m.groupValues[1], "set", innerValues.joinToString(",")))
        }
        list.sortBy { it.key }
        return list
    }

    fun serializeXml(entries: List<PrefEntry>): String {
        val sb = StringBuilder()
        sb.append("<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n")
        sb.append("<map>\n")
        for (entry in entries) {
            val k = entry.key.trim()
            if (k.isBlank()) continue
            val v = entry.value
            when (entry.type.lowercase()) {
                "boolean" -> sb.append("    <boolean name=\"$k\" value=\"${v.trim().toBoolean()}\" />\n")
                "int" -> sb.append("    <int name=\"$k\" value=\"${v.trim().toIntOrNull() ?: 0}\" />\n")
                "long" -> sb.append("    <long name=\"$k\" value=\"${v.trim().toLongOrNull() ?: 0L}\" />\n")
                "float" -> sb.append("    <float name=\"$k\" value=\"${v.trim().toFloatOrNull() ?: 0.0f}\" />\n")
                "set" -> {
                    sb.append("    <set name=\"$k\">\n")
                    v.split(",").map { it.trim() }.filter { it.isNotEmpty() }.forEach {
                        sb.append("        <string>$it</string>\n")
                    }
                    sb.append("    </set>\n")
                }
                else -> sb.append("    <string name=\"$k\">$v</string>\n")
            }
        }
        sb.append("</map>\n")
        return sb.toString()
    }
}
