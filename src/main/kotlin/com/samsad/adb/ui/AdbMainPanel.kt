package com.samsad.adb.ui

import com.samsad.adb.services.AdbDevice
import com.samsad.adb.services.AdbExecutor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*

import com.intellij.icons.AllIcons

class AdbMainPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val deviceComboBox = ComboBox<AdbDevice>().apply {
        font = JBUI.Fonts.label(12f)
        preferredSize = Dimension(preferredSize.width, 34)
        minimumSize = Dimension(120, 34)
        maximumSize = Dimension(Int.MAX_VALUE, 34)
    }

    private val refreshDevicesButton = ModernButton(icon = AllIcons.Actions.Refresh, cornerRadius = 6).apply {
        toolTipText = "Refresh connected devices"
        preferredSize = Dimension(38, 34)
        minimumSize = Dimension(38, 34)
        maximumSize = Dimension(38, 34)
    }

    private val packageNameComboBox = ComboBox<String>().apply {
        isEditable = true
        font = JBUI.Fonts.label(12f)
        preferredSize = Dimension(preferredSize.width, 34)
        minimumSize = Dimension(120, 34)
        maximumSize = Dimension(Int.MAX_VALUE, 34)
    }

    private val detectPackageButton = ModernButton("Auto Detect", cornerRadius = 6).apply {
        toolTipText = "Scan workspace files for Android package name"
        preferredSize = Dimension(100, 34)
        minimumSize = Dimension(100, 34)
        maximumSize = Dimension(100, 34)
    }

    // App Control Buttons
    private val restartAppButton = ModernButton("🔄  Restart App")
    private val clearDataButton = ModernButton("🧹  Clear App Data")
    private val clearAndRestartButton = ModernButton("✨  Clear & Restart")
    private val forceStopButton = ModernButton("🛑  Force Stop")
    private val uninstallAppButton = ModernButton("🗑️  Uninstall App")
    private val appInfoButton = ModernButton("⚙️  App Info")

    // Device Control Buttons
    private val screenshotButton = ModernButton("📸  Screenshot to Clipboard")
    private val toggleDarkModeButton = ModernButton("🌗  Toggle Dark Mode")
    private val toggleLayoutBoundsButton = ModernButton("📐  Toggle Layout Bounds")
    private val toggleAnimationsButton = ModernButton("⚡  Toggle Animations")

    // App Data, SharedPreferences & Database Inspector Buttons
    private val openSharedPrefsEditorButton = ModernButton("📝  SharedPreferences Live Editor")
    private val openDatabaseInspectorButton = ModernButton("🗄️  Database Live Inspector & SQL")
    private val exportAppDataButton = ModernButton("💾  Export SQLite DBs & Prefs")

    // Battery & Doze Simulator Buttons
    private val battery5Button = ModernButton("🪫  5%", cornerRadius = 6).apply { toolTipText = "Set battery to 5% (Critical)" }
    private val battery20Button = ModernButton("🔋  20%", cornerRadius = 6).apply { toolTipText = "Set battery to 20% (Low)" }
    private val battery50Button = ModernButton("🔋  50%", cornerRadius = 6).apply { toolTipText = "Set battery to 50%" }
    private val battery100Button = ModernButton("⚡  100%", cornerRadius = 6).apply { toolTipText = "Set battery to 100% (Full)" }
    private val unplugBatteryButton = ModernButton("🔌  Unplug (Discharge)")
    private val resetBatteryButton = ModernButton("🔄  Reset Battery")
    private val enterDozeButton = ModernButton("💤  Enter Doze (Idle)")
    private val exitDozeButton = ModernButton("☀️  Exit Doze")
    private val appStandbyButton = ModernButton("⏳  App Standby (Inactive)")

    // Virtual Navigation Buttons (Icon-Only with Tooltips)
    private val navBackButton = ModernButton("◀", cornerRadius = 6).apply {
        toolTipText = "Back"
        font = font.deriveFont(13f)
    }
    private val navHomeButton = ModernButton("⏺", cornerRadius = 6).apply {
        toolTipText = "Home"
        font = font.deriveFont(13f)
    }
    private val navRecentsButton = ModernButton("⏹", cornerRadius = 6).apply {
        toolTipText = "Recent Apps"
        font = font.deriveFont(13f)
    }
    private val navLockButton = ModernButton("🔒", cornerRadius = 6).apply {
        toolTipText = "Lock / Wake Screen"
        font = font.deriveFont(13f)
    }
    private val navVolDownButton = ModernButton("🔉", cornerRadius = 6).apply {
        toolTipText = "Volume Down"
        font = font.deriveFont(13f)
    }
    private val navVolUpButton = ModernButton("🔊", cornerRadius = 6).apply {
        toolTipText = "Volume Up"
        font = font.deriveFont(13f)
    }

    // Deep Link Tester Fields
    private val deepLinkField = JBTextField().apply {
        emptyText.text = "e.g. myapp://checkout?id=101 or https://example.com/promo"
        font = JBUI.Fonts.label(12f)
        preferredSize = Dimension(preferredSize.width, 34)
    }
    private val openDeepLinkButton = ModernButton("🚀  Open Deep Link", cornerRadius = 6)

    // Broadcast Tester Fields
    private val broadcastActionField = JBTextField().apply {
        emptyText.text = "Action: e.g. com.example.CUSTOM_NOTIFICATION"
        font = JBUI.Fonts.label(12f)
        preferredSize = Dimension(preferredSize.width, 34)
    }
    private val broadcastExtraField = JBTextField().apply {
        emptyText.text = "Extra (Key=Value): e.g. title=Hello World"
        font = JBUI.Fonts.label(12f)
        preferredSize = Dimension(preferredSize.width, 34)
    }
    private val sendBroadcastButton = ModernButton("📢  Send Broadcast", cornerRadius = 6)

    // Status Pill
    private val statusBadge = StatusBadge()

    init {
        border = JBUI.Borders.empty(14)
        background = JBColor.namedColor("ToolWindow.background", JBColor(0xF9F9F9, 0x1E1F22))

        val contentPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
        }

        // Top Target Device & Package Name controls
        contentPanel.add(createInputSection())
        contentPanel.add(Box.createVerticalStrut(14))

        // Virtual Navigation Bar
        val navGrid = JPanel(GridLayout(1, 6, 6, 0)).apply {
            isOpaque = false
            maximumSize = Dimension(Int.MAX_VALUE, 32)
            preferredSize = Dimension(preferredSize.width, 32)
            alignmentX = Component.LEFT_ALIGNMENT
            add(navBackButton)
            add(navHomeButton)
            add(navRecentsButton)
            add(navLockButton)
            add(navVolDownButton)
            add(navVolUpButton)
        }
        contentPanel.add(navGrid)
        contentPanel.add(Box.createVerticalStrut(14))

        // Section 1: App Management
        val appGrid = JPanel(GridLayout(3, 2, 8, 8)).apply {
            isOpaque = false
            add(restartAppButton)
            add(clearDataButton)
            add(clearAndRestartButton)
            add(forceStopButton)
            add(uninstallAppButton)
            add(appInfoButton)
        }
        contentPanel.add(SectionCard("1. App Management", appGrid))
        contentPanel.add(Box.createVerticalStrut(14))

        // Section 2: Device Quick Tools
        val deviceGrid = JPanel(GridLayout(2, 2, 8, 8)).apply {
            isOpaque = false
            add(screenshotButton)
            add(toggleDarkModeButton)
            add(toggleLayoutBoundsButton)
            add(toggleAnimationsButton)
        }
        contentPanel.add(SectionCard("2. Device Quick Tools", deviceGrid))
        contentPanel.add(Box.createVerticalStrut(14))

        // Section 3: Battery & Doze Simulator (Moved to Position 3)
        val batteryPresetsGrid = JPanel(GridLayout(1, 4, 6, 0)).apply {
            isOpaque = false
            maximumSize = Dimension(Int.MAX_VALUE, 32)
            preferredSize = Dimension(preferredSize.width, 32)
            add(battery5Button)
            add(battery20Button)
            add(battery50Button)
            add(battery100Button)
        }
        val batteryGrid = JPanel(GridLayout(3, 2, 8, 8)).apply {
            isOpaque = false
            add(unplugBatteryButton)
            add(resetBatteryButton)
            add(enterDozeButton)
            add(exitDozeButton)
            add(appStandbyButton)
        }
        val batteryContainer = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(batteryPresetsGrid)
            add(Box.createVerticalStrut(8))
            add(batteryGrid)
        }
        contentPanel.add(SectionCard("3. Battery & Doze Simulator", batteryContainer))
        contentPanel.add(Box.createVerticalStrut(14))

        // Section 4: SharedPreferences Live Editor & App Data
        val appDataGrid = JPanel(GridLayout(3, 1, 8, 8)).apply {
            isOpaque = false
            add(openSharedPrefsEditorButton)
            add(openDatabaseInspectorButton)
            add(exportAppDataButton)
        }
        contentPanel.add(SectionCard("4. App Data & Database Live Inspector", appDataGrid))
        contentPanel.add(Box.createVerticalStrut(14))

        // Section 5: Deep Link Tester
        val deepLinkContent = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(deepLinkField)
            add(Box.createVerticalStrut(8))
            add(openDeepLinkButton)
        }
        contentPanel.add(SectionCard("5. Deep Link & URL Tester", deepLinkContent))
        contentPanel.add(Box.createVerticalStrut(14))

        // Section 6: Broadcast / Notification Tester
        val broadcastContent = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(broadcastActionField)
            add(Box.createVerticalStrut(6))
            add(broadcastExtraField)
            add(Box.createVerticalStrut(8))
            add(sendBroadcastButton)
        }
        contentPanel.add(SectionCard("6. Broadcast & Intent Tester", broadcastContent))
        contentPanel.add(Box.createVerticalStrut(14))

        // Status badge row
        val statusRow = JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
            isOpaque = false
            alignmentX = Component.LEFT_ALIGNMENT
            add(statusBadge)
        }
        contentPanel.add(statusRow)
        contentPanel.add(Box.createVerticalGlue())

        val scrollPane = JBScrollPane(contentPanel).apply {
            border = JBUI.Borders.empty()
            isOpaque = false
            viewport.isOpaque = false
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
        }

        add(scrollPane, BorderLayout.CENTER)

        // Event Listeners
        refreshDevicesButton.addActionListener { refreshConnectedDevices() }
        detectPackageButton.addActionListener { autoDetectPackageName() }

        deviceComboBox.addActionListener {
            val devId = (deviceComboBox.selectedItem as? AdbDevice)?.id
            if (devId != null) {
                refreshInstalledPackages(devId)
                updateDarkModeButtonText(devId)
            }
        }

        // Virtual Navigation events
        navBackButton.addActionListener { runDeviceTask("Key: Back") { id -> AdbExecutor.getInstance().sendKeyEvent(id, 4) } }
        navHomeButton.addActionListener { runDeviceTask("Key: Home") { id -> AdbExecutor.getInstance().sendKeyEvent(id, 3) } }
        navRecentsButton.addActionListener { runDeviceTask("Key: Recents") { id -> AdbExecutor.getInstance().sendKeyEvent(id, 187) } }
        navLockButton.addActionListener { runDeviceTask("Key: Lock/Wake") { id -> AdbExecutor.getInstance().sendKeyEvent(id, 26) } }
        navVolDownButton.addActionListener { runDeviceTask("Key: Vol-") { id -> AdbExecutor.getInstance().sendKeyEvent(id, 25) } }
        navVolUpButton.addActionListener { runDeviceTask("Key: Vol+") { id -> AdbExecutor.getInstance().sendKeyEvent(id, 24) } }

        // App Management events
        restartAppButton.addActionListener { runAdbTask("Restart App") { deviceId, pkg -> AdbExecutor.getInstance().restartApp(deviceId, pkg) } }
        clearDataButton.addActionListener { runAdbTask("Clear App Data") { deviceId, pkg -> AdbExecutor.getInstance().clearAppData(deviceId, pkg) } }
        clearAndRestartButton.addActionListener { runAdbTask("Clear & Restart") { deviceId, pkg -> AdbExecutor.getInstance().clearDataAndRestartApp(deviceId, pkg) } }
        forceStopButton.addActionListener { runAdbTask("Force Stop") { deviceId, pkg -> AdbExecutor.getInstance().forceStopApp(deviceId, pkg) } }
        uninstallAppButton.addActionListener { runAdbTask("Uninstall App") { deviceId, pkg -> AdbExecutor.getInstance().uninstallApp(deviceId, pkg) } }
        appInfoButton.addActionListener { runAdbTask("Open App Info") { deviceId, pkg -> AdbExecutor.getInstance().openAppInfo(deviceId, pkg) } }

        // Device Tools events
        toggleDarkModeButton.addActionListener {
            runDeviceTask("Toggle Dark Mode") { devId ->
                val res = AdbExecutor.getInstance().toggleDarkMode(devId)
                updateDarkModeButtonText(devId)
                res
            }
        }
        toggleLayoutBoundsButton.addActionListener { runDeviceTask("Toggle Layout Bounds") { deviceId -> AdbExecutor.getInstance().toggleLayoutBounds(deviceId) } }
        toggleAnimationsButton.addActionListener { runDeviceTask("Toggle Animations") { deviceId -> AdbExecutor.getInstance().toggleAnimations(deviceId) } }
        screenshotButton.addActionListener { runDeviceTask("Screenshot") { deviceId -> AdbExecutor.getInstance().captureScreenshotToClipboard(deviceId) } }

        // App Data, SharedPreferences & Database Inspector events
        openSharedPrefsEditorButton.addActionListener {
            val deviceId = getSelectedDeviceId() ?: return@addActionListener
            val pkg = getTargetPackageName() ?: return@addActionListener
            SharedPrefsEditorDialog(project, deviceId, pkg).show()
        }

        openDatabaseInspectorButton.addActionListener {
            val deviceId = getSelectedDeviceId() ?: return@addActionListener
            val pkg = getTargetPackageName() ?: return@addActionListener
            DatabaseInspectorDialog(project, deviceId, pkg).show()
        }

        exportAppDataButton.addActionListener {
            val deviceId = getSelectedDeviceId() ?: return@addActionListener
            val pkg = getTargetPackageName() ?: return@addActionListener
            val basePath = project.basePath ?: return@addActionListener

            statusBadge.setStatus(StatusBadge.StatusType.LOADING, "⏳ Exporting App Data (DB & Prefs)...")
            ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Exporting App Data", false) {
                override fun run(indicator: ProgressIndicator) {
                    val result = AdbExecutor.getInstance().exportAppDataToProject(deviceId, pkg, java.io.File(basePath))
                    ApplicationManager.getApplication().invokeLater {
                        result.fold(
                            onSuccess = { msg ->
                                val exportDir = java.io.File(basePath, ".adb_exports/$pkg")
                                com.intellij.openapi.vfs.LocalFileSystem.getInstance().refreshAndFindFileByIoFile(exportDir)
                                statusBadge.setStatus(StatusBadge.StatusType.SUCCESS, "✓ $msg")
                            },
                            onFailure = { error ->
                                statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ Export Failed: ${error.message?.take(50)}")
                            }
                        )
                    }
                }
            })
        }

        // Battery & Doze Simulator events
        battery5Button.addActionListener { runDeviceTask("Battery 5%") { id -> AdbExecutor.getInstance().setBatteryLevel(id, 5) } }
        battery20Button.addActionListener { runDeviceTask("Battery 20%") { id -> AdbExecutor.getInstance().setBatteryLevel(id, 20) } }
        battery50Button.addActionListener { runDeviceTask("Battery 50%") { id -> AdbExecutor.getInstance().setBatteryLevel(id, 50) } }
        battery100Button.addActionListener { runDeviceTask("Battery 100%") { id -> AdbExecutor.getInstance().setBatteryLevel(id, 100) } }
        unplugBatteryButton.addActionListener { runDeviceTask("Unplug Battery") { id -> AdbExecutor.getInstance().unplugBattery(id) } }
        resetBatteryButton.addActionListener { runDeviceTask("Reset Battery") { id -> AdbExecutor.getInstance().resetBattery(id) } }
        enterDozeButton.addActionListener { runDeviceTask("Enter Doze") { id -> AdbExecutor.getInstance().forceDozeMode(id) } }
        exitDozeButton.addActionListener { runDeviceTask("Exit Doze") { id -> AdbExecutor.getInstance().exitDozeMode(id) } }
        appStandbyButton.addActionListener { runAdbTask("App Standby") { deviceId, pkg -> AdbExecutor.getInstance().setAppInactive(deviceId, pkg) } }

        // Deep Link & Broadcast events
        openDeepLinkButton.addActionListener {
            val url = deepLinkField.text.trim()
            if (url.isBlank()) {
                statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ Please enter a Deep Link URL")
            } else {
                val pkg = getTargetPackageName()
                runDeviceTask("Deep Link") { deviceId -> AdbExecutor.getInstance().sendDeepLink(deviceId, url, pkg) }
            }
        }

        sendBroadcastButton.addActionListener {
            val action = broadcastActionField.text.trim()
            if (action.isBlank()) {
                statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ Please enter a Broadcast Action name")
            } else {
                val extra = broadcastExtraField.text.trim()
                val parts = if (extra.contains("=")) extra.split("=", limit = 2) else null
                val extraKey = parts?.getOrNull(0)?.trim()
                val extraVal = parts?.getOrNull(1)?.trim()
                val pkg = getTargetPackageName()
                runDeviceTask("Broadcast") { deviceId -> AdbExecutor.getInstance().sendBroadcast(deviceId, action, extraKey, extraVal, pkg) }
            }
        }

        // Initial setup
        refreshConnectedDevices()
        autoDetectPackageName()
    }

    private fun createInputSection(): JPanel {
        val container = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            alignmentX = Component.LEFT_ALIGNMENT
        }

        // Target Device label
        val deviceLabel = JLabel("Target Device").apply {
            font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD)
            foreground = JBColor.namedColor("Label.foreground", JBColor(0x333333, 0xDFE1E5))
            alignmentX = Component.LEFT_ALIGNMENT
        }
        val deviceRow = JPanel(BorderLayout(6, 0)).apply {
            isOpaque = false
            maximumSize = Dimension(Int.MAX_VALUE, 34)
            preferredSize = Dimension(preferredSize.width, 34)
            alignmentX = Component.LEFT_ALIGNMENT
            add(deviceComboBox, BorderLayout.CENTER)
            add(refreshDevicesButton, BorderLayout.EAST)
        }

        // Package Name label
        val packageLabel = JLabel("Package Name").apply {
            font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD)
            foreground = JBColor.namedColor("Label.foreground", JBColor(0x333333, 0xDFE1E5))
            alignmentX = Component.LEFT_ALIGNMENT
        }
        val packageRow = JPanel(BorderLayout(6, 0)).apply {
            isOpaque = false
            maximumSize = Dimension(Int.MAX_VALUE, 34)
            preferredSize = Dimension(preferredSize.width, 34)
            alignmentX = Component.LEFT_ALIGNMENT
            add(packageNameComboBox, BorderLayout.CENTER)
            add(detectPackageButton, BorderLayout.EAST)
        }

        container.add(deviceLabel)
        container.add(Box.createVerticalStrut(6))
        container.add(deviceRow)
        container.add(Box.createVerticalStrut(10))
        container.add(packageLabel)
        container.add(Box.createVerticalStrut(6))
        container.add(packageRow)

        return SectionCard("📱 Target Device & Package", container)
    }

    private fun refreshConnectedDevices() {
        deviceComboBox.removeAllItems()
        statusBadge.setStatus(StatusBadge.StatusType.LOADING, "⏳ Scanning connected devices...")

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Scanning Connected Devices", false) {
            override fun run(indicator: ProgressIndicator) {
                val devices = AdbExecutor.getInstance().getConnectedDevices()
                ApplicationManager.getApplication().invokeLater {
                    deviceComboBox.removeAllItems()
                    if (devices.isEmpty()) {
                        statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ No devices or emulators found")
                    } else {
                        devices.forEach { deviceComboBox.addItem(it) }
                        statusBadge.setStatus(StatusBadge.StatusType.SUCCESS, "✓ Connected: ${devices.size} device ready")
                        val firstDevId = devices.firstOrNull()?.id
                        if (firstDevId != null) {
                            refreshInstalledPackages(firstDevId)
                            updateDarkModeButtonText(firstDevId)
                        }
                    }
                }
            }
        })
    }

    private fun refreshInstalledPackages(deviceId: String) {
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Fetching Installed Packages", false) {
            override fun run(indicator: ProgressIndicator) {
                val packages = AdbExecutor.getInstance().getInstalledPackages(deviceId)
                ApplicationManager.getApplication().invokeLater {
                    val currentText = getTargetPackageNameText()
                    packageNameComboBox.removeAllItems()
                    if (currentText.isNotBlank()) {
                        packageNameComboBox.addItem(currentText)
                    }
                    packages.forEach { pkg ->
                        if (pkg != currentText) {
                            packageNameComboBox.addItem(pkg)
                        }
                    }
                    if (currentText.isNotBlank()) {
                        setTargetPackageName(currentText)
                    }
                }
            }
        })
    }

    private fun updateDarkModeButtonText(deviceId: String) {
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Checking Theme State", false) {
            override fun run(indicator: ProgressIndicator) {
                val isNight = AdbExecutor.getInstance().isNightMode(deviceId)
                ApplicationManager.getApplication().invokeLater {
                    toggleDarkModeButton.text = if (isNight) "☀️  Switch to Light Mode" else "🌙  Switch to Dark Mode"
                }
            }
        })
    }

    private fun autoDetectPackageName() {
        val basePath = project.basePath ?: return
        val baseDir = com.intellij.openapi.vfs.LocalFileSystem.getInstance().findFileByPath(basePath) ?: return
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Detecting App Package Name", false) {
            override fun run(indicator: ProgressIndicator) {
                val detectedPackage = scanPackageName(baseDir)
                if (!detectedPackage.isNullOrBlank()) {
                    ApplicationManager.getApplication().invokeLater {
                        setTargetPackageName(detectedPackage)
                    }
                }
            }
        })
    }

    private fun setTargetPackageName(pkg: String) {
        packageNameComboBox.editor.item = pkg
        packageNameComboBox.selectedItem = pkg
    }

    private fun getTargetPackageNameText(): String {
        return (packageNameComboBox.editor.item as? String
            ?: packageNameComboBox.selectedItem as? String
            ?: "").trim()
    }

    private fun scanPackageName(file: VirtualFile): String? {
        if (file.name == "AndroidManifest.xml") {
            try {
                val content = String(file.contentsToByteArray())
                val regex = Regex("package=\"([^\"]+)\"")
                val match = regex.find(content)
                if (match != null) return match.groupValues[1]
            } catch (e: Exception) { }
        } else if (file.name.endsWith("build.gradle") || file.name.endsWith("build.gradle.kts")) {
            try {
                val content = String(file.contentsToByteArray())
                val regex = Regex("applicationId\\s*=?\\s*[\"']([^\"']+)[\"']")
                val match = regex.find(content)
                if (match != null) return match.groupValues[1]
                val namespaceRegex = Regex("namespace\\s*=?\\s*[\"']([^\"']+)[\"']")
                val namespaceMatch = namespaceRegex.find(content)
                if (namespaceMatch != null) return namespaceMatch.groupValues[1]
            } catch (e: Exception) { }
        }

        if (file.isDirectory) {
            for (child in file.children) {
                val found = scanPackageName(child)
                if (found != null) return found
            }
        }
        return null
    }

    private fun getSelectedDeviceId(): String? {
        val selectedDevice = deviceComboBox.selectedItem as? AdbDevice
        if (selectedDevice == null) {
            statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ Please connect a device/emulator first")
            return null
        }
        return selectedDevice.id
    }

    private fun getTargetPackageName(): String? {
        val pkg = getTargetPackageNameText()
        if (pkg.isBlank()) {
            statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ Please enter or select a Package Name first")
            return null
        }
        return pkg
    }

    private fun runAdbTask(title: String, action: (String, String) -> Result<String>) {
        val deviceId = getSelectedDeviceId() ?: return
        val packageName = getTargetPackageName() ?: return

        statusBadge.setStatus(StatusBadge.StatusType.LOADING, "⏳ Executing $title...")

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, title, false) {
            override fun run(indicator: ProgressIndicator) {
                val result = action(deviceId, packageName)
                ApplicationManager.getApplication().invokeLater {
                    result.fold(
                        onSuccess = {
                            statusBadge.setStatus(StatusBadge.StatusType.SUCCESS, "✓ $title Successful")
                        },
                        onFailure = { error ->
                            statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ $title Failed: ${error.message?.take(50)}")
                        }
                    )
                }
            }
        })
    }

    private fun runDeviceTask(title: String, action: (String) -> Result<String>) {
        val deviceId = getSelectedDeviceId() ?: return

        statusBadge.setStatus(StatusBadge.StatusType.LOADING, "⏳ Executing $title...")

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, title, false) {
            override fun run(indicator: ProgressIndicator) {
                val result = action(deviceId)
                ApplicationManager.getApplication().invokeLater {
                    result.fold(
                        onSuccess = { msg ->
                            statusBadge.setStatus(StatusBadge.StatusType.SUCCESS, "✓ $title: $msg")
                        },
                        onFailure = { error ->
                            statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ $title Failed: ${error.message?.take(50)}")
                        }
                    )
                }
            }
        })
    }

    /**
     * Card container with subtle rounded border and IDE theme surface.
     */
    private class SectionCard(title: String, content: JComponent) : JPanel(BorderLayout(0, 10)) {
        init {
            isOpaque = false
            border = JBUI.Borders.empty(12, 14, 14, 14)
            alignmentX = Component.LEFT_ALIGNMENT

            val titleLabel = JLabel(title).apply {
                font = JBUI.Fonts.label(13f).deriveFont(Font.BOLD)
                foreground = JBColor.namedColor("Label.foreground", JBColor(0x202124, 0xDFE1E5))
            }

            add(titleLabel, BorderLayout.NORTH)
            add(content, BorderLayout.CENTER)
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

            val bgColor = JBColor.namedColor("Panel.background", JBColor(0xF6F7F9, 0x27292C))
            val borderColor = JBColor(0xE0E2E7, 0x393C42)

            g2.color = bgColor
            g2.fillRoundRect(0, 0, width - 1, height - 1, 12, 12)

            g2.color = borderColor
            g2.stroke = BasicStroke(1f)
            g2.drawRoundRect(0, 0, width - 1, height - 1, 12, 12)

            g2.dispose()
            super.paintComponent(g)
        }
    }

    /**
     * Modern status badge pill with color themes.
     */
    private class StatusBadge : JPanel() {
        enum class StatusType {
            IDLE, SUCCESS, ERROR, LOADING
        }

        private val label = JLabel().apply {
            font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD)
        }

        private var currentType = StatusType.IDLE

        init {
            isOpaque = false
            layout = FlowLayout(FlowLayout.LEFT, 10, 6)
            border = JBUI.Borders.empty(0, 2)
            add(label)
            setStatus(StatusType.IDLE, "ℹ️ Ready")
        }

        fun setStatus(type: StatusType, message: String) {
            currentType = type
            label.text = message
            label.foreground = when (type) {
                StatusType.SUCCESS -> JBColor(0x137333, 0x5BB974)
                StatusType.ERROR -> JBColor(0xC5221F, 0xF28B82)
                StatusType.LOADING -> JBColor(0x1A73E8, 0x8AB4F8)
                StatusType.IDLE -> JBColor(0x5F6368, 0x9AA0A6)
            }
            revalidate()
            repaint()
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

            val bgColor = when (currentType) {
                StatusType.SUCCESS -> JBColor(0xE6F4EA, 0x1B3828)
                StatusType.ERROR -> JBColor(0xFCE8E6, 0x3E2224)
                StatusType.LOADING -> JBColor(0xE8F0FE, 0x1F2E45)
                StatusType.IDLE -> JBColor(0xF1F3F4, 0x292B2E)
            }
            val borderColor = when (currentType) {
                StatusType.SUCCESS -> JBColor(0xA8DAB5, 0x2D5A3C)
                StatusType.ERROR -> JBColor(0xFAD2CF, 0x5C2B2E)
                StatusType.LOADING -> JBColor(0xAECBFA, 0x2F4870)
                StatusType.IDLE -> JBColor(0xDADCE0, 0x3C3F41)
            }

            g2.color = bgColor
            g2.fillRoundRect(0, 0, width - 1, height - 1, 8, 8)

            g2.color = borderColor
            g2.stroke = BasicStroke(1f)
            g2.drawRoundRect(0, 0, width - 1, height - 1, 8, 8)

            g2.dispose()
            super.paintComponent(g)
        }
    }
}

