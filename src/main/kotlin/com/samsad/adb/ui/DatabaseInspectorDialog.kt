package com.samsad.adb.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import com.samsad.adb.services.AdbExecutor
import com.samsad.adb.services.ColumnInfo
import com.samsad.adb.services.SqlQueryResult
import java.awt.*
import java.awt.event.ActionEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.*
import javax.swing.table.DefaultTableModel

class DatabaseInspectorDialog(
    private val project: Project,
    private val deviceId: String,
    private val packageName: String
) : DialogWrapper(project, true) {

    // Top Bar Selectors
    private val dbComboBox = ComboBox<String>()
    private val tableComboBox = ComboBox<String>()
    private val refreshButton = JButton("🔄 Refresh")

    // Tab 1: Table Data Viewer & Live Editor
    private var currentColumns: List<String> = emptyList()
    private var currentSchema: List<ColumnInfo> = emptyList()
    private var currentTables: List<String> = emptyList()
    private var isUpdatingCell = false

    private val tableModel = object : DefaultTableModel() {
        override fun isCellEditable(row: Int, column: Int): Boolean = true
    }
    private val dataTable = JBTable(tableModel)
    private val tableStatusLabel = JLabel("Ready")
    private val reloadTableButton = JButton("🔄 Reload")
    private val addRowButton = JButton("➕ Insert Row")
    private val deleteRowButton = JButton("🗑️ Delete Row")

    // Tab 2: SQL Query Simulator
    private val sqlQueryArea = JBTextArea().apply {
        font = Font(Font.MONOSPACED, Font.PLAIN, 13)
        rows = 4
        emptyText.text = "Enter SQL query (e.g. SELECT * FROM users WHERE id = 1)... Press Cmd/Ctrl+Enter to execute"
    }
    private val executeButton = JButton("▶  Execute SQL")
    private val quickSelectButton = JButton("SELECT *")
    private val quickCountButton = JButton("COUNT(*)")
    private val queryStatusLabel = JLabel("Ready")
    private val queryResultModel = DefaultTableModel()
    private val queryResultTable = JBTable(queryResultModel)

    init {
        title = "🗄️ SQLite Database Inspector & Query Simulator — $packageName"
        init()
        loadDatabases()
    }

    override fun createCenterPanel(): JComponent {
        val rootPanel = JPanel(BorderLayout(0, 10)).apply {
            preferredSize = Dimension(820, 520)
            border = JBUI.Borders.empty(8)
        }

        // Top selection bar
        val topBar = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4)).apply {
            border = JBUI.Borders.customLine(JBColor.border(), 0, 0, 1, 0)
            add(JLabel("Database:").apply { font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD) })
            dbComboBox.preferredSize = Dimension(200, 30)
            add(dbComboBox)

            add(Box.createHorizontalStrut(8))
            add(JLabel("Table:").apply { font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD) })
            tableComboBox.preferredSize = Dimension(180, 30)
            add(tableComboBox)

            add(Box.createHorizontalStrut(8))
            add(refreshButton)
        }
        rootPanel.add(topBar, BorderLayout.NORTH)

        // Main Tabbed Pane
        val tabbedPane = JBTabbedPane()
        tabbedPane.addTab("📊 Table Data & Live Editor", createTableDataTab())
        tabbedPane.addTab("⚡ SQL Query Simulator", createSqlSimulatorTab())
        rootPanel.add(tabbedPane, BorderLayout.CENTER)

        // Event listeners
        dbComboBox.addActionListener {
            val selectedDb = dbComboBox.selectedItem as? String
            if (selectedDb != null && !selectedDb.startsWith("No ")) {
                loadTables(selectedDb)
            }
        }

        tableComboBox.addActionListener {
            val selectedDb = dbComboBox.selectedItem as? String
            val selectedTable = tableComboBox.selectedItem as? String
            // Match against the real table list: the combo also holds status placeholders
            // ("Loading...", "No tables found") that must never be queried.
            if (selectedDb != null && selectedTable != null && selectedTable in currentTables) {
                loadTableData(selectedDb, selectedTable)
            }
        }

        refreshButton.addActionListener {
            loadDatabases()
        }

        return rootPanel
    }

    private fun createTableDataTab(): JComponent {
        val panel = JPanel(BorderLayout(0, 8)).apply {
            border = JBUI.Borders.empty(6)
        }

        // Action Toolbar
        val toolBar = JPanel(BorderLayout(8, 0)).apply {
            val actions = JPanel(FlowLayout(FlowLayout.LEFT, 6, 0)).apply {
                add(reloadTableButton)
                add(addRowButton)
                add(deleteRowButton)
            }
            add(actions, BorderLayout.WEST)
            tableStatusLabel.font = JBUI.Fonts.label(11f)
            tableStatusLabel.foreground = JBColor.namedColor("Label.infoForeground", JBColor(0x555555, 0xAAAAAA))
            add(tableStatusLabel, BorderLayout.EAST)
        }
        panel.add(toolBar, BorderLayout.NORTH)

        // Data Table
        dataTable.setSelectionMode(ListSelectionModel.SINGLE_SELECTION)
        dataTable.rowHeight = 26
        dataTable.font = JBUI.Fonts.label(12f)
        dataTable.tableHeader.font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD)
        dataTable.autoResizeMode = JTable.AUTO_RESIZE_OFF

        // Inline Cell Editing Listener
        tableModel.addTableModelListener { e ->
            if (isUpdatingCell) return@addTableModelListener
            val row = e.firstRow
            val col = e.column
            if (row >= 0 && col >= 0 && row < tableModel.rowCount && col < currentColumns.size) {
                val selectedDb = dbComboBox.selectedItem as? String ?: return@addTableModelListener
                val selectedTable = tableComboBox.selectedItem as? String ?: return@addTableModelListener
                val targetCol = currentColumns[col]
                val newVal = tableModel.getValueAt(row, col)?.toString() ?: ""

                // Determine primary key column
                val pkInfo = currentSchema.firstOrNull { it.isPrimaryKey }
                val pkCol = pkInfo?.name ?: currentColumns.firstOrNull() ?: return@addTableModelListener
                val pkIndex = currentColumns.indexOf(pkCol)
                val pkVal = if (pkIndex >= 0) tableModel.getValueAt(row, pkIndex)?.toString() ?: "" else ""

                if (pkVal.isNotBlank()) {
                    performCellUpdate(selectedDb, selectedTable, pkCol, pkVal, targetCol, newVal)
                }
            }
        }

        val scrollPane = JBScrollPane(dataTable).apply {
            border = JBUI.Borders.customLine(JBColor.border())
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED
        }
        panel.add(scrollPane, BorderLayout.CENTER)

        reloadTableButton.addActionListener {
            val selectedDb = dbComboBox.selectedItem as? String
            val selectedTable = tableComboBox.selectedItem as? String
            if (selectedDb != null && selectedTable != null) {
                loadTableData(selectedDb, selectedTable)
            }
        }

        addRowButton.addActionListener {
            val selectedDb = dbComboBox.selectedItem as? String ?: return@addActionListener
            val selectedTable = tableComboBox.selectedItem as? String ?: return@addActionListener
            if (currentColumns.isEmpty()) return@addActionListener

            // Prompt simple default insert
            val result = AdbExecutor.getInstance().executeSqlQuery(
                deviceId,
                packageName,
                selectedDb,
                "INSERT INTO `$selectedTable` DEFAULT VALUES;"
            )
            result.fold(
                onSuccess = {
                    tableStatusLabel.text = "✓ Inserted new row"
                    loadTableData(selectedDb, selectedTable)
                },
                onFailure = { error ->
                    Messages.showErrorDialog(project, "Insert failed: ${error.message}", "Insert Error")
                }
            )
        }

        deleteRowButton.addActionListener {
            val selectedRow = dataTable.selectedRow
            if (selectedRow == -1) {
                Messages.showWarningDialog(project, "Please select a row to delete.", "Delete Row")
                return@addActionListener
            }
            val selectedDb = dbComboBox.selectedItem as? String ?: return@addActionListener
            val selectedTable = tableComboBox.selectedItem as? String ?: return@addActionListener

            val pkInfo = currentSchema.firstOrNull { it.isPrimaryKey }
            val pkCol = pkInfo?.name ?: currentColumns.firstOrNull() ?: return@addActionListener
            val pkIndex = currentColumns.indexOf(pkCol)
            val pkVal = if (pkIndex >= 0) tableModel.getValueAt(selectedRow, pkIndex)?.toString() ?: "" else ""

            if (pkVal.isBlank()) {
                Messages.showWarningDialog(project, "Cannot delete row: unable to identify primary key value.", "Delete Failed")
                return@addActionListener
            }

            val confirm = Messages.showYesNoDialog(
                project,
                "Are you sure you want to delete row where `$pkCol` = '$pkVal'?",
                "Confirm Delete",
                Messages.getQuestionIcon()
            )
            if (confirm == Messages.YES) {
                val res = AdbExecutor.getInstance().deleteTableRow(deviceId, packageName, selectedDb, selectedTable, pkCol, pkVal)
                res.fold(
                    onSuccess = {
                        tableStatusLabel.text = "✓ Row deleted"
                        loadTableData(selectedDb, selectedTable)
                    },
                    onFailure = { err ->
                        Messages.showErrorDialog(project, "Delete failed: ${err.message}", "Delete Error")
                    }
                )
            }
        }

        return panel
    }

    private fun createSqlSimulatorTab(): JComponent {
        val panel = JPanel(BorderLayout(0, 8)).apply {
            border = JBUI.Borders.empty(6)
        }

        // Query input box
        val inputContainer = JPanel(BorderLayout(0, 4)).apply {
            val scrollArea = JBScrollPane(sqlQueryArea).apply {
                preferredSize = Dimension(preferredSize.width, 90)
                border = JBUI.Borders.customLine(JBColor.border())
            }
            add(scrollArea, BorderLayout.CENTER)

            val queryButtons = JPanel(BorderLayout()).apply {
                val presets = JPanel(FlowLayout(FlowLayout.LEFT, 6, 0)).apply {
                    add(quickSelectButton)
                    add(quickCountButton)
                }
                add(presets, BorderLayout.WEST)

                val rightActions = JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0)).apply {
                    add(executeButton)
                }
                add(rightActions, BorderLayout.EAST)
            }
            add(queryButtons, BorderLayout.SOUTH)
        }
        panel.add(inputContainer, BorderLayout.NORTH)

        // Results Table & Status
        val resultsContainer = JPanel(BorderLayout(0, 4)).apply {
            queryStatusLabel.font = JBUI.Fonts.label(11f)
            queryStatusLabel.foreground = JBColor.namedColor("Label.infoForeground", JBColor(0x555555, 0xAAAAAA))
            add(queryStatusLabel, BorderLayout.NORTH)

            queryResultTable.setSelectionMode(ListSelectionModel.SINGLE_SELECTION)
            queryResultTable.rowHeight = 24
            queryResultTable.font = JBUI.Fonts.label(12f)
            queryResultTable.tableHeader.font = JBUI.Fonts.label(12f).deriveFont(Font.BOLD)
            queryResultTable.autoResizeMode = JTable.AUTO_RESIZE_OFF

            val scrollResults = JBScrollPane(queryResultTable).apply {
                border = JBUI.Borders.customLine(JBColor.border())
            }
            add(scrollResults, BorderLayout.CENTER)
        }
        panel.add(resultsContainer, BorderLayout.CENTER)

        // Shortcut & Listeners
        sqlQueryArea.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if ((e.isMetaDown || e.isControlDown) && e.keyCode == KeyEvent.VK_ENTER) {
                    runSelectedSqlQuery()
                    e.consume()
                }
            }
        })

        executeButton.addActionListener { runSelectedSqlQuery() }

        quickSelectButton.addActionListener {
            val table = tableComboBox.selectedItem as? String ?: "users"
            sqlQueryArea.text = "SELECT * FROM `$table` LIMIT 50;"
            runSelectedSqlQuery()
        }

        quickCountButton.addActionListener {
            val table = tableComboBox.selectedItem as? String ?: "users"
            sqlQueryArea.text = "SELECT count(*) AS total_rows FROM `$table`;"
            runSelectedSqlQuery()
        }

        return panel
    }

    private fun loadDatabases() {
        dbComboBox.removeAllItems()
        tableComboBox.removeAllItems()
        val dbs = AdbExecutor.getInstance().getDatabaseFiles(deviceId, packageName)
        if (dbs.isEmpty()) {
            dbComboBox.addItem("No SQLite databases found")
            dbComboBox.isEnabled = false
            tableComboBox.isEnabled = false
        } else {
            dbComboBox.isEnabled = true
            dbs.forEach { dbComboBox.addItem(it) }
            loadTables(dbs.first())
        }
    }

    private fun loadTables(dbName: String) {
        tableComboBox.removeAllItems()
        tableComboBox.isEnabled = false
        tableComboBox.addItem("Loading...")
        tableStatusLabel.text = "⏳ Reading `$dbName`..."

        // Reading tables copies the database off the device, which is far too slow for the EDT.
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Reading Database", false) {
            override fun run(indicator: ProgressIndicator) {
                val result = AdbExecutor.getInstance().getDatabaseTablesResult(deviceId, packageName, dbName)
                ApplicationManager.getApplication().invokeLater {
                    currentTables = result.getOrDefault(emptyList())
                    tableComboBox.removeAllItems()
                    result.fold(
                        onSuccess = { tables ->
                            if (tables.isEmpty()) {
                                tableComboBox.addItem("No tables found")
                                tableComboBox.isEnabled = false
                                clearTable()
                                tableStatusLabel.text = "ℹ️ `$dbName` has no user tables"
                            } else {
                                tableComboBox.isEnabled = true
                                tables.forEach { tableComboBox.addItem(it) }
                                loadTableData(dbName, tables.first())
                            }
                        },
                        onFailure = { error ->
                            // Previously any failure looked identical to an empty database.
                            tableComboBox.addItem("Could not read database")
                            tableComboBox.isEnabled = false
                            clearTable()
                            tableStatusLabel.text = "✕ ${error.message?.take(80)}"
                        }
                    )
                }
            }
        })
    }

    private fun loadTableData(dbName: String, tableName: String) {
        tableStatusLabel.text = "⏳ Loading `$tableName`..."
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Loading Table Data", false) {
            override fun run(indicator: ProgressIndicator) {
                val schema = AdbExecutor.getInstance().getTableSchema(deviceId, packageName, dbName, tableName)
                val result = AdbExecutor.getInstance().executeSqlQuery(
                    deviceId,
                    packageName,
                    dbName,
                    "SELECT * FROM `$tableName` LIMIT 100;"
                )
                ApplicationManager.getApplication().invokeLater {
                    currentSchema = schema
                    result.fold(
                        onSuccess = { queryResult ->
                            renderTableData(queryResult)
                            tableStatusLabel.text = "✓ Showing ${queryResult.rows.size} rows in `$tableName`"
                        },
                        onFailure = { error ->
                            tableStatusLabel.text = "✕ Failed to load: ${error.message?.take(40)}"
                        }
                    )
                }
            }
        })
    }

    private fun renderTableData(queryResult: SqlQueryResult) {
        isUpdatingCell = true
        currentColumns = queryResult.columns
        tableModel.setColumnIdentifiers(queryResult.columns.toTypedArray())
        tableModel.rowCount = 0

        for (row in queryResult.rows) {
            tableModel.addRow(row.toTypedArray())
        }
        isUpdatingCell = false
    }

    private fun clearTable() {
        isUpdatingCell = true
        tableModel.setColumnIdentifiers(arrayOf<String>())
        tableModel.rowCount = 0
        isUpdatingCell = false
    }

    private fun performCellUpdate(
        dbName: String,
        tableName: String,
        pkCol: String,
        pkVal: String,
        targetCol: String,
        newVal: String
    ) {
        tableStatusLabel.text = "⏳ Updating `$targetCol`..."
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Updating Cell", false) {
            override fun run(indicator: ProgressIndicator) {
                val res = AdbExecutor.getInstance().updateTableCell(
                    deviceId, packageName, dbName, tableName, pkCol, pkVal, targetCol, newVal
                )
                ApplicationManager.getApplication().invokeLater {
                    res.fold(
                        onSuccess = { msg ->
                            tableStatusLabel.text = "✓ $msg"
                        },
                        onFailure = { error ->
                            tableStatusLabel.text = "✕ Update failed: ${error.message?.take(50)}"
                            Messages.showErrorDialog(project, "Failed to update cell: ${error.message}", "Update Error")
                        }
                    )
                }
            }
        })
    }

    private fun runSelectedSqlQuery() {
        val selectedDb = dbComboBox.selectedItem as? String
        if (selectedDb.isNullOrBlank() || selectedDb.startsWith("No ")) {
            queryStatusLabel.text = "✕ Please select a valid database first"
            return
        }
        val sql = sqlQueryArea.text.trim()
        if (sql.isBlank()) {
            queryStatusLabel.text = "✕ Please enter a SQL statement"
            return
        }

        queryStatusLabel.text = "⏳ Executing SQL..."
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Executing SQL Query", false) {
            override fun run(indicator: ProgressIndicator) {
                val startTime = System.currentTimeMillis()
                val result = AdbExecutor.getInstance().executeSqlQuery(deviceId, packageName, selectedDb, sql)
                val duration = System.currentTimeMillis() - startTime

                ApplicationManager.getApplication().invokeLater {
                    result.fold(
                        onSuccess = { qRes ->
                            if (qRes.isQuery && qRes.columns.isNotEmpty()) {
                                queryResultModel.setColumnIdentifiers(qRes.columns.toTypedArray())
                                queryResultModel.rowCount = 0
                                qRes.rows.forEach { queryResultModel.addRow(it.toTypedArray()) }
                                queryStatusLabel.text = "✓ ${qRes.rows.size} row(s) returned (${duration}ms)"
                            } else {
                                queryResultModel.setColumnIdentifiers(arrayOf<String>())
                                queryResultModel.rowCount = 0
                                queryStatusLabel.text = "✓ ${qRes.message ?: "Query executed successfully"} (${duration}ms)"
                            }

                            // If it modified data, also refresh the current active table tab
                            val selectedTable = tableComboBox.selectedItem as? String
                            if (selectedTable != null && !selectedTable.startsWith("No ")) {
                                loadTableData(selectedDb, selectedTable)
                            }
                        },
                        onFailure = { error ->
                            queryStatusLabel.text = "✕ Execution error (${duration}ms)"
                            Messages.showErrorDialog(project, "SQL Error: ${error.message}", "Query Execution Failed")
                        }
                    )
                }
            }
        })
    }

    override fun createActions(): Array<Action> {
        val saveAndRestartAction = object : AbstractAction("⚡ Save & Restart App") {
            override fun actionPerformed(e: ActionEvent?) {
                AdbExecutor.getInstance().restartApp(deviceId, packageName)
                Messages.showInfoMessage(project, "App restarted successfully with updated database!", "Restarted")
                close(OK_EXIT_CODE)
            }
        }

        return arrayOf(saveAndRestartAction, cancelAction)
    }
}
