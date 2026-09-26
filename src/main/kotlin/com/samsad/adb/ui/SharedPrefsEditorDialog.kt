package com.samsad.adb.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import com.samsad.adb.services.AdbExecutor
import com.samsad.adb.services.PrefEntry
import com.samsad.adb.services.SharedPrefsXmlHelper
import java.awt.*
import java.awt.event.ActionEvent
import javax.swing.*
import javax.swing.table.DefaultTableModel

class SharedPrefsEditorDialog(
    private val project: Project,
    private val deviceId: String,
    private val packageName: String
) : DialogWrapper(project, true) {

    private val fileComboBox = ComboBox<String>()
    private val reloadButton = JButton("🔄 Reload")
    private val addRowButton = JButton("➕ Add Key")
    private val deleteRowButton = JButton("🗑️ Delete Selected")

    private val tableModel = object : DefaultTableModel(arrayOf("Key", "Type", "Value"), 0) {
        override fun isCellEditable(row: Int, column: Int): Boolean = true
    }
    private val table = JBTable(tableModel)

    init {
        title = "📝 SharedPreferences Live Editor — $packageName"
        init()
        loadFiles()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(BorderLayout(0, 10)).apply {
            preferredSize = Dimension(650, 420)
            border = JBUI.Borders.empty(8)
        }

        // Top bar
        val topBar = JPanel(BorderLayout(8, 0)).apply {
            val label = JLabel("Select File:").apply {
                font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD)
            }
            add(label, BorderLayout.WEST)
            add(fileComboBox, BorderLayout.CENTER)
            add(reloadButton, BorderLayout.EAST)
        }
        panel.add(topBar, BorderLayout.NORTH)

        // Table setup
        table.setSelectionMode(ListSelectionModel.SINGLE_SELECTION)
        table.rowHeight = 28
        table.font = JBUI.Fonts.label(12f)
        table.tableHeader.font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD)

        // Type column combo box editor
        val typeComboBox = JComboBox(arrayOf("string", "boolean", "int", "long", "float", "set"))
        table.columnModel.getColumn(1).cellEditor = DefaultCellEditor(typeComboBox)
        table.columnModel.getColumn(1).preferredWidth = 90
        table.columnModel.getColumn(1).maxWidth = 110
        table.columnModel.getColumn(0).preferredWidth = 200

        val scrollPane = JBScrollPane(table).apply {
            border = JBUI.Borders.customLine(JBColor.border())
        }
        panel.add(scrollPane, BorderLayout.CENTER)

        // Bottom table action buttons
        val bottomActions = JPanel(FlowLayout(FlowLayout.LEFT, 6, 0)).apply {
            add(addRowButton)
            add(deleteRowButton)
        }
        panel.add(bottomActions, BorderLayout.SOUTH)

        // Event listeners
        fileComboBox.addActionListener {
            val selectedFile = fileComboBox.selectedItem as? String
            if (selectedFile != null) {
                loadFileContent(selectedFile)
            }
        }

        reloadButton.addActionListener {
            val selectedFile = fileComboBox.selectedItem as? String
            if (selectedFile != null) {
                loadFileContent(selectedFile)
            } else {
                loadFiles()
            }
        }

        addRowButton.addActionListener {
            tableModel.addRow(arrayOf("new_key_" + (tableModel.rowCount + 1), "string", "value"))
            val lastRow = tableModel.rowCount - 1
            table.setRowSelectionInterval(lastRow, lastRow)
        }

        deleteRowButton.addActionListener {
            val selected = table.selectedRow
            if (selected != -1) {
                tableModel.removeRow(selected)
            }
        }

        return panel
    }

    private fun loadFiles() {
        fileComboBox.removeAllItems()
        val files = AdbExecutor.getInstance().getSharedPrefsFiles(deviceId, packageName)
        if (files.isEmpty()) {
            fileComboBox.addItem("No SharedPreferences files found")
            fileComboBox.isEnabled = false
        } else {
            fileComboBox.isEnabled = true
            files.forEach { fileComboBox.addItem(it) }
            loadFileContent(files.first())
        }
    }

    private fun loadFileContent(fileName: String) {
        tableModel.rowCount = 0
        val xmlResult = AdbExecutor.getInstance().readSharedPrefsXml(deviceId, packageName, fileName)
        xmlResult.onSuccess { xml ->
            val entries = SharedPrefsXmlHelper.parseXml(xml)
            entries.forEach { entry ->
                tableModel.addRow(arrayOf(entry.key, entry.type, entry.value))
            }
        }.onFailure { error ->
            Messages.showErrorDialog(project, "Failed to read $fileName: ${error.message}", "Error Loading XML")
        }
    }

    private fun getEntriesFromTable(): List<PrefEntry> {
        // Stop any active cell edit
        if (table.isEditing) {
            table.cellEditor?.stopCellEditing()
        }
        val list = mutableListOf<PrefEntry>()
        for (i in 0 until tableModel.rowCount) {
            val key = tableModel.getValueAt(i, 0)?.toString() ?: ""
            val type = tableModel.getValueAt(i, 1)?.toString() ?: "string"
            val value = tableModel.getValueAt(i, 2)?.toString() ?: ""
            if (key.isNotBlank()) {
                list.add(PrefEntry(key, type, value))
            }
        }
        return list
    }

    private fun saveCurrentFile(): Boolean {
        val selectedFile = fileComboBox.selectedItem as? String
        if (selectedFile.isNullOrBlank() || selectedFile.startsWith("No ")) {
            Messages.showWarningDialog(project, "No valid SharedPreferences file selected.", "Save Failed")
            return false
        }

        val entries = getEntriesFromTable()
        val xml = SharedPrefsXmlHelper.serializeXml(entries)
        val result = AdbExecutor.getInstance().writeSharedPrefsXml(deviceId, packageName, selectedFile, xml)

        return result.fold(
            onSuccess = {
                true
            },
            onFailure = { error ->
                Messages.showErrorDialog(project, "Failed to save: ${error.message}", "Save Error")
                false
            }
        )
    }

    override fun createActions(): Array<Action> {
        val saveAction = object : AbstractAction("💾 Save to Device") {
            override fun actionPerformed(e: ActionEvent?) {
                if (saveCurrentFile()) {
                    Messages.showInfoMessage(project, "Changes saved to device successfully!", "Saved")
                }
            }
        }

        val saveAndRestartAction = object : AbstractAction("⚡ Save & Restart App") {
            override fun actionPerformed(e: ActionEvent?) {
                if (saveCurrentFile()) {
                    AdbExecutor.getInstance().restartApp(deviceId, packageName)
                    Messages.showInfoMessage(project, "Saved and app restarted!", "Saved & Restarted")
                    close(OK_EXIT_CODE)
                }
            }
        }

        return arrayOf(saveAction, saveAndRestartAction, cancelAction)
    }
}
