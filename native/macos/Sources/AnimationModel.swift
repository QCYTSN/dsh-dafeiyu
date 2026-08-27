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
        let motion: String?
    }

    static let states: Set<String> = [
        "IDLE", "THINKING", "WORKING", "WAITING", "SUCCESS", "ERROR", "DISCONNECTED",
    ]

    private static let nonCrossfadeClips: Set<String> = [
        "blink",
        "glance",
        "dragging",
        "dragging_release",
        "dragging_dizzy",
        "dragging_protest",
    ]

    /// Same rules as the Python `crossfade_duration`: expression frames stay
    /// crisp, dragging switches atomically.
    static func crossfadeDuration(previousClip: String, currentClip: String) -> Double? {
        if nonCrossfadeClips.contains(previousClip) || nonCrossfadeClips.contains(currentClip) {
            return nil
        }
        return previousClip != currentClip ? 0.10 : 0.045
    }

    private(set) var clips: [String: Clip] = [:]
    private var stateMap: [String: String] = [:]
    private var workingActivityMap: [String: String] = [:]
    private(set) var idleMicroClips: [String] = []

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
                    loop: (v["loop"] as? Bool) ?? false,
                    motion: v["motion"] as? String
                )
            }
        }
        if let map = manifest["stateMap"] as? [String: String] { stateMap = map }
        if let map = manifest["workingActivityMap"] as? [String: String] { workingActivityMap = map }
        if let micros = manifest["idleMicroClips"] as? [String] { idleMicroClips = micros }
        if let idleClip = stateMap["IDLE"], !idleClip.isEmpty {
            baseClipName = idleClip
            activeClipName = idleClip
        }
    }

    var activeClip: Clip {
        clips[activeClipName] ?? Clip(name: activeClipName, frames: [], frameMs: 180, loop: false, motion: nil)
    }

    var frame: String {
        activeClip.frames.isEmpty ? "" : activeClip.frames[frameIndex]
    }

    func applyState(_ state: String, activity: String? = nil) {
        guard Self.states.contains(state) else { return }
        baseState = state
        baseActivity = activity
        baseClipName = clip(for: state, activity: activity)
        pulseState = nil
        pulseDeadlineMs = nil
        pulseClipName = nil
        if overlayClipName == nil {
            activate(baseClipName)
        }
    }

    func applyPulse(state: String, ttlMs: Int, nowMs: Int, resumeState: String?, resumeActivity: String?) {
        guard Self.states.contains(state), ttlMs > 0 else { return }
        if let resume = resumeState, Self.states.contains(resume) {
            baseState = resume
            baseActivity = resumeActivity
            baseClipName = clip(for: resume, activity: resumeActivity)
        }
        pulseState = state
        pulseDeadlineMs = nowMs + ttlMs
        pulseClipName = clip(for: state, activity: nil)
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
    func playIdleMicro(index: Int = 0) -> Bool {
        guard baseState == "IDLE", overlayClipName == nil, pulseState == nil else { return false }
        guard !idleMicroClips.isEmpty else { return false }
        return playOverlay(idleMicroClips[index % idleMicroClips.count])
    }

    func advance(elapsedMs: Int, nowMs: Int) {
        guard elapsedMs >= 0 else { return }
        if let deadline = pulseDeadlineMs, nowMs >= deadline {
            pulseState = nil
            pulseDeadlineMs = nil
            pulseClipName = nil
            if overlayClipName == nil {
                activate(baseClipName)
            }
        }

        let clip = activeClip
        guard clip.frames.count > 1 else { return }
        frameElapsedMs += elapsedMs
        while frameElapsedMs >= clip.frameMs {
            frameElapsedMs -= clip.frameMs
            if frameIndex + 1 < clip.frames.count {
                frameIndex += 1
                continue
            }
            if clip.loop {
                frameIndex = 0
                continue
            }
            if overlayClipName != nil {
                overlayClipName = nil
                activate(underlayClipName)
            } else {
                frameIndex = clip.frames.count - 1
            }
            break
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
