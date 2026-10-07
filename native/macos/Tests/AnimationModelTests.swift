import XCTest
@testable import BigFishCore

/// The same behavior cases as the Python model, using the shipped manifest.
final class AnimationModelTests: XCTestCase {
    private static let manifest: [String: Any] = {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let data = try! Data(contentsOf: root.appendingPathComponent("assets/pet-manifest.json"))
        return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
    }()

    private func makeModel() -> AnimationModel { AnimationModel(manifest: Self.manifest) }

    func testRepeatedWorkingEventsKeepAdvancing() {
        let model = makeModel()
        model.applyState("WORKING", activity: "searching")
        model.advance(elapsedMs: 2100, nowMs: 2100)
        let frame = model.frameIndex
        model.applyState("WORKING", activity: "searching")
        XCTAssertEqual(model.frameIndex, frame)
        model.advance(elapsedMs: 42, nowMs: 2142)
        XCTAssertEqual(model.frameIndex, frame + 1)
    }

    func testIncomingWorkInterruptsDecorativeActions() {
        let model = makeModel()
        for name in model.idleMicroClips + ["head_pat", "poke", "tail"] {
            XCTAssertTrue(model.playOverlay(name))
            model.applyState("WAITING")
            XCTAssertEqual(model.activeClipName, "waiting")
            XCTAssertNil(model.overlayClipName)
        }
    }

    func testGestureFinishesBeforeReturningToIdle() {
        let model = makeModel()
        XCTAssertTrue(model.playInteraction("head_pat", nowMs: 0))
        let duration = model.overlayRemainingMs
        model.advance(elapsedMs: duration - 42, nowMs: duration - 42)
        XCTAssertEqual(model.activeClipName, "head_pat")
        XCTAssertEqual(model.frameIndex, model.activeClip.frames.count - 1)
        model.advance(elapsedMs: 42, nowMs: duration)
        XCTAssertEqual(model.activeClipName, "idle")
    }

    func testClickSpamDoesNotCutOrRestartGesture() {
        let model = makeModel()
        XCTAssertTrue(model.playInteraction("poke", nowMs: 0))
        model.advance(elapsedMs: 420, nowMs: 420)
        let frame = model.frameIndex
        XCTAssertFalse(model.playInteraction("tail", nowMs: 500))
        XCTAssertFalse(model.playInteraction("poke", nowMs: 1500))
        XCTAssertEqual(model.frameIndex, frame)
        model.advance(elapsedMs: model.overlayRemainingMs, nowMs: 11000)
        XCTAssertTrue(model.playInteraction("tail", nowMs: 11000))
    }

    func testCooldownSurvivesStateInterruption() {
        let model = makeModel()
        XCTAssertTrue(model.playInteraction("poke", nowMs: 100))
        model.applyState("THINKING")
        XCTAssertFalse(model.playInteraction("tail", nowMs: 500))
        XCTAssertTrue(model.playInteraction("tail", nowMs: 1300))
    }

    func testPulsePlaysItsReturnToRestBeforeExpiring() {
        let model = makeModel()
        model.applyPulse(state: "SUCCESS", ttlMs: 2200, nowMs: 0, resumeState: "IDLE", resumeActivity: nil)
        let deadline = model.pulseDeadlineMs!
        model.advance(elapsedMs: 2200, nowMs: 2200)
        XCTAssertEqual(model.activeClipName, "success")
        model.advance(elapsedMs: deadline - 2200 - 42, nowMs: deadline - 42)
        XCTAssertEqual(model.frameIndex, model.activeClip.frames.count - 1)
        model.advance(elapsedMs: 42, nowMs: deadline)
        XCTAssertEqual(model.activeClipName, "idle")
        XCTAssertEqual(model.frameIndex, 0)
    }

    func testRepeatedCompletionDoesNotRestartOrExtendWholeClip() {
        let model = makeModel()
        model.applyPulse(state: "SUCCESS", ttlMs: 2200, nowMs: 0, resumeState: "IDLE", resumeActivity: nil)
        let deadline = model.pulseDeadlineMs
        model.advance(elapsedMs: 2100, nowMs: 2100)
        let frame = model.frameIndex
        model.applyPulse(state: "SUCCESS", ttlMs: 2200, nowMs: 2100, resumeState: "IDLE", resumeActivity: nil)
        XCTAssertEqual(model.frameIndex, frame)
        XCTAssertEqual(model.pulseDeadlineMs, deadline)
    }

    func testIdleSnapshotPreservesPulseButWorkInterrupts() {
        let model = makeModel()
        model.applyPulse(state: "SUCCESS", ttlMs: 2200, nowMs: 0, resumeState: "IDLE", resumeActivity: nil)
        model.applyState("IDLE")
        XCTAssertEqual(model.activeClipName, "success")
        model.applyState("WORKING", activity: "commanding")
        XCTAssertEqual(model.activeClipName, "working_command")
        XCTAssertNil(model.pulseState)
    }

    func testPulseTakesPriorityOverDecorativeActions() {
        let model = makeModel()
        XCTAssertTrue(model.playIdleMicro())
        model.applyPulse(state: "ERROR", ttlMs: 1800, nowMs: 0, resumeState: "WORKING", resumeActivity: "editing")
        XCTAssertEqual(model.activeClipName, "error")
        XCTAssertFalse(model.playInteraction("poke", nowMs: 1500))
        model.advance(elapsedMs: 0, nowMs: model.pulseDeadlineMs!)
        XCTAssertEqual(model.activeClipName, "working")
    }

    func testReducedMotionPulseUsesRequestedTTL() {
        let model = makeModel()
        model.applyPulse(state: "SUCCESS", ttlMs: 2200, nowMs: 0, resumeState: "IDLE", resumeActivity: nil, completeClip: false)
        XCTAssertEqual(model.pulseDeadlineMs, 2200)
        model.advance(elapsedMs: 0, nowMs: 2200)
        XCTAssertEqual(model.activeClipName, "idle")
    }

    func testErrorDoesNotLoopBackToStanding() {
        let model = makeModel()
        model.applyState("ERROR")
        model.advance(elapsedMs: 20000, nowMs: 20000)
        XCTAssertEqual(model.frameIndex, model.activeClip.frames.count - 1)
        let last = model.frame
        model.advance(elapsedMs: 5000, nowMs: 25000)
        XCTAssertEqual(model.frame, last)
    }

    func testDragOwnsAnimationAndLandingCompletes() {
        let model = makeModel()
        XCTAssertTrue(model.playOverlay("dragging"))
        model.advance(elapsedMs: 20000, nowMs: 20000)
        model.applyState("WAITING")
        XCTAssertEqual(model.activeClipName, "dragging")
        XCTAssertFalse(model.playInteraction("poke", nowMs: 20001))
        XCTAssertTrue(model.playOverlay("dragging_release"))
        let duration = model.overlayRemainingMs
        model.advance(elapsedMs: duration - 42, nowMs: 20000 + duration - 42)
        XCTAssertEqual(model.activeClipName, "dragging_release")
        model.advance(elapsedMs: 42, nowMs: 20000 + duration)
        XCTAssertEqual(model.activeClipName, "waiting")
    }

    func testRegrabSurvivesPreviousLandingDuration() {
        let model = makeModel()
        XCTAssertTrue(model.playOverlay("dragging_release"))
        model.advance(elapsedMs: 500, nowMs: 500)
        XCTAssertTrue(model.playOverlay("dragging"))
        model.advance(elapsedMs: 5000, nowMs: 5500)
        XCTAssertEqual(model.activeClipName, "dragging")
    }

    func testIdleMicroRequiresIdleAndAvoidsRepeats() {
        let model = makeModel()
        XCTAssertTrue(model.playIdleMicro(index: 0))
        let first = model.activeClipName
        model.advance(elapsedMs: model.overlayRemainingMs, nowMs: 11000)
        XCTAssertTrue(model.playIdleMicro(index: 0))
        XCTAssertNotEqual(model.activeClipName, first)
        model.applyState("THINKING")
        XCTAssertFalse(model.playIdleMicro())
    }

    func testVideoFramesStayCrispAndDragSwitchesAtomically() {
        XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: "working_search", currentClip: "working_search"))
        for name in ["dragging", "dragging_release"] {
            XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: "idle", currentClip: name))
            XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: name, currentClip: "idle"))
        }
        XCTAssertEqual(AnimationModel.crossfadeDuration(previousClip: "thinking", currentClip: "working"), 0.10)
    }

    func testUnknownInputsAreIgnored() {
        let model = makeModel()
        model.applyState("BOGUS")
        XCTAssertFalse(model.playOverlay("BOGUS"))
        model.applyPulse(state: "SUCCESS", ttlMs: 0, nowMs: 0, resumeState: nil, resumeActivity: nil)
        XCTAssertEqual(model.activeClipName, "idle")
    }

    func testLongResumeSkipsFramesWithoutReplayingBacklog() {
        let model = makeModel()
        model.applyState("WORKING", activity: "commanding")
        model.advance(elapsedMs: 86400000, nowMs: 86400000)
        XCTAssertEqual(model.activeClipName, "working_command")
        XCTAssertLessThan(model.frameIndex, model.activeClip.frames.count)
        XCTAssertLessThan(model.frameElapsedMs, model.activeClip.frameMs)
    }
}
