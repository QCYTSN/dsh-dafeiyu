import Foundation

/// Port of the original `runtime/layout_store.py`. Persists the pet window
/// geometry in the same JSON file the original helper uses
/// (`$DSH_HOME/dsh-dafeiyu/layout.json` or `~/.dsh/dsh-dafeiyu/layout.json`).
struct PetLayout {
    var version: Int = 1
    var x: Int?
    var y: Int?
    var petX: Int?
    var petY: Int?
    var scale: Double = 1.0
    var bubbleScale: Double = 1.0
    var reducedMotion: Bool = false
    var bubbleMode: String = "always"
    var bubbleStates: [String] = ["SUCCESS", "ERROR", "WAITING"]
    /// Set once the native helper has written the file. Lets us migrate the
    /// old Qt helper's top-left coordinates to AppKit's bottom-left origin.
    var coordinateSpace: String?

    static func defaultPath(
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> URL {
        if let override = environment["DSH_DAFEIYU_LAYOUT_PATH"] {
            return URL(fileURLWithPath: override)
        }
        if let dshHome = environment["DSH_HOME"] {
            return URL(fileURLWithPath: dshHome).appendingPathComponent("dsh-dafeiyu/layout.json")
        }
        if let localAppData = environment["LOCALAPPDATA"] {
            return URL(fileURLWithPath: localAppData).appendingPathComponent("DSH/dsh-dafeiyu/layout.json")
        }
        if let xdgConfig = environment["XDG_CONFIG_HOME"] {
            return URL(fileURLWithPath: xdgConfig).appendingPathComponent("dsh/dsh-dafeiyu/layout.json")
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".dsh/dsh-dafeiyu/layout.json")
    }

    /// Mirrors `normalise_layout` in `runtime/layout_store.py`: clamps numeric
    /// ranges and falls back to safe defaults for invalid enum-like fields.
    /// Applied both when loading and before saving so the two ports cannot
    /// drift (e.g. a raw `scale: 5` must never be written to disk).
    func normalized() -> PetLayout {
        var layout = self
        layout.scale = min(1.4, max(0.55, scale))
        layout.bubbleScale = min(1.2, max(0.8, bubbleScale))
        if !["always", "hidden", "custom"].contains(bubbleMode) {
            layout.bubbleMode = "always"
        }
        return layout
    }

    static func load(from url: URL) -> PetLayout {
        var layout = PetLayout()
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return layout
        }
        // Swift bridges JSON booleans to NSNumber, so `as? Int`/`as? Double`
        // would accept `true`/`false` as 1/0. Python explicitly rejects
        // booleans for coordinates and scales; mirror that here.
        if let raw = json["x"], !(raw is Bool), let v = raw as? Int { layout.x = v }
        if let raw = json["y"], !(raw is Bool), let v = raw as? Int { layout.y = v }
        if let raw = json["petX"], !(raw is Bool), let v = raw as? Int { layout.petX = v }
        if let raw = json["petY"], !(raw is Bool), let v = raw as? Int { layout.petY = v }
        if let raw = json["scale"], !(raw is Bool) {
            if let d = raw as? Double { layout.scale = min(1.4, max(0.55, d)) }
            else if let i = raw as? Int { layout.scale = min(1.4, max(0.55, Double(i))) }
        }
        if let raw = json["bubbleScale"], !(raw is Bool) {
            if let d = raw as? Double { layout.bubbleScale = min(1.2, max(0.8, d)) }
            else if let i = raw as? Int { layout.bubbleScale = min(1.2, max(0.8, Double(i))) }
        }
        if let b = json["reducedMotion"] as? Bool { layout.reducedMotion = b }
        if let mode = json["bubbleMode"] as? String, ["always", "hidden", "custom"].contains(mode) {
            layout.bubbleMode = mode
        }
        if let rawStates = json["bubbleStates"] as? [Any] {
            // Python keeps only the string entries of a mixed list; mirror that
            // instead of rejecting the whole array when one entry is invalid.
            layout.bubbleStates = rawStates.compactMap { $0 as? String }
        }
        if let s = json["coordinateSpace"] as? String { layout.coordinateSpace = s }
        return layout.normalized()
    }

    func save(to url: URL) {
        let normalized = self.normalized()
        let dict: [String: Any] = [
            "version": version,
            "x": x ?? NSNull(),
            "y": y ?? NSNull(),
            "petX": petX ?? NSNull(),
            "petY": petY ?? NSNull(),
            "scale": normalized.scale,
            "bubbleScale": normalized.bubbleScale,
            "reducedMotion": reducedMotion,
            "bubbleMode": normalized.bubbleMode,
            "bubbleStates": normalized.bubbleStates,
            "coordinateSpace": "appkit-bottom-left",
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted, .sortedKeys]) else {
            return
        }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
        } catch {
            FileHandle.standardError.write(Data("Unable to save BigFish layout: \(error)\n".utf8))
        }
    }
}
