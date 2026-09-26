package com.samsad.adb.ui

import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*

/**
 * Modern rounded interactive button with hover states and crisp borders.
 */
class ModernButton(
    text: String = "",
    icon: Icon? = null,
    private val cornerRadius: Int = 8
) : JButton(text, icon) {
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
        if (icon != null && text.isEmpty()) {
            iconTextGap = 0
            horizontalAlignment = SwingConstants.CENTER
        }
        preferredSize = Dimension(preferredSize.width, 38)
        minimumSize = Dimension(38, 38)
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
