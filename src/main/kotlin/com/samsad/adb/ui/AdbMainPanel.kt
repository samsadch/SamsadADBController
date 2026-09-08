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

class AdbMainPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val deviceComboBox = ComboBox<AdbDevice>().apply {
        font = JBUI.Fonts.label(12f)
        preferredSize = Dimension(preferredSize.width, 34)
        minimumSize = Dimension(120, 34)
        maximumSize = Dimension(Int.MAX_VALUE, 34)
    }

    private val refreshDevicesButton = ModernButton("🔄", cornerRadius = 6).apply {
        toolTipText = "Refresh connected devices"
        preferredSize = Dimension(40, 34)
        minimumSize = Dimension(40, 34)
        maximumSize = Dimension(40, 34)
    }

    private val packageNameField = JBTextField().apply {
        emptyText.text = "com.example.android.myapp"
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
    private val forceStopButton = ModernButton("🛑  Force Stop")
    private val uninstallAppButton = ModernButton("🗑️  Uninstall App")

    // Device Control Buttons
    private val screenshotButton = ModernButton("📸  Screenshot to Clipboard")
    private val toggleDarkModeButton = ModernButton("🌗  Toggle Dark Mode")
    private val toggleLayoutBoundsButton = ModernButton("📐  Toggle Layout Bounds")
    private val toggleAnimationsButton = ModernButton("⚡  Toggle Animations")

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
        contentPanel.add(Box.createRigidArea(Dimension(0, 14)))

        // Section 1: App Management
        val appGrid = JPanel(GridLayout(2, 2, 8, 8)).apply {
            isOpaque = false
            add(restartAppButton)
            add(clearDataButton)
            add(forceStopButton)
            add(uninstallAppButton)
        }
        contentPanel.add(SectionCard("1. App Management", appGrid))
        contentPanel.add(Box.createRigidArea(Dimension(0, 14)))

        // Section 2: Device Quick Tools
        val deviceGrid = JPanel(GridLayout(2, 2, 8, 8)).apply {
            isOpaque = false
            add(screenshotButton)
            add(toggleDarkModeButton)
            add(toggleLayoutBoundsButton)
            add(toggleAnimationsButton)
        }
        contentPanel.add(SectionCard("2. Device Quick Tools", deviceGrid))
        contentPanel.add(Box.createRigidArea(Dimension(0, 14)))

        // Status badge row
        val statusRow = JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
            isOpaque = false
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

        clearDataButton.addActionListener { runAdbTask("Clear App Data") { deviceId, pkg -> AdbExecutor.getInstance().clearAppData(deviceId, pkg) } }
        restartAppButton.addActionListener { runAdbTask("Restart App") { deviceId, pkg -> AdbExecutor.getInstance().restartApp(deviceId, pkg) } }
        forceStopButton.addActionListener { runAdbTask("Force Stop") { deviceId, pkg -> AdbExecutor.getInstance().forceStopApp(deviceId, pkg) } }
        uninstallAppButton.addActionListener { runAdbTask("Uninstall App") { deviceId, pkg -> AdbExecutor.getInstance().uninstallApp(deviceId, pkg) } }

        toggleDarkModeButton.addActionListener { runDeviceTask("Toggle Dark Mode") { deviceId -> AdbExecutor.getInstance().toggleDarkMode(deviceId) } }
        toggleLayoutBoundsButton.addActionListener { runDeviceTask("Toggle Layout Bounds") { deviceId -> AdbExecutor.getInstance().toggleLayoutBounds(deviceId) } }
        toggleAnimationsButton.addActionListener { runDeviceTask("Toggle Animations") { deviceId -> AdbExecutor.getInstance().toggleAnimations(deviceId) } }
        screenshotButton.addActionListener { runDeviceTask("Screenshot") { deviceId -> AdbExecutor.getInstance().captureScreenshotToClipboard(deviceId) } }

        // Initial setup
        refreshConnectedDevices()
        autoDetectPackageName()
    }

    private fun createInputSection(): JPanel {
        val container = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
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
            add(packageNameField, BorderLayout.CENTER)
            add(detectPackageButton, BorderLayout.EAST)
        }

        container.add(deviceLabel)
        container.add(Box.createRigidArea(Dimension(0, 6)))
        container.add(deviceRow)
        container.add(Box.createRigidArea(Dimension(0, 10)))
        container.add(packageLabel)
        container.add(Box.createRigidArea(Dimension(0, 6)))
        container.add(packageRow)

        return container
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
                    }
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
            statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ Please connect a device/emulator first")
            return null
        }
        return selectedDevice.id
    }

    private fun getTargetPackageName(): String? {
        val pkg = packageNameField.text.trim()
        if (pkg.isBlank()) {
            statusBadge.setStatus(StatusBadge.StatusType.ERROR, "✕ Please enter or detect a Package Name first")
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
     * Modern rounded interactive button with hover states and crisp borders.
     */
    private class ModernButton(
        text: String,
        private val cornerRadius: Int = 8
    ) : JButton(text) {
        private var isHovered = false
        private var isPressedState = false

        init {
            isContentAreaFilled = false
            isFocusPainted = false
            isBorderPainted = false
            isOpaque = false
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            font = JBUI.Fonts.label(12f).deriveFont(Font.PLAIN)
            foreground = JBColor.namedColor("Button.foreground", JBColor(0x222222, 0xDFE1E5))
            margin = JBUI.insets(6, 10)
            preferredSize = Dimension(preferredSize.width, 38)
            minimumSize = Dimension(40, 38)
            maximumSize = Dimension(Int.MAX_VALUE, 38)

            addMouseListener(object : MouseAdapter() {
                override fun mouseEntered(e: MouseEvent?) {
                    isHovered = true
                    repaint()
                }

                override fun mouseExited(e: MouseEvent?) {
                    isHovered = false
                    repaint()
                }

                override fun mousePressed(e: MouseEvent?) {
                    isPressedState = true
                    repaint()
                }

                override fun mouseReleased(e: MouseEvent?) {
                    isPressedState = false
                    repaint()
                }
            })
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)

            val bg = when {
                !isEnabled -> JBColor(0xEEEEEE, 0x2A2C2F)
                isPressedState -> JBColor(0xDFE1E5, 0x222426)
                isHovered -> JBColor(0xEBEDF0, 0x3E4147)
                else -> JBColor(0xFFFFFF, 0x32353A)
            }

            val border = when {
                isHovered -> JBColor(0x9CA3AF, 0x5C616B)
                else -> JBColor(0xD1D5DB, 0x3E4249)
            }

            // Background
            g2.color = bg
            g2.fillRoundRect(0, 0, width - 1, height - 1, cornerRadius, cornerRadius)

            // Border
            g2.color = border
            g2.stroke = BasicStroke(1f)
            g2.drawRoundRect(0, 0, width - 1, height - 1, cornerRadius, cornerRadius)

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

