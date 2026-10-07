import Foundation

/// Port of the original `runtime/animation_model.py` — a pure animation state
/// machine with no UI dependency. Keeps durable DSH state separate from
/// temporary visual overlays so a click, idle micro-animation, or success
/// pulse always returns to the newest Agent state.
final class AnimationModel {
    struct Clip {
        let name: String
        let frames: [String]
        let frameMs: Int
        let loop: Bool
    }

    static let states: Set<String> = [
        "IDLE", "THINKING", "WORKING", "WAITING", "SUCCESS", "ERROR", "DISCONNECTED",
    ]

    private static let dragClips: Set<String> = ["dragging", "dragging_release"]
    private static let interactionClips: Set<String> = ["head_pat", "poke", "tail"]

    /// Fade clip changes only; never blend successive 24 fps video frames.
    static func crossfadeDuration(previousClip: String, currentClip: String) -> Double? {
        if previousClip == currentClip || dragClips.contains(previousClip) || dragClips.contains(currentClip) {
            return nil
        }
        return 0.10
    }

    private(set) var clips: [String: Clip] = [:]
    private var stateMap: [String: String] = [:]
    private var workingActivityMap: [String: String] = [:]
    private(set) var idleMicroClips: [String] = []
    private var idleMicroIntervalsMs: [String: [Int]] = [:]
    private var interactionCooldownMs = 1200
    private var lastInteractionMs: Int?
    private var lastIdleMicro: String?

    private(set) var baseState = "IDLE"
    private(set) var baseActivity: String?
    private(set) var baseClipName = "idle"
    private(set) var overlayClipName: String?
    private(set) var pulseState: String?
    private(set) var pulseDeadlineMs: Int?
    private(set) var pulseClipName: String?
    private(set) var activeClipName = "idle"
    private(set) var frameIndex = 0
    private(set) var frameElapsedMs = 0

    init(manifest: [String: Any]) {
        if let clipsDict = manifest["clips"] as? [String: Any] {
            for (name, value) in clipsDict {
                guard let v = value as? [String: Any],
                      let frames = v["frames"] as? [String] else { continue }
                clips[name] = Clip(
                    name: name,
                    frames: frames,
                    frameMs: Self.asInt(v["frameMs"], fallback: 180),
                    loop: (v["loop"] as? Bool) ?? false
                )
            }
        }
        if let map = manifest["stateMap"] as? [String: String] { stateMap = map }
        if let map = manifest["workingActivityMap"] as? [String: String] { workingActivityMap = map }
        if let micros = manifest["idleMicroClips"] as? [String] { idleMicroClips = micros }
        idleMicroIntervalsMs = manifest["idleMicroIntervalsMs"] as? [String: [Int]] ?? [
            "quiet": [45000, 90000], "normal": [25000, 45000], "lively": [12000, 22000],
        ]
        interactionCooldownMs = Self.asInt(manifest["interactionCooldownMs"], fallback: 1200)
        if let idleClip = stateMap["IDLE"], !idleClip.isEmpty {
            baseClipName = idleClip
            activeClipName = idleClip
        }
    }

    var activeClip: Clip {
        clips[activeClipName] ?? Clip(name: activeClipName, frames: [], frameMs: 180, loop: false)
    }

    var frame: String {
        activeClip.frames.isEmpty ? "" : activeClip.frames[frameIndex]
    }

    var overlayRemainingMs: Int {
        guard overlayClipName != nil, !activeClip.loop else { return 0 }
        return (activeClip.frames.count - frameIndex) * activeClip.frameMs - frameElapsedMs
    }

    func idleMicroInterval(activityLevel: String) -> ClosedRange<Int> {
        let pair = idleMicroIntervalsMs[activityLevel] ?? idleMicroIntervalsMs["normal"] ?? [25000, 45000]
        return pair[0]...pair[1]
    }

    func applyState(_ state: String, activity: String? = nil) {
        guard Self.states.contains(state) else { return }
        baseState = state
        baseActivity = activity
        baseClipName = clip(for: state, activity: activity)
        if state != "IDLE" {
            pulseState = nil
            pulseDeadlineMs = nil
            pulseClipName = nil
            if !Self.dragClips.contains(overlayClipName ?? "") { overlayClipName = nil }
        }
        if overlayClipName == nil {
            activate(underlayClipName)
        }
    }

    func applyPulse(state: String, ttlMs: Int, nowMs: Int, resumeState: String?, resumeActivity: String?, completeClip: Bool = true) {
        guard Self.states.contains(state), ttlMs > 0 else { return }
        if let resume = resumeState, Self.states.contains(resume) {
            baseState = resume
            baseActivity = resumeActivity
            baseClipName = clip(for: resume, activity: resumeActivity)
        }
        let previousDeadline = pulseState == state ? pulseDeadlineMs : nil
        pulseState = state
        pulseClipName = clip(for: state, activity: nil)
        let pulseClip = clips[pulseClipName ?? ""]
        let duration = completeClip ? (pulseClip?.frames.count ?? 0) * (pulseClip?.frameMs ?? 0) : 0
        pulseDeadlineMs = max(nowMs + ttlMs, previousDeadline ?? nowMs + duration)
        if !Self.dragClips.contains(overlayClipName ?? "") { overlayClipName = nil }
        if overlayClipName == nil {
            activate(pulseClipName ?? baseClipName)
        }
    }

    @discardableResult
    func playOverlay(_ clipName: String) -> Bool {
        guard clips[clipName] != nil else { return false }
        overlayClipName = clipName
        activate(clipName)
        return true
    }

    func clearOverlay() {
        overlayClipName = nil
        activate(underlayClipName)
    }

    @discardableResult
    func playInteraction(_ clipName: String, nowMs: Int) -> Bool {
        guard Self.interactionClips.contains(clipName), pulseState == nil else { return false }
        let current = overlayClipName ?? ""
        guard !Self.interactionClips.contains(current), !Self.dragClips.contains(current) else { return false }
        if let last = lastInteractionMs, nowMs - last < interactionCooldownMs { return false }
        guard playOverlay(clipName) else { return false }
        lastInteractionMs = nowMs
        return true
    }

    @discardableResult
    func playIdleMicro(index: Int = 0) -> Bool {
        guard baseState == "IDLE", overlayClipName == nil, pulseState == nil else { return false }
        guard !idleMicroClips.isEmpty else { return false }
        var name = idleMicroClips[index % idleMicroClips.count]
        if idleMicroClips.count > 1, name == lastIdleMicro {
            name = idleMicroClips[(index + 1) % idleMicroClips.count]
        }
        lastIdleMicro = name
        return playOverlay(name)
    }

    func advance(elapsedMs: Int, nowMs: Int) {
        guard elapsedMs >= 0 else { return }
        var elapsed = elapsedMs
        if let deadline = pulseDeadlineMs, nowMs >= deadline {
            pulseState = nil
            pulseDeadlineMs = nil
            pulseClipName = nil
            if overlayClipName == nil {
                activate(baseClipName)
                elapsed = 0
            }
        }

        let clip = activeClip
        guard !clip.frames.isEmpty else { return }
        let total = frameElapsedMs + elapsed
        let nextFrame = frameIndex + total / clip.frameMs
        frameElapsedMs = total % clip.frameMs
        if nextFrame < clip.frames.count {
            frameIndex = nextFrame
        } else if clip.loop {
            frameIndex = nextFrame % clip.frames.count
        } else if overlayClipName != nil {
            overlayClipName = nil
            activate(underlayClipName)
        } else {
            frameIndex = clip.frames.count - 1
            frameElapsedMs = 0
        }
    }

    func clip(for state: String, activity: String?) -> String {
        if state == "WORKING", let activity = activity, let mapped = workingActivityMap[activity] {
            return mapped
        }
        return stateMap[state] ?? stateMap["IDLE"] ?? baseClipName
    }

    private var underlayClipName: String {
        pulseClipName ?? baseClipName
    }

    private func activate(_ clipName: String) {
        guard activeClipName != clipName else { return }
        activeClipName = clipName
        frameIndex = 0
        frameElapsedMs = 0
    }

    private static func asInt(_ value: Any?, fallback: Int) -> Int {
        if let i = value as? Int { return i }
        if let d = value as? Double { return Int(d) }
        if let s = value as? String { return Int(s) ?? fallback }
        return fallback
    }
}
