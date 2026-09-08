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
     * Uninstalls App.
     */
    fun uninstallApp(deviceId: String, packageName: String): Result<String> {
        return runAdb(deviceId, "uninstall", packageName)
    }

    /**
     * Toggles Dark/Light Mode on device.
     */
    fun toggleDarkMode(deviceId: String): Result<String> {
        return runAdb(deviceId, "shell", "cmd", "uimode", "night", "toggle")
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

    companion object {
        fun getInstance(): AdbExecutor = service()
    }
}
