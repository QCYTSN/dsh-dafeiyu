import CoreGraphics
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

    func testOnlyTheCharacterAndCardStayInteractive() {
        let pet = CGRect(x: 25, y: 150, width: 219, height: 183)
        let card = CGRect(x: 14, y: 7, width: 364, height: 120)

        XCTAssertTrue(PetGeometry.isInteractive(CGPoint(x: 100, y: 200), pet: pet, bubble: card))
        XCTAssertTrue(PetGeometry.isInteractive(CGPoint(x: 100, y: 50), pet: pet, bubble: card))
        // The transparent margin left of the small character must pass through.
        XCTAssertFalse(PetGeometry.isInteractive(CGPoint(x: 10, y: 200), pet: pet, bubble: card))
        // The empty gap between the card and the character must pass through too.
        XCTAssertFalse(PetGeometry.isInteractive(CGPoint(x: 100, y: 135), pet: pet, bubble: card))
        // Without a visible card only the character remains a hit target.
        XCTAssertFalse(PetGeometry.isInteractive(CGPoint(x: 100, y: 50), pet: pet, bubble: nil))
    }

    func testInteractiveEdgeToleratesAFractionalPoint() {
        let pet = CGRect(x: 10, y: 10, width: 100, height: 100)
        XCTAssertTrue(PetGeometry.isInteractive(CGPoint(x: 9.5, y: 10), pet: pet, bubble: nil))
        XCTAssertFalse(PetGeometry.isInteractive(CGPoint(x: 8, y: 10), pet: pet, bubble: nil))
    }

    func testTaskRowsUseTheDrawnGeometryAtEveryBubbleScale() {
        for scale: CGFloat in [0.8, 1, 1.2] {
            let card = CGRect(x: 14, y: 7, width: 420 * scale, height: 136 * scale)
            for index in 0..<3 {
                let row = PetGeometry.taskRowRect(in: card, index: index, scale: scale)
                XCTAssertEqual(row.minY, card.minY + (36 + CGFloat(index) * 24) * scale)
                XCTAssertEqual(PetGeometry.taskRowIndex(at: CGPoint(x: row.midX, y: row.midY),
                                                      card: card, scale: scale, taskCount: 4), index)
            }
            // Header, row gaps and the collapsed "more tasks" footer do not open a session.
            XCTAssertNil(PetGeometry.taskRowIndex(at: CGPoint(x: card.midX, y: card.minY + 15 * scale),
                                                  card: card, scale: scale, taskCount: 4))
            XCTAssertNil(PetGeometry.taskRowIndex(at: CGPoint(x: card.midX, y: card.minY + 58 * scale),
                                                  card: card, scale: scale, taskCount: 4))
            let hiddenRow = PetGeometry.taskRowRect(in: card, index: 3, scale: scale)
            XCTAssertNil(PetGeometry.taskRowIndex(at: CGPoint(x: hiddenRow.midX, y: hiddenRow.midY),
                                                  card: card, scale: scale, taskCount: 4))
        }
    }

    func testRemovedTasksCannotLeaveClickableRows() {
        let card = CGRect(x: 14, y: 7, width: 420, height: 136)
        let lastRow = PetGeometry.taskRowRect(in: card, index: 2, scale: 1)
        let point = CGPoint(x: lastRow.midX, y: lastRow.midY)
        XCTAssertEqual(PetGeometry.taskRowIndex(at: point, card: card, scale: 1, taskCount: 3), 2)
        XCTAssertNil(PetGeometry.taskRowIndex(at: point, card: card, scale: 1, taskCount: 2))
        XCTAssertNil(PetGeometry.taskRowIndex(at: point, card: card, scale: 1, taskCount: 1))
        XCTAssertNil(PetGeometry.taskRowIndex(at: point, card: card, scale: 1, taskCount: 0))
    }
}
