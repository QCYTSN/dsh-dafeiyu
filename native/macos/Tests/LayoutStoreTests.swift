import Foundation
import XCTest
@testable import BigFishCore

/// Ports `runtime/tests/test_layout_store.py` to the Swift implementation and
/// adds regression cases for the drift found between the two ports (missing
/// XDG_CONFIG_HOME fallback, bubbleStates filtering, save-time normalisation).
final class LayoutStoreTests: XCTestCase {
    private var tempDirectory: URL!

    override func setUpWithError() throws {
        tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("dsh-layout-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let tempDirectory = tempDirectory {
            try? FileManager.default.removeItem(at: tempDirectory)
        }
    }

    private func layoutURL() -> URL {
        tempDirectory.appendingPathComponent("layout.json")
    }

    private func jsonData(_ object: [String: Any]) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    private func write(_ object: [String: Any]) {
        try! jsonData(object).write(to: layoutURL())
    }

    // MARK: - Ports of the Python suite

    func testCorruptLayoutFallsBackSafely() {
        try! Data("not json".utf8).write(to: layoutURL())
        let layout = PetLayout.load(from: layoutURL())
        XCTAssertEqual(layout.scale, 1.0)
        XCTAssertEqual(layout.bubbleScale, 1.0)
        XCTAssertEqual(layout.reducedMotion, false)
        XCTAssertEqual(layout.bubbleMode, "always")
        XCTAssertEqual(layout.bubbleStates, ["SUCCESS", "ERROR", "WAITING"])
        XCTAssertNil(layout.x)
        XCTAssertNil(layout.petX)
    }

    func testMissingFileFallsBackSafely() {
        let layout = PetLayout.load(from: layoutURL())
        XCTAssertEqual(layout.scale, 1.0)
        XCTAssertEqual(layout.bubbleScale, 1.0)
    }

    func testLayoutIsClampedAndSavedAtomically() {
        let path = tempDirectory.appendingPathComponent("nested/layout.json")
        var layout = PetLayout()
        layout.x = 120
        layout.y = -20
        layout.scale = 5
        layout.reducedMotion = true
        layout.save(to: path)

        let loaded = PetLayout.load(from: path)
        XCTAssertEqual(loaded.x, 120)
        XCTAssertEqual(loaded.y, -20)
        XCTAssertNil(loaded.petX)
        XCTAssertNil(loaded.petY)
        XCTAssertEqual(loaded.scale, 1.4)
        XCTAssertEqual(loaded.bubbleScale, 1.0)
        XCTAssertEqual(loaded.reducedMotion, true)
        XCTAssertEqual(loaded.bubbleMode, "always")
        XCTAssertEqual(loaded.bubbleStates, ["SUCCESS", "ERROR", "WAITING"])

        let onDisk = try! JSONSerialization.jsonObject(with: Data(contentsOf: path)) as! [String: Any]
        XCTAssertEqual(onDisk["scale"] as? Double, 1.4)
        // No temporary files left behind by the atomic write.
        let leftovers = try! FileManager.default.contentsOfDirectory(
            at: path.deletingLastPathComponent(),
            includingPropertiesForKeys: nil
        ).filter { $0.pathExtension == "tmp" }
        XCTAssertTrue(leftovers.isEmpty)
    }

    func testBooleanIsNotAcceptedAsCoordinateOrScale() {
        write(["x": true, "petX": false, "scale": false, "bubbleScale": false])
        let layout = PetLayout.load(from: layoutURL())
        XCTAssertNil(layout.x)
        XCTAssertNil(layout.petX)
        XCTAssertEqual(layout.scale, 1.0)
        XCTAssertEqual(layout.bubbleScale, 1.0)
    }

    func testBubbleModeAndStatesAreNormalised() {
        write(["bubbleMode": "hidden"])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).bubbleMode, "hidden")

        write(["bubbleMode": "invalid"])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).bubbleMode, "always")

        write(["bubbleStates": ["SUCCESS", "ERROR"]])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).bubbleStates, ["SUCCESS", "ERROR"])

        write(["bubbleStates": "bad"])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).bubbleStates, ["SUCCESS", "ERROR", "WAITING"])
    }

    func testBubbleScaleIsClamped() {
        write(["bubbleScale": 9])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).bubbleScale, 1.2)
        write(["bubbleScale": 0.1])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).bubbleScale, 0.8)
        write([:])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).bubbleScale, 1.0)
    }

    func testCharacterScaleSupportsMiniRange() {
        write(["scale": 0.1])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).scale, 0.55)
        write(["scale": 0.6])
        XCTAssertEqual(PetLayout.load(from: layoutURL()).scale, 0.6)
    }

    func testDefaultPathRespectsEnvironmentPrecedence() {
        // DSH_DAFEIYU_LAYOUT_PATH wins over everything.
        XCTAssertEqual(
            PetLayout.defaultPath(environment: ["DSH_DAFEIYU_LAYOUT_PATH": "/tmp/custom.json"]),
            URL(fileURLWithPath: "/tmp/custom.json")
        )
        // DSH_HOME beats XDG_CONFIG_HOME.
        XCTAssertEqual(
            PetLayout.defaultPath(environment: [
                "DSH_HOME": "/tmp/dsh-home",
                "XDG_CONFIG_HOME": "/tmp/xdg",
            ]),
            URL(fileURLWithPath: "/tmp/dsh-home/dsh-dafeiyu/layout.json")
        )
        // XDG_CONFIG_HOME is honoured when DSH_HOME is absent (Linux parity).
        XCTAssertEqual(
            PetLayout.defaultPath(environment: ["XDG_CONFIG_HOME": "/tmp/xdg"]),
            URL(fileURLWithPath: "/tmp/xdg/dsh/dsh-dafeiyu/layout.json")
        )
        // LOCALAPPDATA is honoured before XDG (Windows parity).
        XCTAssertEqual(
            PetLayout.defaultPath(environment: [
                "LOCALAPPDATA": "/tmp/local",
                "XDG_CONFIG_HOME": "/tmp/xdg",
            ]),
            URL(fileURLWithPath: "/tmp/local/DSH/dsh-dafeiyu/layout.json")
        )
    }

    // MARK: - Regression cases for drift found between the two ports

    func testSaveClampsScaleAndBubbleScaleLikePython() {
        var layout = PetLayout()
        layout.scale = 5
        layout.bubbleScale = 9
        layout.save(to: layoutURL())
        let onDisk = try! JSONSerialization.jsonObject(with: Data(contentsOf: layoutURL())) as! [String: Any]
        XCTAssertEqual(onDisk["scale"] as? Double, 1.4)
        XCTAssertEqual(onDisk["bubbleScale"] as? Double, 1.2)
    }

    func testSaveNormalizesBubbleMode() {
        var layout = PetLayout()
        layout.bubbleMode = "invalid"
        layout.save(to: layoutURL())
        let onDisk = try! JSONSerialization.jsonObject(with: Data(contentsOf: layoutURL())) as! [String: Any]
        XCTAssertEqual(onDisk["bubbleMode"] as? String, "always")
    }

    func testBubbleStatesMixedListKeepsStringsOnly() {
        write(["bubbleStates": ["SUCCESS", 42, "ERROR"]])
        XCTAssertEqual(
            PetLayout.load(from: layoutURL()).bubbleStates,
            ["SUCCESS", "ERROR"]
        )
    }

    // MARK: - Repeatability / idempotency

    func testSaveLoadRoundTripIsByteStable() {
        var layout = PetLayout()
        layout.x = 120
        layout.y = -20
        layout.petX = 400
        layout.petY = 300
        layout.scale = 1.1
        layout.bubbleScale = 0.9
        layout.reducedMotion = true
        layout.bubbleMode = "hidden"
        layout.bubbleStates = ["SUCCESS"]
        layout.save(to: layoutURL())
        let firstWrite = try! Data(contentsOf: layoutURL())

        // load -> save again must produce a byte-identical file: repeated
        // cycles must not accumulate drift (e.g. re-normalising a value).
        let loaded = PetLayout.load(from: layoutURL())
        loaded.save(to: layoutURL())
        let secondWrite = try! Data(contentsOf: layoutURL())
        XCTAssertEqual(firstWrite, secondWrite)

        // Values survive the round trip unchanged.
        let reloaded = PetLayout.load(from: layoutURL())
        XCTAssertEqual(reloaded.x, 120)
        XCTAssertEqual(reloaded.y, -20)
        XCTAssertEqual(reloaded.petX, 400)
        XCTAssertEqual(reloaded.petY, 300)
        XCTAssertEqual(reloaded.scale, 1.1)
        XCTAssertEqual(reloaded.bubbleScale, 0.9)
        XCTAssertEqual(reloaded.reducedMotion, true)
        XCTAssertEqual(reloaded.bubbleMode, "hidden")
        XCTAssertEqual(reloaded.bubbleStates, ["SUCCESS"])
    }

    func testNormalizedIsIdempotent() {
        var layout = PetLayout()
        layout.scale = 9
        layout.bubbleScale = 0.1
        layout.bubbleMode = "bogus"
        let once = layout.normalized()
        let twice = once.normalized()
        XCTAssertEqual(once.scale, twice.scale)
        XCTAssertEqual(once.bubbleScale, twice.bubbleScale)
        XCTAssertEqual(once.bubbleMode, twice.bubbleMode)
    }

    func testRepeatedLoadsAreDeterministic() {
        var layout = PetLayout()
        layout.petX = 777
        layout.petY = 42
        layout.scale = 0.9
        layout.save(to: layoutURL())
        let first = PetLayout.load(from: layoutURL())
        let second = PetLayout.load(from: layoutURL())
        let third = PetLayout.load(from: layoutURL())
        XCTAssertEqual(first.petX, second.petX)
        XCTAssertEqual(second.petX, third.petX)
        XCTAssertEqual(first.petY, second.petY)
        XCTAssertEqual(first.scale, second.scale)
        XCTAssertEqual(first.coordinateSpace, second.coordinateSpace)
    }
}
