import XCTest
@testable import BigFishCore

final class PetGeometryTests: XCTestCase {
    func testDraggingFarOffAnyEdgeLeavesCharacterGrabbable() {
        let screen = CGRect(x: -1920, y: 50, width: 1920, height: 1080)
        let size = CGSize(width: 190, height: 250)
        for point in [CGPoint(x: -9999, y: -9999), CGPoint(x: 9999, y: 9999)] {
            let placed = PetGeometry.clamp(point, petSize: size, screen: screen)
            let visible = CGRect(origin: placed, size: size).intersection(screen)
            XCTAssertGreaterThanOrEqual(visible.width, size.width * 0.35 - 0.001)
            XCTAssertGreaterThanOrEqual(visible.height, size.height * 0.35 - 0.001)
        }
    }

    func testPartialPositionSurvivesRestoreAndCardResize() {
        let screen = CGRect(x: 0, y: 0, width: 1512, height: 982)
        let point = CGPoint(x: -90, y: -100)
        XCTAssertEqual(PetGeometry.clamp(point, petSize: CGSize(width: 190, height: 250), screen: screen), point)
    }
}
