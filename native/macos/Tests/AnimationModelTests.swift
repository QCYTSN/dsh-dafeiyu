import XCTest
@testable import BigFishCore

/// Ports `runtime/tests/test_animation_model.py` to the Swift implementation
/// so the two ports cannot silently drift. Every case runs against the real
/// `assets/pet-manifest.json`, exactly like the Python suite.
final class AnimationModelTests: XCTestCase {
    private static let manifest: [String: Any] = {
        var url = URL(fileURLWithPath: #filePath)
        url.deleteLastPathComponent() // Tests/
        url.deleteLastPathComponent() // macos/
        url.deleteLastPathComponent() // native/
        url.deleteLastPathComponent() // repo root
        let manifestURL = url.appendingPathComponent("assets/pet-manifest.json")
        let data = try! Data(contentsOf: manifestURL)
        return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
    }()

    private func makeModel() -> AnimationModel {
        AnimationModel(manifest: Self.manifest)
    }

    // MARK: - Ports of the Python suite

    func testWorkingActivitySelectsPersistentLoop() {
        let model = makeModel()
        model.applyState("WORKING", activity: "searching")
        XCTAssertEqual(model.activeClipName, "working_search")
        for tick in 0..<12 {
            model.advance(elapsedMs: 150, nowMs: tick * 150)
        }
        XCTAssertEqual(model.activeClipName, "working_search")
    }

    func testInteractionReturnsToLatestAgentState() {
        let model = makeModel()
        model.applyState("THINKING")
        XCTAssertTrue(model.playOverlay("head_pat"))
        model.applyState("WAITING")
        // head_pat is a 48-frame overlay (~4s at 83ms); the walk-through must
        // outlast it to observe the hand-back to the base state.
        for tick in 0..<30 {
            model.advance(elapsedMs: 200, nowMs: tick * 200)
        }
        XCTAssertEqual(model.activeClipName, "waiting")
        XCTAssertEqual(model.baseState, "WAITING")
    }

    func testPulseExpiresToCurrentBaseState() {
        let model = makeModel()
        model.applyState("WORKING", activity: "editing")
        model.applyPulse(
            state: "SUCCESS",
            ttlMs: 1000,
            nowMs: 100,
            resumeState: "IDLE",
            resumeActivity: nil
        )
        XCTAssertEqual(model.activeClipName, "success")
        model.advance(elapsedMs: 100, nowMs: 1200)
        XCTAssertEqual(model.activeClipName, "idle")
    }

    func testIdleMicroDoesNotInterruptAgentWork() {
        let model = makeModel()
        model.applyState("THINKING")
        XCTAssertFalse(model.playIdleMicro())
        XCTAssertEqual(model.activeClipName, "thinking")
    }

    func testDragOverlayReturnsToLatestAgentState() {
        let model = makeModel()
        model.applyState("THINKING")
        XCTAssertTrue(model.playOverlay("dragging"))
        model.applyState("WAITING")
        model.clearOverlay()
        XCTAssertEqual(model.activeClipName, "waiting")
        XCTAssertEqual(model.baseState, "WAITING")
    }

    func testDragTransitionsNeverCrossfade() {
        XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: "idle", currentClip: "dragging"))
        XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: "dragging", currentClip: "thinking"))
        XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: "blink", currentClip: "idle"))
        for stage in ["dragging_release", "dragging_dizzy", "dragging_protest"] {
            XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: "idle", currentClip: stage), stage)
            XCTAssertNil(AnimationModel.crossfadeDuration(previousClip: stage, currentClip: "idle"), stage)
        }
        XCTAssertEqual(
            AnimationModel.crossfadeDuration(previousClip: "thinking", currentClip: "working")!,
            0.10,
            accuracy: 0.0001
        )
        XCTAssertEqual(
            AnimationModel.crossfadeDuration(previousClip: "working_search", currentClip: "working_search")!,
            0.045,
            accuracy: 0.0001
        )
    }

    func testDragStageClipsAreRegistered() {
        // Release and protest are real animations now; the daze stage stays a
        // single pose so the procedural dizzy wobble carries it.
        let stages: [(name: String, loop: Bool, frames: Int)] = [
            ("dragging_release", false, 49),
            ("dragging_dizzy", true, 1),
            ("dragging_protest", false, 96),
        ]
        let model = makeModel()
        guard let clips = Self.manifest["clips"] as? [String: Any] else {
            return XCTFail("manifest has no clips")
        }
        for (name, loop, frames) in stages {
            guard let clip = clips[name] as? [String: Any] else {
                XCTFail("missing clip \(name)")
                continue
            }
            XCTAssertEqual((clip["frames"] as? [String])?.count, frames, name)
            XCTAssertEqual(clip["loop"] as? Bool, loop, name)
            XCTAssertTrue(model.playOverlay(name), name)
        }
        XCTAssertEqual(
            ((clips["dragging_dizzy"] as? [String: Any])?["motion"] as? String),
            "dizzy",
            "the daze stage must keep its procedural motion"
        )
    }

    func testSingleFrameDragStageSurvivesAdvanceUntilCleared() {
        let model = makeModel()
        model.applyState("IDLE")
        XCTAssertTrue(model.playOverlay("dragging_dizzy"))
        for tick in 0..<10 {
            model.advance(elapsedMs: 260, nowMs: tick * 260)
        }
        XCTAssertEqual(model.activeClipName, "dragging_dizzy")
        model.clearOverlay()
        XCTAssertEqual(model.activeClipName, "idle")
    }

    func testDragReleaseChainMatchesRegisteredStageClips() {
        let stages = AnimationModel.dragReleaseStages
        XCTAssertEqual(
            stages.map(\.clipName),
            ["dragging_release", "dragging_dizzy", "dragging_protest"]
        )
        XCTAssertTrue(stages.allSatisfy { $0.holdMs > 0 })
        // Every stage in the chain must be registered in the manifest and playable.
        let model = makeModel()
        for stage in stages {
            XCTAssertTrue(model.playOverlay(stage.clipName), stage.clipName)
        }
    }

    func testDragReleaseHoldsCoverTheShippedClips() {
        // Frames each straight-through stage needs to finish its motion, measured
        // from the shipped art. The daze stage is excluded: it is a single static
        // pose held for readability, so its hold is not a motion budget.
        // Mirrors runtime/tests/test_animation_model.py.
        let motionFrames = ["dragging_release": 30, "dragging_protest": 42]
        let expectedFrames = ["dragging_release": 49, "dragging_dizzy": 1, "dragging_protest": 96]

        guard let clips = Self.manifest["clips"] as? [String: Any] else {
            return XCTFail("manifest has no clips")
        }
        var holds: [String: Int] = [:]
        for stage in AnimationModel.dragReleaseStages {
            holds[stage.clipName] = stage.holdMs
        }

        for (name, frames) in expectedFrames {
            guard let clip = clips[name] as? [String: Any] else {
                XCTFail("missing clip \(name)")
                continue
            }
            XCTAssertEqual((clip["frames"] as? [String])?.count, frames, name)
            XCTAssertEqual((clip["frameMs"] as? NSNumber)?.intValue, 42, name)
        }

        for (name, motion) in motionFrames {
            guard let clip = clips[name] as? [String: Any],
                  let frameMs = (clip["frameMs"] as? NSNumber)?.intValue,
                  let frameCount = (clip["frames"] as? [String])?.count,
                  let hold = holds[name] else {
                XCTFail("incomplete data for \(name)")
                continue
            }
            XCTAssertGreaterThanOrEqual(
                hold,
                motion * frameMs,
                "\(name) is held \(hold) ms but its motion needs \(motion * frameMs) ms"
            )
            XCTAssertLessThanOrEqual(
                hold,
                frameMs * frameCount,
                "\(name) is held \(hold) ms, longer than the clip itself"
            )
        }

        // The daze stage stays a single looping pose for the procedural wobble,
        // and the whole reaction has to stay under four seconds.
        XCTAssertEqual((clips["dragging_dizzy"] as? [String: Any])?["loop"] as? Bool, true)
        XCTAssertLessThanOrEqual(holds.values.reduce(0, +), 4000)
    }

    func testDragStartsInsideTheDanglingLoop() {
        let model = makeModel()
        model.applyState("IDLE")
        XCTAssertTrue(model.playOverlay("dragging"))
        model.seekActiveClip(toFrame: AnimationModel.dragAnimationStartFrame)
        XCTAssertEqual(model.frameIndex, AnimationModel.dragAnimationStartFrame)
        XCTAssertEqual(model.frame, model.activeClip.frames[AnimationModel.dragAnimationStartFrame])

        // The loop keeps advancing from the seeked frame, so the pet swings
        // instead of sitting on one pose.
        let start = model.frame
        model.advance(elapsedMs: 42 * 3, nowMs: 126)
        XCTAssertNotEqual(model.frame, start)

        // Seeking past the clip clamps instead of trapping.
        model.seekActiveClip(toFrame: 10_000)
        XCTAssertEqual(model.frameIndex, model.activeClip.frames.count - 1)
        model.seekActiveClip(toFrame: -5)
        XCTAssertEqual(model.frameIndex, 0)
    }

    // MARK: - Additional Swift-side edge cases

    func testUnknownStateIsIgnored() {
        let model = makeModel()
        model.applyState("BOGUS")
        XCTAssertEqual(model.baseState, "IDLE")
        XCTAssertEqual(model.activeClipName, "idle")
    }

    func testPulseWithNonPositiveTtlIsIgnored() {
        let model = makeModel()
        model.applyState("WORKING", activity: "editing")
        model.applyPulse(
            state: "SUCCESS",
            ttlMs: 0,
            nowMs: 100,
            resumeState: nil,
            resumeActivity: nil
        )
        XCTAssertNil(model.pulseState)
        XCTAssertEqual(model.activeClipName, "working")
    }

    func testUnknownOverlayReturnsFalse() {
        let model = makeModel()
        XCTAssertFalse(model.playOverlay("does_not_exist"))
    }

    func testStateMapCoversEveryState() {
        let model = makeModel()
        let expected: [(state: String, clip: String)] = [
            ("IDLE", "idle"),
            ("THINKING", "thinking"),
            ("WORKING", "working"),
            ("WAITING", "waiting"),
            ("SUCCESS", "success"),
            ("ERROR", "error"),
            ("DISCONNECTED", "idle"),
        ]
        for (state, clip) in expected {
            XCTAssertEqual(model.clip(for: state, activity: nil), clip)
        }
    }

    func testWorkingActivityMap() {
        let model = makeModel()
        let cases: [(activity: String, clip: String)] = [
            ("searching", "working_search"),
            ("commanding", "working_command"),
            ("editing", "working"),
            ("testing", "working_command"),
            ("using-tool", "working"),
        ]
        for (activity, clip) in cases {
            XCTAssertEqual(model.clip(for: "WORKING", activity: activity), clip)
        }
    }

    func testPulseResumeStateUpdatesBaseState() {
        let model = makeModel()
        model.applyState("THINKING")
        model.applyPulse(
            state: "SUCCESS",
            ttlMs: 1000,
            nowMs: 100,
            resumeState: "WAITING",
            resumeActivity: nil
        )
        XCTAssertEqual(model.baseState, "WAITING")
        XCTAssertEqual(model.activeClipName, "success")
        model.advance(elapsedMs: 100, nowMs: 1200)
        XCTAssertEqual(model.activeClipName, "waiting")
    }

    func testIdleMicroPlaysWhenIdle() {
        let model = makeModel()
        model.applyState("IDLE")
        XCTAssertTrue(model.playIdleMicro(index: 0))
        XCTAssertEqual(model.overlayClipName, "eat_token")
        XCTAssertEqual(model.activeClipName, "eat_token")
    }

    func testIdleMicroReturnsToIdleWhenFinished() {
        let model = makeModel()
        model.applyState("IDLE")
        XCTAssertTrue(model.playIdleMicro(index: 0)) // eat_token: 120 frames x 42ms (~5s)
        for tick in 0..<70 {
            model.advance(elapsedMs: 100, nowMs: tick * 100)
        }
        XCTAssertEqual(model.activeClipName, "idle")
    }

    func testSameInputSequenceYieldsSameEndState() {
        func run() -> (clip: String, base: String) {
            let model = makeModel()
            model.applyState("WORKING", activity: "searching")
            model.applyPulse(
                state: "SUCCESS",
                ttlMs: 500,
                nowMs: 0,
                resumeState: "WAITING",
                resumeActivity: nil
            )
            for tick in 0..<10 {
                model.advance(elapsedMs: 100, nowMs: tick * 100)
            }
            model.applyState("THINKING")
            model.clearOverlay()
            return (model.activeClipName, model.baseState)
        }
        // Same input sequence must always produce the same end state.
        let first = run()
        let second = run()
        let third = run()
        XCTAssertEqual(first.clip, second.clip)
        XCTAssertEqual(second.clip, third.clip)
        XCTAssertEqual(first.base, second.base)
        XCTAssertEqual(first.clip, "thinking")
        XCTAssertEqual(first.base, "THINKING")
    }
}
