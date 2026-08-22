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

    static func defaultPath() -> URL {
        if let override = ProcessInfo.processInfo.environment["DSH_DAFEIYU_LAYOUT_PATH"] {
            return URL(fileURLWithPath: override)
        }
        if let dshHome = ProcessInfo.processInfo.environment["DSH_HOME"] {
            return URL(fileURLWithPath: dshHome).appendingPathComponent("dsh-dafeiyu/layout.json")
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".dsh/dsh-dafeiyu/layout.json")
    }

    static func load(from url: URL) -> PetLayout {
        var layout = PetLayout()
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return layout
        }
        if let v = json["x"] as? Int { layout.x = v }
        if let v = json["y"] as? Int { layout.y = v }
        if let v = json["petX"] as? Int { layout.petX = v }
        if let v = json["petY"] as? Int { layout.petY = v }
        if let d = json["scale"] as? Double { layout.scale = min(1.4, max(0.55, d)) }
        else if let i = json["scale"] as? Int { layout.scale = min(1.4, max(0.55, Double(i))) }
        if let d = json["bubbleScale"] as? Double { layout.bubbleScale = min(1.2, max(0.8, d)) }
        else if let i = json["bubbleScale"] as? Int { layout.bubbleScale = min(1.2, max(0.8, Double(i))) }
        if let b = json["reducedMotion"] as? Bool { layout.reducedMotion = b }
        if let mode = json["bubbleMode"] as? String, ["always", "hidden", "custom"].contains(mode) {
            layout.bubbleMode = mode
        }
        if let states = json["bubbleStates"] as? [String] { layout.bubbleStates = states }
        if let s = json["coordinateSpace"] as? String { layout.coordinateSpace = s }
        return layout
    }

    func save(to url: URL) {
        let dict: [String: Any] = [
            "version": version,
            "x": x ?? NSNull(),
            "y": y ?? NSNull(),
            "petX": petX ?? NSNull(),
            "petY": petY ?? NSNull(),
            "scale": scale,
            "bubbleScale": bubbleScale,
            "reducedMotion": reducedMotion,
            "bubbleMode": bubbleMode,
            "bubbleStates": bubbleStates,
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
