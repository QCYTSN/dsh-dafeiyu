import Foundation

enum PetGeometry {
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
}
