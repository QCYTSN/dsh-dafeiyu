import CoreGraphics

enum PetGeometry {
    /// Visible task text and hit targets share the same top-left view geometry.
    static func taskRowRect(in card: CGRect, index: Int, scale: CGFloat) -> CGRect {
        CGRect(
            x: card.minX + 10 * scale,
            y: card.minY + (36 + CGFloat(index) * 24) * scale,
            width: max(40, card.width - 20 * scale),
            height: max(12, 20 * scale)
        )
    }

    /// Compute from the current count, never hit rectangles cached by a draw.
    /// Single-task status cards and the collapsed footer have no session rows.
    static func taskRowIndex(at point: CGPoint, card: CGRect, scale: CGFloat, taskCount: Int) -> Int? {
        guard taskCount >= 2, card.contains(point) else { return nil }
        return (0..<min(taskCount, 3)).first {
            taskRowRect(in: card, index: $0, scale: scale).contains(point)
        }
    }

    /// Clamp the character itself, including when its card is wider than it.
    /// At least 35% remains visible on each axis so it can be grabbed again.
    static func clamp(_ point: CGPoint, petSize: CGSize, screen: CGRect) -> CGPoint {
        let keepX = petSize.width * 0.35
        let keepY = petSize.height * 0.35
        return CGPoint(
            x: min(max(point.x, screen.minX - petSize.width + keepX), screen.maxX - keepX),
            y: min(max(point.y, screen.minY - petSize.height + keepY), screen.maxY - keepY)
        )
    }

    /// Whether a point in the panel's view coordinates should receive mouse
    /// events. Everything else in the transparent window must pass clicks
    /// through to the application below (issue #92).
    static func isInteractive(
        _ point: CGPoint,
        pet: CGRect,
        bubble: CGRect?,
        tolerance: CGFloat = 1
    ) -> Bool {
        if pet.insetBy(dx: -tolerance, dy: -tolerance).contains(point) {
            return true
        }
        if let bubble, bubble.insetBy(dx: -tolerance, dy: -tolerance).contains(point) {
            return true
        }
        return false
    }
}
