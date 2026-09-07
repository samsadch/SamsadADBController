package com.samsad.adb.ui

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

/**
 * Creates the Samsad ADB tool window on the IDE sidebar.
 */
class AdbToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val mainPanel = AdbMainPanel(project)
        val content = ContentFactory.getInstance().createContent(mainPanel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}
