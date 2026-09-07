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
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.*
import javax.swing.*

class AdbMainPanel(private val project: Project) : JPanel(BorderLayout(0, 10)) {

    private val deviceComboBox = ComboBox<AdbDevice>()
    private val refreshDevicesButton = createStyledButton("🔄 Refresh")

    private val packageNameField = JBTextField().apply {
        emptyText.text = "e.g. com.example.myapp"
        font = font.deriveFont(13f)
    }
    private val detectPackageButton = createStyledButton("🔍 Auto Detect")

    // Status Banner Label
    private val statusIconLabel = JBLabel("ℹ️")
    private val statusTextLabel = JBLabel("Ready").apply {
        font = font.deriveFont(Font.BOLD, 12f)
        foreground = JBColor.GRAY
    }

    // App Control Buttons
    private val restartAppButton = createActionButton("🔄 Restart App", isPrimary = true)
    private val clearDataButton = createActionButton("🧹 Clear App Data")
    private val forceStopButton = createActionButton("🛑 Force Stop")
    private val uninstallAppButton = createActionButton("🗑️ Uninstall App")

    // Device Control Buttons
    private val screenshotButton = createActionButton("📸 Screenshot to Clipboard", isPrimary = true)
    private val toggleDarkModeButton = createActionButton("🌗 Toggle Dark Mode")
    private val toggleLayoutBoundsButton = createActionButton("📐 Toggle Layout Bounds")
    private val toggleAnimationsButton = createActionButton("⚡ Toggle Animations")

    init {
        border = JBUI.Borders.empty(12)
        background = JBColor.namedColor("ToolWindow.background", JBColor(0xF9F9F9, 0x1E1F22))

        val contentPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
        }

        contentPanel.add(createHeaderCard())
        contentPanel.add(Box.createRigidArea(Dimension(0, 12)))
        contentPanel.add(createAppActionsCard())
        contentPanel.add(Box.createRigidArea(Dimension(0, 12)))
        contentPanel.add(createDeviceUtilitiesCard())
        contentPanel.add(Box.createRigidArea(Dimension(0, 12)))
        contentPanel.add(createStatusBanner())

        val scrollPane = JBScrollPane(contentPanel).apply {
            border = JBUI.Borders.empty()
            isOpaque = false
            viewport.isOpaque = false
        }

        add(scrollPane, BorderLayout.CENTER)

        // Event Listeners
        refreshDevicesButton.addActionListener { refreshConnectedDevices() }
        detectPackageButton.addActionListener { autoDetectPackageName() }

        clearDataButton.addActionListener { runAdbTask("Clearing App Data") { deviceId, pkg -> AdbExecutor.getInstance().clearAppData(deviceId, pkg) } }
        restartAppButton.addActionListener { runAdbTask("Restarting App") { deviceId, pkg -> AdbExecutor.getInstance().restartApp(deviceId, pkg) } }
        forceStopButton.addActionListener { runAdbTask("Force Stopping App") { deviceId, pkg -> AdbExecutor.getInstance().forceStopApp(deviceId, pkg) } }
        uninstallAppButton.addActionListener { runAdbTask("Uninstalling App") { deviceId, pkg -> AdbExecutor.getInstance().uninstallApp(deviceId, pkg) } }

        toggleDarkModeButton.addActionListener { runDeviceTask("Toggling Dark Mode") { deviceId -> AdbExecutor.getInstance().toggleDarkMode(deviceId) } }
        toggleLayoutBoundsButton.addActionListener { runDeviceTask("Toggling Layout Bounds") { deviceId -> AdbExecutor.getInstance().toggleLayoutBounds(deviceId) } }
        toggleAnimationsButton.addActionListener { runDeviceTask("Toggling Animations") { deviceId -> AdbExecutor.getInstance().toggleAnimations(deviceId) } }
        screenshotButton.addActionListener { runDeviceTask("Capturing Screenshot") { deviceId -> AdbExecutor.getInstance().captureScreenshotToClipboard(deviceId) } }

        // Initial setup
        refreshConnectedDevices()
        autoDetectPackageName()
    }

    private fun createHeaderCard(): JPanel {
        val card = RoundedPanel()
        card.layout = BorderLayout(0, 10)
        card.border = JBUI.Borders.empty(12)

        val devicePanel = JPanel(BorderLayout(8, 0)).apply {
            isOpaque = false
            add(JBLabel("Target Device:").apply { font = font.deriveFont(Font.BOLD, 12f) }, BorderLayout.NORTH)
            val sub = JPanel(BorderLayout(6, 0)).apply {
                isOpaque = false
                add(deviceComboBox, BorderLayout.CENTER)
                add(refreshDevicesButton, BorderLayout.EAST)
            }
            add(sub, BorderLayout.CENTER)
        }

        val packagePanel = JPanel(BorderLayout(8, 0)).apply {
            isOpaque = false
            add(JBLabel("Package Name:").apply { font = font.deriveFont(Font.BOLD, 12f) }, BorderLayout.NORTH)
            val sub = JPanel(BorderLayout(6, 0)).apply {
                isOpaque = false
                add(packageNameField, BorderLayout.CENTER)
                add(detectPackageButton, BorderLayout.EAST)
            }
            add(sub, BorderLayout.CENTER)
        }

        val container = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(devicePanel)
            add(Box.createRigidArea(Dimension(0, 10)))
            add(packagePanel)
        }

        card.add(container, BorderLayout.CENTER)
        return card
    }

    private fun createAppActionsCard(): JPanel {
        val card = RoundedPanel()
        card.layout = BorderLayout(0, 10)
        card.border = JBUI.Borders.empty(12)

        val title = JBLabel("📱 App Management").apply {
            font = font.deriveFont(Font.BOLD, 13f)
            foreground = JBColor.namedColor("Label.foreground", JBColor.BLACK)
        }

        val grid = JPanel(GridLayout(2, 2, 8, 8)).apply {
            isOpaque = false
            add(restartAppButton)
            add(clearDataButton)
            add(forceStopButton)
            add(uninstallAppButton)
        }

        card.add(title, BorderLayout.NORTH)
        card.add(grid, BorderLayout.CENTER)
        return card
    }

    private fun createDeviceUtilitiesCard(): JPanel {
        val card = RoundedPanel()
        card.layout = BorderLayout(0, 10)
        card.border = JBUI.Borders.empty(12)

        val title = JBLabel("🛠️ Device Quick Tools").apply {
            font = font.deriveFont(Font.BOLD, 13f)
            foreground = JBColor.namedColor("Label.foreground", JBColor.BLACK)
        }

        val grid = JPanel(GridLayout(2, 2, 8, 8)).apply {
            isOpaque = false
            add(screenshotButton)
            add(toggleDarkModeButton)
            add(toggleLayoutBoundsButton)
            add(toggleAnimationsButton)
        }

        card.add(title, BorderLayout.NORTH)
        card.add(grid, BorderLayout.CENTER)
        return card
    }

    private fun createStatusBanner(): JPanel {
        val card = RoundedPanel(radius = 8, bgColor = JBColor.namedColor("Editor.background", JBColor(0xEEEEEE, 0x2B2D30)))
        card.layout = FlowLayout(FlowLayout.LEFT, 8, 8)
        card.border = JBUI.Borders.empty(2, 6)

        card.add(statusIconLabel)
        card.add(statusTextLabel)
        return card
    }

    private fun refreshConnectedDevices() {
        deviceComboBox.removeAllItems()
        setStatus("⏳", "Scanning connected devices...", Color.GRAY)

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Scanning Connected Devices", false) {
            override fun run(indicator: ProgressIndicator) {
                val devices = AdbExecutor.getInstance().getConnectedDevices()
                ApplicationManager.getApplication().invokeLater {
                    deviceComboBox.removeAllItems()
                    if (devices.isEmpty()) {
                        setStatus("✕", "No devices or emulators found.", JBColor.RED)
                    } else {
                        devices.forEach { deviceComboBox.addItem(it) }
                        setStatus("✓", "Found ${devices.size} connected device(s).", JBColor.GREEN)
                    }
                }
            }
        })
    }

    private fun autoDetectPackageName() {
        val baseDir = project.baseDir ?: return
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Detecting App Package Name", false) {
            override fun run(indicator: ProgressIndicator) {
                val detectedPackage = scanPackageName(baseDir)
                if (!detectedPackage.isNullOrBlank()) {
                    ApplicationManager.getApplication().invokeLater {
                        packageNameField.text = detectedPackage
                    }
                }
            }
        })
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
            setStatus("✕", "Please connect a device/emulator first.", JBColor.RED)
            return null
        }
        return selectedDevice.id
    }

    private fun getTargetPackageName(): String? {
        val pkg = packageNameField.text.trim()
        if (pkg.isBlank()) {
            setStatus("✕", "Please enter or auto-detect a Package Name first.", JBColor.RED)
            return null
        }
        return pkg
    }

    private fun runAdbTask(title: String, action: (String, String) -> Result<String>) {
        val deviceId = getSelectedDeviceId() ?: return
        val packageName = getTargetPackageName() ?: return

        setStatus("⏳", "Executing $title...", Color.GRAY)

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, title, false) {
            override fun run(indicator: ProgressIndicator) {
                val result = action(deviceId, packageName)
                ApplicationManager.getApplication().invokeLater {
                    result.fold(
                        onSuccess = {
                            setStatus("✓", "$title Successful!", JBColor.GREEN)
                        },
                        onFailure = { error ->
                            setStatus("✕", "$title Failed: ${error.message}", JBColor.RED)
                        }
                    )
                }
            }
        })
    }

    private fun runDeviceTask(title: String, action: (String) -> Result<String>) {
        val deviceId = getSelectedDeviceId() ?: return

        setStatus("⏳", "Executing $title...", Color.GRAY)

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, title, false) {
            override fun run(indicator: ProgressIndicator) {
                val result = action(deviceId)
                ApplicationManager.getApplication().invokeLater {
                    result.fold(
                        onSuccess = { msg ->
                            setStatus("✓", "$title: $msg", JBColor.GREEN)
                        },
                        onFailure = { error ->
                            setStatus("✕", "$title Failed: ${error.message}", JBColor.RED)
                        }
                    )
                }
            }
        })
    }

    private fun setStatus(icon: String, message: String, color: Color) {
        statusIconLabel.text = icon
        statusTextLabel.text = message
        statusTextLabel.foreground = color
    }

    private fun createStyledButton(text: String): JButton {
        return JButton(text).apply {
            font = font.deriveFont(Font.PLAIN, 12f)
            margin = JBUI.insets(4, 8)
        }
    }

    private fun createActionButton(text: String, isPrimary: Boolean = false): JButton {
        return JButton(text).apply {
            font = font.deriveFont(if (isPrimary) Font.BOLD else Font.PLAIN, 12f)
            margin = JBUI.insets(6, 10)
            isFocusable = false
        }
    }

    /**
     * Custom rounded container panel matching IntelliJ IDE Dark and Light themes.
     */
    private inner class RoundedPanel(
        private val radius: Int = 12,
        private val bgColor: Color = JBColor.namedColor("EditorPanel.background", JBColor(0xF5F5F5, 0x2B2D30))
    ) : JPanel(BorderLayout()) {
        init {
            isOpaque = false
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = bgColor
            g2.fillRoundRect(0, 0, width, height, radius, radius)
            g2.color = JBColor.border()
            g2.drawRoundRect(0, 0, width - 1, height - 1, radius, radius)
            g2.dispose()
            super.paintComponent(g)
        }
    }
}
