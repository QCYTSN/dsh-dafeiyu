import AppKit

/// Content view: draws the pet + status card and handles mouse interactions.
/// Uses a flipped coordinate system (top-left origin) to match the original
/// Qt helper's drawing math.
final class PetView: NSView {
    weak var controller: PetController?

    /// Mouse-to-window grab offset, captured at mouseDown, used for 1:1 drag.
    private var grabOffset: NSPoint?
    private var windowOrigin: NSPoint?

    override var isFlipped: Bool { true }
    override var acceptsFirstResponder: Bool { true }

    override func mouseDown(with event: NSEvent) {
        guard let window = window else { return }
        windowOrigin = window.frame.origin
        let mouse = NSEvent.mouseLocation
        grabOffset = NSPoint(x: mouse.x - window.frame.origin.x,
                             y: mouse.y - window.frame.origin.y)
    }

    override func mouseDragged(with event: NSEvent) {
        guard let grabOffset = grabOffset,
              let windowOrigin = windowOrigin,
              let window = window else { return }
        // Use absolute screen coordinates so the drag tracks the cursor 1:1.
        // View-relative deltas would fight the moving window and feel laggy.
        let mouse = NSEvent.mouseLocation
        let newOrigin = NSPoint(x: mouse.x - grabOffset.x,
                                y: mouse.y - grabOffset.y)
        if !(controller?.dragging ?? false) {
            let manhattan = abs(newOrigin.x - windowOrigin.x)
                + abs(newOrigin.y - windowOrigin.y)
            if manhattan <= 5 { return }
            controller?.beginDrag()
        }
        window.setFrameOrigin(newOrigin)
        controller?.updateDrag()
    }

    override func mouseUp(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let clickCount = event.clickCount
        let wasDragging = controller?.dragging ?? false
        grabOffset = nil
        windowOrigin = nil
        if wasDragging {
            controller?.endDrag()
        } else {
            controller?.handleClick(at: point, clickCount: clickCount)
        }
    }

    override func rightMouseDown(with event: NSEvent) {
        controller?.showMenu(with: event)
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let controller = controller else { return }
        controller.drawPet(in: self)
        controller.drawCard(in: self)
    }
}
