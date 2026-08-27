import AppKit
import QuartzCore
import UserNotifications

/// Native AppKit companion controller. Implements the full BigFish feature set
/// on Apple's official APIs:
/// - Borderless transparent NSPanel, `fullScreenAuxiliary` + `canJoinAllSpaces`
///   + `.floating` level, re-asserted every 2 s so the pet stays above
///   full-screen apps.
/// - Faithful port of the Qt helper's status card, multi-task card, animation
///   model, procedural motion, drag/click interactions, right-click menu,
///   idle micro-animations and layout persistence.
/// - Apple official permission handling (UserNotifications + Accessibility).
final class PetController: NSObject {
    static let labels: [String: String] = [
        "IDLE": "休息中",
        "THINKING": "思考中",
        "WORKING": "干活中",
        "WAITING": "等你呢",
        "SUCCESS": "完成啦",
        "ERROR": "出问题了",
        "DISCONNECTED": "已断开",
    ]

    static let statusColors: [String: (bg: String, fg: String)] = [
        "SUCCESS": ("#D9F7E4", "#12B85A"),
        "ERROR": ("#FDE3E3", "#E5484D"),
        "WAITING": ("#FFF0CE", "#D88A00"),
        "THINKING": ("#E2ECFF", "#4C78E8"),
        "WORKING": ("#DDEBFF", "#3478F6"),
        "DISCONNECTED": ("#ECEEF1", "#7B818A"),
    ]

    static let persistentStates: Set<String> = ["THINKING", "WORKING", "WAITING", "ERROR"]

    static let microIntervals: [String: (Double, Double)] = [
        "quiet": (12, 24),
        "normal": (6.5, 12.5),
        "lively": (3.5, 8),
    ]

    private static let dragReleaseStages: [(clipName: String, holdMs: Int)] = [
        ("dragging_release", 300),
        ("dragging_dizzy", 840),
        ("dragging_protest", 300),
    ]

    let model: AnimationModel
    let manifest: [String: Any]
    let assetRoot: URL
    let layoutURL: URL
    let webuiURL: String
    let eventLogURL: URL?
    let snapshotURL: URL?

    private(set) var frames: [String: NSImage] = [:]
    private var maxFrameWidth: CGFloat = 238
    private var maxFrameHeight: CGFloat = 260

    private(set) var panel: NSPanel?
    private(set) var contentView: PetView?

    var scale: Double
    var bubbleScale: Double
    var reducedMotion: Bool
    var activityLevel: String
    var soundEnabled: Bool
    var bubbleMode: String
    var bubbleStates: [String]

    // Durable status
    var displayState = "IDLE"
    var statusState = "IDLE"
    var statusMessage = "我在这儿等新任务哦"
    var statusDetail = "DSH · 等待下一次任务"
    var statusDeadlineMs: Int?
    var overlayState: String?
    var overlayMessage = ""
    var overlayDetail = ""
    var overlayDeadlineMs: Int?
    var task = ""
    var tasks: [[String: Any]] = []

    // Geometry (pet anchor in AppKit bottom-left coordinates)
    private var petX: CGFloat = 0
    private var petY: CGFloat = 0

    private(set) var dragging = false

    private var animTimer: Timer?
    private var keepFrontTimer: Timer?
    private var microTimer: Timer?
    private var shakeTimer: Timer?
    private var shakeOrigin: NSPoint?
    private var shakeCount = 0
    private var lastTickMs: Int
    private var dragPetOffsetX: CGFloat = 0
    private var dragPetOffsetY: CGFloat = 8
    private var dragChainID = 0
    private var fadeFromFrame: String?
    private var fadeStarted: CFTimeInterval = 0
    private var fadeDuration: Double = 0.15
    private var snapshotSaved = false
    private var quitting = false

    init(model: AnimationModel,
         manifest: [String: Any],
         assetRoot: URL,
         layoutURL: URL,
         webuiURL: String,
         eventLogURL: URL?,
         snapshotURL: URL?) {
        self.model = model
        self.manifest = manifest
        self.assetRoot = assetRoot
        self.layoutURL = layoutURL
        self.webuiURL = webuiURL
        self.eventLogURL = eventLogURL
        self.snapshotURL = snapshotURL

        let env = ProcessInfo.processInfo.environment
        let layout = PetLayout.load(from: layoutURL)
        if let raw = env["DSH_DAFEIYU_SCALE"], let value = Double(raw) {
            self.scale = Self.clampedScale(value)
        } else {
            self.scale = Self.clampedScale(layout.scale)
        }
        if let raw = env["DSH_DAFEIYU_BUBBLE_SCALE"], let value = Double(raw) {
            self.bubbleScale = Self.clampedBubbleScale(value)
        } else {
            self.bubbleScale = Self.clampedBubbleScale(layout.bubbleScale)
        }
        if let raw = env["DSH_DAFEIYU_REDUCED_MOTION"] {
            self.reducedMotion = raw == "1"
        } else {
            self.reducedMotion = layout.reducedMotion
        }
        self.activityLevel = env["DSH_DAFEIYU_ACTIVITY_LEVEL"] ?? "normal"
        self.soundEnabled = env["DSH_DAFEIYU_SOUND_ENABLED"] != "0"
        let configuredBubbleMode = env["DSH_DAFEIYU_BUBBLE_MODE"]
        self.bubbleMode = ["always", "hidden", "custom"].contains(configuredBubbleMode ?? "")
            ? configuredBubbleMode!
            : layout.bubbleMode
        self.bubbleStates = env["DSH_DAFEIYU_BUBBLE_STATES"]
            .map { $0.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) } }
            ?? layout.bubbleStates
        self.lastTickMs = Self.nowMs()
        super.init()

        if let mfw = manifest["maxFrameWidth"] as? Int { maxFrameWidth = CGFloat(mfw) }
        if let mfh = manifest["maxFrameHeight"] as? Int { maxFrameHeight = CGFloat(mfh) }
        loadFrames()
        if !isHeadless() {
            buildWindow()
            restorePosition()
            startTimers()
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(screenParametersChanged),
                name: NSApplication.didChangeScreenParametersNotification,
                object: nil
            )
        }
    }

    private func isHeadless() -> Bool {
        ProcessInfo.processInfo.arguments.contains("--headless")
    }

    // MARK: - Frames & geometry

    private func loadFrames() {
        for clip in model.clips.values {
            for frame in clip.frames where frames[frame] == nil {
                if let image = NSImage(contentsOf: assetRoot.appendingPathComponent(frame)) {
                    frames[frame] = image
                }
            }
        }
    }

    private var petWidth: CGFloat { maxFrameWidth * scale }
    private var petHeight: CGFloat { maxFrameHeight * scale }

    private var cardHeightPoints: CGFloat {
        if tasks.count >= 2 {
            let rows = min(tasks.count, 3)
            return (58 + CGFloat(rows) * 26) * bubbleScale
        }
        return 84 * bubbleScale
    }

    private var cardWidthPoints: CGFloat { 420 * bubbleScale }

    private func windowSize() -> NSSize {
        NSSize(
            width: max(petWidth + 50, cardWidthPoints + 28),
            height: petHeight + cardHeightPoints + 34
        )
    }

    func petRect() -> NSRect {
        let viewSize = contentView?.bounds.size ?? windowSize()
        let offsetX = min(max(petX - (panel?.frame.origin.x ?? 0), 0), viewSize.width - petWidth)
        return NSRect(x: offsetX, y: viewSize.height - petHeight - 8, width: petWidth, height: petHeight)
    }

    func bubbleRect() -> NSRect {
        let viewSize = contentView?.bounds.size ?? windowSize()
        let cardWidth = cardWidthPoints
        let cardHeight = cardHeightPoints
        let petCenterX = petRect().midX
        let margin: CGFloat = 14
        let minX = margin
        let maxX = max(minX, viewSize.width - cardWidth - margin)
        let cardX = min(max(petCenterX - cardWidth / 2, minX), maxX)
        return NSRect(x: cardX, y: 7, width: cardWidth, height: cardHeight)
    }

    private func screenContaining(_ point: NSPoint) -> NSScreen? {
        NSScreen.screens.first { $0.frame.contains(point) }
    }

    func moveToPet(_ x: CGFloat, _ y: CGFloat) {
        guard let panel = panel else { return }
        let size = windowSize()
        let geometry = screenContaining(NSPoint(x: x, y: y))?.visibleFrame ?? NSScreen.main?.visibleFrame
        let minX = geometry?.minX ?? 0
        let maxX = max(minX, (geometry?.maxX ?? minX + size.width) - size.width + 1)
        let centerOffsetX = (size.width - petWidth) / 2
        let windowX = min(max(x - centerOffsetX, minX), maxX)
        let offsetX = min(max(x - windowX, 0), size.width - petWidth)
        self.petX = windowX + offsetX

        let minY = geometry?.minY ?? 0
        let maxY = max(minY, (geometry?.maxY ?? minY + size.height) - size.height + 1)
        let windowY = min(max(y - 8, minY), maxY)
        self.petY = windowY + 8

        panel.setFrameOrigin(NSPoint(x: windowX, y: windowY))
        contentView?.needsDisplay = true
    }

    private func restorePosition() {
        let layout = PetLayout.load(from: layoutURL)
        let screenHeight = NSScreen.main?.frame.height ?? 982
        if let px = layout.petX, let py = layout.petY {
            let ax = CGFloat(px)
            var ay = CGFloat(py)
            if layout.coordinateSpace == nil && ay < screenHeight * 0.5 {
                // Legacy Qt layout stores top-left coordinates; convert to
                // AppKit bottom-left before first use.
                ay = screenHeight - (ay + petHeight)
            }
            moveToPet(ax, ay)
        } else {
            let geometry = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1512, height: 982)
            moveToPet(geometry.maxX - petWidth - 24, geometry.minY + 24)
        }
        saveLayout()
    }

    func saveLayout() {
        guard let panel = panel else { return }
        let origin = panel.frame.origin
        var layout = PetLayout()
        layout.x = Int(origin.x.rounded())
        layout.y = Int(origin.y.rounded())
        layout.petX = Int(petX.rounded())
        layout.petY = Int(petY.rounded())
        layout.scale = scale
        layout.bubbleScale = bubbleScale
        layout.reducedMotion = reducedMotion
        layout.bubbleMode = bubbleMode
        layout.bubbleStates = bubbleStates
        layout.save(to: layoutURL)
    }

    func resizeAndReposition() {
        guard let panel = panel, let contentView = contentView else { return }
        let size = windowSize()
        let origin = panel.frame.origin
        panel.setContentSize(size)
        panel.setFrameOrigin(origin)
        contentView.frame = NSRect(origin: .zero, size: size)
        moveToPet(petX, petY)
        contentView.needsDisplay = true
    }

    // MARK: - Window

    private func buildWindow() {
        let size = windowSize()
        let panel = NSPanel(
            contentRect: NSRect(x: 100, y: 100, width: size.width, height: size.height),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = false
        panel.isMovableByWindowBackground = false
        panel.title = "DSH 大肥鱼"

        let view = PetView(frame: NSRect(x: 0, y: 0, width: size.width, height: size.height))
        view.controller = self
        panel.contentView = view
        self.panel = panel
        self.contentView = view
    }

    func show() {
        guard !isHeadless() else { return }
        panel?.orderFrontRegardless()
        keepFront()
    }

    @objc private func screenParametersChanged() {
        moveToPet(petX, petY)
    }

    // MARK: - Timers

    private func startAnimTimer() {
        animTimer?.invalidate()
        let interval = reducedMotion ? 0.04 : 0.02
        animTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    private func startTimers() {
        startAnimTimer()
        keepFrontTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.keepFront()
        }
        scheduleMicro()
    }

    private func keepFront() {
        guard let panel = panel, !quitting else { return }
        // Re-assert every 2 s: other apps or full-screen transitions can reset
        // the level/collection behavior, which would hide the pet.
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.orderFrontRegardless()
    }

    private func scheduleMicro() {
        microTimer?.invalidate()
        guard !reducedMotion else { return }
        let range = Self.microIntervals[activityLevel] ?? Self.microIntervals["normal"]!
        let delay = Double.random(in: range.0...range.1)
        microTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            if !self.dragging {
                let index = Int.random(in: 0..<max(1, self.model.idleMicroClips.count))
                _ = self.model.playIdleMicro(index: index)
                self.contentView?.needsDisplay = true
            }
            self.scheduleMicro()
        }
    }

    private func tick() {
        let now = Self.nowMs()
        let elapsed = max(0, now - lastTickMs)
        lastTickMs = now
        let hadPulse = model.pulseState != nil
        let previousFrame = model.frame
        let previousClip = model.activeClipName
        let modelElapsed = reducedMotion && model.activeClip.loop ? 0 : elapsed
        model.advance(elapsedMs: modelElapsed, nowMs: now)
        syncFrameTransition(previousFrame: previousFrame, previousClip: previousClip)
        if hadPulse && model.pulseState == nil {
            displayState = model.baseState
        }
        if let deadline = overlayDeadlineMs, now >= deadline {
            clearOverlay()
        }
        contentView?.needsDisplay = true
    }

    private func syncFrameTransition(previousFrame: String, previousClip: String) {
        let currentFrame = model.frame
        guard currentFrame != previousFrame else { return }
        if let duration = AnimationModel.crossfadeDuration(previousClip: previousClip, currentClip: model.activeClipName) {
            fadeFromFrame = previousFrame
            fadeStarted = CACurrentMediaTime()
            fadeDuration = duration
        } else {
            fadeFromFrame = nil
        }
    }

    // MARK: - Interaction

    func beginDrag() {
        guard !dragging else { return }
        dragging = true
        dragChainID &+= 1
        // Remember where the pet sits inside the window when the drag starts.
        // During the drag the window moves directly; without re-anchoring the
        // pet it would slide inside the window at the same rate and stay
        // frozen on screen while the bubble moves — a visible desync.
        let rect = petRect()
        dragPetOffsetX = rect.minX
        dragPetOffsetY = rect.minY
        animTimer?.invalidate()
        microTimer?.invalidate()
        _ = model.playOverlay("dragging")
        contentView?.needsDisplay = true
    }

    func updateDrag() {
        guard let panel = panel else { return }
        let viewSize = contentView?.bounds.size ?? windowSize()
        // Re-anchor the pet to the window's current origin using the offsets
        // captured at drag start, so the character and the bubble move as one.
        petX = panel.frame.origin.x + dragPetOffsetX
        petY = panel.frame.origin.y + (viewSize.height - dragPetOffsetY - petHeight)
        contentView?.needsDisplay = true
    }

    func endDrag() {
        guard dragging else { return }
        let now = Self.nowMs()
        model.advance(elapsedMs: 0, nowMs: now)
        model.clearOverlay()
        dragging = false
        lastTickMs = now
        startAnimTimer()
        if !reducedMotion {
            scheduleMicro()
            runDragReleaseChain()
        }
        saveLayout()
        contentView?.needsDisplay = true
    }

    func handleClick(at point: NSPoint, clickCount: Int) {
        if clickCount >= 2 {
            _ = model.playOverlay("head_pat")
            showOverlay("好啦好啦，知道你喜欢我~", statusDetail, statusState, 1800)
            contentView?.needsDisplay = true
            return
        }
        let rect = petRect()
        let relativeX = max(0, point.x - rect.minX)
        let relativeY = max(0, point.y - rect.minY)
        if relativeY < rect.height * 0.45 {
            _ = model.playOverlay("head_pat")
            showOverlay("摸摸也不能让我少干活哦~", statusDetail, statusState, 1800)
        } else if relativeX > rect.width * 0.72 {
            _ = model.playOverlay("tail")
            showOverlay("尾巴不是进度条啦！", statusDetail, statusState, 1500)
        } else {
            _ = model.playOverlay("poke")
            showOverlay("戳我干嘛，任务还在跑呢", statusDetail, statusState, 1500)
        }
        contentView?.needsDisplay = true
    }

    func showMenu(with event: NSEvent) {
        guard let contentView = contentView else { return }
        let menu = NSMenu(title: "DSH 大肥鱼")

        let sizeMenu = NSMenu(title: "大小")
        for (label, value) in [("迷你", 0.6), ("小", 0.8), ("标准", 1.0), ("大", 1.25)] {
            let item = NSMenuItem(title: label, action: #selector(changeSize(_:)), keyEquivalent: "")
            item.target = self
            item.tag = Int(value * 100)
            item.state = abs(scale - value) < 0.05 ? .on : .off
            sizeMenu.addItem(item)
        }
        let sizeItem = NSMenuItem(title: "大小", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizeMenu
        menu.addItem(sizeItem)

        let bubbleMenu = NSMenu(title: "气泡大小")
        for (label, value) in [("小", 0.8), ("标准", 1.0), ("大", 1.2)] {
            let item = NSMenuItem(title: label, action: #selector(changeBubbleScale(_:)), keyEquivalent: "")
            item.target = self
            item.tag = Int(value * 100)
            item.state = abs(bubbleScale - value) < 0.05 ? .on : .off
            bubbleMenu.addItem(item)
        }
        let bubbleItem = NSMenuItem(title: "气泡大小", action: nil, keyEquivalent: "")
        bubbleItem.submenu = bubbleMenu
        menu.addItem(bubbleItem)

        let reduced = NSMenuItem(title: "减少动态", action: #selector(toggleReducedMotion(_:)), keyEquivalent: "")
        reduced.target = self
        reduced.state = reducedMotion ? .on : .off
        menu.addItem(reduced)

        let openWeb = NSMenuItem(title: "打开 WebUI", action: #selector(openWebUI(_:)), keyEquivalent: "")
        openWeb.target = self
        menu.addItem(openWeb)

        let accessibility = NSMenuItem(title: "辅助功能权限…", action: #selector(accessibilityPermission(_:)), keyEquivalent: "")
        accessibility.target = self
        menu.addItem(accessibility)

        menu.addItem(.separator())

        let hide = NSMenuItem(title: "本次隐藏", action: #selector(hidePet(_:)), keyEquivalent: "")
        hide.target = self
        menu.addItem(hide)

        let quit = NSMenuItem(title: "本次关闭", action: #selector(quitFromMenu(_:)), keyEquivalent: "")
        quit.target = self
        menu.addItem(quit)

        NSMenu.popUpContextMenu(menu, with: event, for: contentView)
    }

    @objc private func changeSize(_ sender: NSMenuItem) {
        scale = Self.clampedScale(Double(sender.tag) / 100.0)
        resizeAndReposition()
        saveLayout()
        reportSettings(["scale": scale])
    }

    @objc private func changeBubbleScale(_ sender: NSMenuItem) {
        bubbleScale = Self.clampedBubbleScale(Double(sender.tag) / 100.0)
        resizeAndReposition()
        saveLayout()
        reportSettings(["bubbleScale": bubbleScale])
    }

    @objc private func toggleReducedMotion(_ sender: NSMenuItem) {
        reducedMotion = sender.state == .off
        restartAnimTimer()
        if reducedMotion {
            microTimer?.invalidate()
            cancelDragReleaseChain()
        } else {
            scheduleMicro()
        }
        saveLayout()
        reportSettings(["reducedMotion": reducedMotion])
        contentView?.needsDisplay = true
    }

    @objc private func openWebUI(_ sender: Any?) {
        if let url = URL(string: webuiURL) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func accessibilityPermission(_ sender: Any?) {
        Permissions.requestAccessibility()
    }

    @objc private func hidePet(_ sender: Any?) {
        panel?.orderOut(nil)
    }

    @objc private func quitFromMenu(_ sender: Any?) {
        quit(reason: "user")
    }

    // MARK: - Protocol

    func apply(_ message: [String: Any]) {
        logEvent(message)
        guard let kind = message["kind"] as? String else { return }
        switch kind {
        case "shutdown":
            quit(reason: "host")
        case "state":
            handleState(message)
        case "pulse":
            handlePulse(message)
        case "task":
            handleTask(message)
        case "tasks":
            tasks = (message["tasks"] as? [[String: Any]]) ?? []
            resizeAndReposition()
            contentView?.needsDisplay = true
        case "config":
            applyConfig(message)
        default:
            break
        }
        maybeSaveSnapshot()
    }

    private func handleState(_ message: [String: Any]) {
        let state = Self.stringValue(message["state"]) ?? "IDLE"
        let activity = Self.stringValue(message["activity"])
        displayState = state
        model.applyState(state, activity: activity)
        clearOverlay()
        showStatus(
            Self.stringValue(message["message"]) ?? Self.labels[state] ?? state,
            Self.stringValue(message["detail"]) ?? "",
            state,
            Self.persistentStates.contains(state) ? nil : 4200
        )
        contentView?.needsDisplay = true
    }

    private func handlePulse(_ message: [String: Any]) {
        let state = Self.stringValue(message["state"]) ?? "IDLE"
        let ttl = max(250, Self.intValue(message["ttlMs"]) ?? 1800)
        let resumeState = Self.stringValue(message["resumeState"]) ?? model.baseState
        let resumeActivity = Self.stringValue(message["resumeActivity"])
        model.applyPulse(
            state: state,
            ttlMs: ttl,
            nowMs: Self.nowMs(),
            resumeState: resumeState,
            resumeActivity: resumeActivity
        )
        showStatus(
            Self.stringValue(message["resumeMessage"]) ?? Self.labels[resumeState] ?? resumeState,
            Self.stringValue(message["resumeDetail"]) ?? "",
            resumeState,
            Self.persistentStates.contains(resumeState) ? nil : ttl + 2200
        )
        showOverlay(
            Self.stringValue(message["message"]) ?? Self.labels[state] ?? state,
            Self.stringValue(message["detail"]) ?? "",
            state,
            ttl
        )
        if state == "SUCCESS" || state == "ERROR" {
            notifyAlert(state)
        }
        contentView?.needsDisplay = true
    }

    private func handleTask(_ message: [String: Any]) {
        task = Self.stringValue(message["task"]) ?? ""
        showStatus(
            Self.stringValue(message["message"]) ?? task,
            Self.stringValue(message["detail"]) ?? "",
            model.baseState,
            Self.persistentStates.contains(model.baseState) ? nil : 6000
        )
        contentView?.needsDisplay = true
    }

    private func applyConfig(_ message: [String: Any]) {
        var changed = false
        if let value = Self.doubleValue(message["scale"]), value != scale {
            scale = Self.clampedScale(value)
            changed = true
        }
        if let value = Self.doubleValue(message["bubbleScale"]), value != bubbleScale {
            bubbleScale = Self.clampedBubbleScale(value)
            changed = true
        }
        if let value = message["reducedMotion"] as? Bool, value != reducedMotion {
            reducedMotion = value
            restartAnimTimer()
            if reducedMotion {
                microTimer?.invalidate()
                cancelDragReleaseChain()
            } else {
                scheduleMicro()
            }
            changed = true
        }
        if let value = message["soundEnabled"] as? Bool {
            soundEnabled = value
        }
        if let value = message["activityLevel"] as? String, ["quiet", "normal", "lively"].contains(value) {
            activityLevel = value
            if !reducedMotion {
                scheduleMicro()
            }
        }
        if let value = message["bubbleMode"] as? String, ["always", "hidden", "custom"].contains(value) {
            bubbleMode = value
            changed = true
        }
        if let value = message["bubbleStates"] as? [String] {
            bubbleStates = value
            changed = true
        }
        if changed {
            resizeAndReposition()
            saveLayout()
        }
    }

    func quit(reason: String, reportClosed: Bool = true) {
        guard !quitting else { return }
        quitting = true
        saveLayout()
        animTimer?.invalidate()
        keepFrontTimer?.invalidate()
        microTimer?.invalidate()
        shakeTimer?.invalidate()
        if reportClosed {
            ProtocolIO.shared.write([
                "protocolVersion": 1,
                "kind": "closed",
                "reason": reason,
                "timestamp": Self.nowMs(),
            ])
        }
        panel?.close()
        NSApp.terminate(nil)
    }

    // MARK: - Status helpers

    private func showStatus(_ message: String, _ detail: String, _ state: String, _ ttlMs: Int?) {
        statusMessage = message
        statusDetail = detail
        statusState = state
        statusDeadlineMs = ttlMs.map { Self.nowMs() + $0 }
    }

    private func showOverlay(_ message: String, _ detail: String, _ state: String, _ ttlMs: Int) {
        overlayMessage = message
        overlayDetail = detail.isEmpty ? statusDetail : detail
        overlayState = state
        overlayDeadlineMs = Self.nowMs() + ttlMs
    }

    private func clearOverlay() {
        overlayMessage = ""
        overlayDetail = ""
        overlayState = nil
        overlayDeadlineMs = nil
    }

    private func runDragReleaseChain() {
        dragChainID &+= 1
        playDragReleaseStage(0, token: dragChainID)
    }

    private func playDragReleaseStage(_ index: Int, token: Int) {
        guard token == dragChainID, !dragging else { return }
        guard !reducedMotion, index < Self.dragReleaseStages.count else {
            clearDragReleaseOverlay()
            return
        }

        let stage = Self.dragReleaseStages[index]
        let previousFrame = model.frame
        let previousClip = model.activeClipName
        guard model.playOverlay(stage.clipName) else {
            clearDragReleaseOverlay()
            return
        }
        syncFrameTransition(previousFrame: previousFrame, previousClip: previousClip)
        contentView?.needsDisplay = true

        DispatchQueue.main.asyncAfter(deadline: .now() + Double(stage.holdMs) / 1000.0) { [weak self] in
            self?.playDragReleaseStage(index + 1, token: token)
        }
    }

    private func clearDragReleaseOverlay() {
        guard !dragging else { return }
        let previousFrame = model.frame
        let previousClip = model.activeClipName
        model.clearOverlay()
        syncFrameTransition(previousFrame: previousFrame, previousClip: previousClip)
        contentView?.needsDisplay = true
    }

    private func cancelDragReleaseChain() {
        dragChainID &+= 1
        let releaseClips = Set(Self.dragReleaseStages.map { $0.clipName })
        if !dragging, releaseClips.contains(model.activeClipName) {
            clearDragReleaseOverlay()
        }
    }

    func currentCard() -> (title: String, detail: String, state: String)? {
        let now = Self.nowMs()
        if !overlayMessage.isEmpty, overlayDeadlineMs == nil || now < overlayDeadlineMs! {
            return (overlayMessage, overlayDetail, overlayState ?? statusState)
        }
        if !statusMessage.isEmpty, statusDeadlineMs == nil || now < statusDeadlineMs! {
            return (statusMessage, statusDetail, statusState)
        }
        return nil
    }

    private func bubbleVisible() -> Bool {
        if bubbleMode == "hidden" { return false }
        if bubbleMode == "always" { return true }
        if tasks.count >= 2 {
            return tasks.contains { task in
                guard let state = task["state"] as? String else { return false }
                return bubbleStates.contains(state)
            }
        }
        return bubbleStates.contains(overlayState ?? statusState)
    }

    private func notifyAlert(_ state: String) {
        if soundEnabled {
            let filename = state == "SUCCESS" ? "success" : "error"
            if let url = Bundle.main.resourceURL?
                .appendingPathComponent("assets/sounds/\(filename).wav"),
               let sound = NSSound(contentsOf: url, byReference: true) {
                sound.play()
            }
        }
        shakeWindow()
        Permissions.requestNotificationAuthorizationIfNeeded()
        guard Bundle.main.bundleIdentifier != nil else { return }
        let content = UNMutableNotificationContent()
        content.title = state == "SUCCESS" ? "任务完成" : "任务出错"
        content.body = state == "SUCCESS" ? "DSH 任务已完成" : "DSH 任务遇到问题"
        content.sound = soundEnabled ? .default : nil
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                FileHandle.standardError.write(Data("Notification error: \(error)\n".utf8))
            }
        }
    }

    private func shakeWindow() {
        guard let panel = panel else { return }
        shakeTimer?.invalidate()
        shakeOrigin = panel.frame.origin
        shakeCount = 0
        shakeTimer = Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { [weak self] _ in
            self?.shakeTick()
        }
    }

    private func shakeTick() {
        guard let panel = panel, let origin = shakeOrigin else {
            shakeTimer?.invalidate()
            shakeTimer = nil
            return
        }
        let offsets: [(CGFloat, CGFloat)] = [(6, 0), (-6, 0), (4, 0), (-4, 0), (2, 0), (-2, 0), (0, 0)]
        if shakeCount < offsets.count {
            let offset = offsets[shakeCount]
            panel.setFrameOrigin(NSPoint(x: origin.x + offset.0, y: origin.y + offset.1))
            shakeCount += 1
        } else {
            shakeTimer?.invalidate()
            shakeTimer = nil
            panel.setFrameOrigin(origin)
        }
    }

    private func restartAnimTimer() {
        lastTickMs = Self.nowMs()
        startAnimTimer()
    }

    // MARK: - Drawing

    func drawPet(in view: NSView) {
        guard let image = frames[model.frame] else { return }
        let phase = CACurrentMediaTime()
        var motion = model.activeClip.motion
        if reducedMotion {
            motion = nil
        }
        var scaleExtra: CGFloat = 1
        var angle: CGFloat = 0
        var offsetX: CGFloat = 0
        var offsetY: CGFloat = 0
        let clipName = model.activeClipName

        switch motion {
        case "breathe":
            scaleExtra = 1 + 0.02 * CGFloat(sin(phase * 2.5))
            angle = CGFloat(sin(phase * 2.5)) * 1.5
        case "think":
            offsetY = CGFloat(sin(phase * 2.8)) * 3
            angle = CGFloat(sin(phase * 1.3)) * 0.8
        case "work":
            offsetX = CGFloat(sin(phase * 5.4)) * 3
            angle = CGFloat(sin(phase * 3.1)) * 1.0
        case "wait":
            offsetY = CGFloat(sin(phase * 1.8)) * 1
            angle = CGFloat(sin(phase * 1.2)) * 0.8
        case "bounce":
            offsetY = -abs(CGFloat(sin(phase * 5.2))) * 8
            scaleExtra = 1 + 0.02 * CGFloat(sin(phase * 5.2))
        case "shake", "dizzy":
            offsetX = CGFloat(sin(phase * 11.0)) * 4
            angle = CGFloat(sin(phase * 11.0)) * 1.5
        case "float":
            offsetY = CGFloat(sin(phase * 3.0)) * 4
            angle = CGFloat(sin(phase * 1.6)) * 1.0
        default:
            break
        }
        if clipName == "working_search" || clipName == "working_command" {
            offsetY = -abs(CGFloat(sin(phase * 4.5))) * 5
            angle = CGFloat(sin(phase * 9.0)) * 2.5
        }
        offsetX *= scale
        offsetY *= scale

        var fadeAlpha: CGFloat = 1
        var fadeImage: NSImage?
        if let fromFrame = fadeFromFrame, let fromImage = frames[fromFrame] {
            let elapsed = CACurrentMediaTime() - fadeStarted
            if elapsed < fadeDuration {
                fadeAlpha = min(1, pow(CGFloat(elapsed / fadeDuration), 0.7))
                fadeImage = fromImage
            } else {
                fadeFromFrame = nil
            }
        }

        let pet = petRect()
        let baseWidth = pet.width
        let baseHeight = pet.height
        let drawWidth = baseWidth * scaleExtra
        let drawHeight = baseHeight * scaleExtra
        let x = pet.minX + (baseWidth - drawWidth) / 2 + offsetX
        var y = pet.minY + (baseHeight - drawHeight) / 2 + offsetY
        let card = bubbleRect()
        let bubbleBottom = card.maxY + 12
        if bubbleBottom > y {
            y = bubbleBottom
        }
        let centerX = x + drawWidth / 2
        let centerY = y + drawHeight / 2

        func draw(_ img: NSImage, alpha: CGFloat) {
            NSGraphicsContext.saveGraphicsState()
            guard let ctx = NSGraphicsContext.current?.cgContext else {
                NSGraphicsContext.restoreGraphicsState()
                return
            }
            ctx.saveGState()
            ctx.translateBy(x: centerX, y: centerY)
            if angle != 0 {
                ctx.rotate(by: angle * .pi / 180)
            }
            // The content view is flipped (top-left origin). NSImage drawing
            // does not compensate for a flipped context, which would render
            // the pet vertically mirrored. Mirror about the image's own
            // center so it draws right-side up while staying in place.
            ctx.scaleBy(x: 1, y: -1)
            img.draw(
                in: NSRect(x: -drawWidth / 2, y: -drawHeight / 2, width: drawWidth, height: drawHeight),
                from: NSRect(origin: .zero, size: img.size),
                operation: .sourceOver,
                fraction: alpha
            )
            ctx.restoreGState()
            NSGraphicsContext.restoreGraphicsState()
        }

        if fadeAlpha < 1, let fadeImage = fadeImage {
            draw(fadeImage, alpha: 1)
        }
        draw(image, alpha: fadeAlpha)
    }

    func drawCard(in view: NSView) {
        guard bubbleVisible() else { return }
        let rect = bubbleRect()
        if tasks.count >= 2 {
            drawTaskCard(rect: rect)
        } else if let card = currentCard() {
            drawStatusCard(rect: rect, card: card)
        }
    }

    private func drawStatusCard(rect: NSRect, card: (title: String, detail: String, state: String)) {
        let s = bubbleScale
        let corner: CGFloat = 16 * s
        let shadow1 = NSRect(x: rect.minX + 1, y: rect.minY + 6, width: rect.width - 2, height: rect.height)
        let shadow2 = NSRect(x: rect.minX, y: rect.minY + 3, width: rect.width, height: rect.height)
        NSColor(calibratedWhite: 0.05, alpha: 0.05).setFill()
        NSBezierPath(roundedRect: shadow1, xRadius: corner, yRadius: corner).fill()
        NSColor(calibratedWhite: 0.08, alpha: 0.08).setFill()
        NSBezierPath(roundedRect: shadow2, xRadius: corner, yRadius: corner).fill()

        let cardPath = NSBezierPath(roundedRect: rect, xRadius: corner, yRadius: corner)
        NSColor(calibratedRed: 0.988, green: 0.988, blue: 0.992, alpha: 0.97).setFill()
        cardPath.fill()
        NSColor(calibratedWhite: 0.85, alpha: 0.8).setStroke()
        cardPath.lineWidth = 1
        cardPath.stroke()

        let iconCenter = NSPoint(x: rect.maxX - 34 * s, y: rect.midY)
        drawStatusIcon(center: iconCenter, state: card.state, scale: s)

        let textX = rect.minX + 16 * s
        let textWidth = max(40, rect.width - 102 * s)
        let titleFont = NSFont.systemFont(ofSize: max(8.0, 11.0 * s), weight: .semibold)
        let detailFont = NSFont.systemFont(ofSize: max(7.0, 9.0 * s))
        drawText(
            card.title,
            in: NSRect(x: textX, y: rect.minY + 15 * s, width: textWidth, height: max(12, 27 * s)),
            font: titleFont,
            color: Self.hex("#25282D")
        )
        drawText(
            card.detail,
            in: NSRect(x: textX, y: rect.minY + 43 * s, width: textWidth, height: max(12, 24 * s)),
            font: detailFont,
            color: Self.hex("#747981")
        )
    }

    private func drawStatusIcon(center: NSPoint, state: String, scale s: CGFloat) {
        let (bgHex, fgHex) = Self.statusColors[state] ?? ("#ECEEF1", "#747A84")
        let radius: CGFloat = 23 * s
        Self.hex(bgHex).setFill()
        NSBezierPath(ovalIn: NSRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)).fill()

        let foreground = Self.hex(fgHex)
        let lineWidth: CGFloat = 3 * s
        switch state {
        case "SUCCESS":
            strokeLine(from: NSPoint(x: center.x - 10 * s, y: center.y),
                       to: NSPoint(x: center.x - 3 * s, y: center.y + 8 * s),
                       width: lineWidth, color: foreground)
            strokeLine(from: NSPoint(x: center.x - 3 * s, y: center.y + 8 * s),
                       to: NSPoint(x: center.x + 12 * s, y: center.y - 10 * s),
                       width: lineWidth, color: foreground)
        case "ERROR":
            strokeLine(from: NSPoint(x: center.x - 8 * s, y: center.y - 8 * s),
                       to: NSPoint(x: center.x + 8 * s, y: center.y + 8 * s),
                       width: lineWidth, color: foreground)
            strokeLine(from: NSPoint(x: center.x + 8 * s, y: center.y - 8 * s),
                       to: NSPoint(x: center.x - 8 * s, y: center.y + 8 * s),
                       width: lineWidth, color: foreground)
        case "WAITING":
            strokeLine(from: NSPoint(x: center.x, y: center.y - 10 * s),
                       to: NSPoint(x: center.x, y: center.y + 3 * s),
                       width: lineWidth, color: foreground)
            foreground.setFill()
            NSBezierPath(ovalIn: NSRect(x: center.x - 2 * s, y: center.y + 9 * s, width: 4 * s, height: 4 * s)).fill()
        case "THINKING", "WORKING":
            foreground.setFill()
            for offset in [-9.0, 0.0, 9.0] {
                NSBezierPath(ovalIn: NSRect(x: center.x + CGFloat(offset) * s - 3 * s,
                                            y: center.y - 3 * s,
                                            width: 6 * s,
                                            height: 6 * s)).fill()
            }
        default:
            foreground.setFill()
            NSBezierPath(ovalIn: NSRect(x: center.x - 5 * s, y: center.y - 5 * s, width: 10 * s, height: 10 * s)).fill()
        }
    }

    private func drawTaskCard(rect: NSRect) {
        let s = bubbleScale
        let corner: CGFloat = 16 * s
        NSColor(calibratedWhite: 0.05, alpha: 0.05).setFill()
        NSBezierPath(roundedRect: NSRect(x: rect.minX + 1, y: rect.minY + 6, width: rect.width - 2, height: rect.height),
                     xRadius: corner, yRadius: corner).fill()
        let cardPath = NSBezierPath(roundedRect: rect, xRadius: corner, yRadius: corner)
        NSColor(calibratedRed: 0.988, green: 0.988, blue: 0.992, alpha: 0.97).setFill()
        cardPath.fill()
        NSColor(calibratedWhite: 0.85, alpha: 0.8).setStroke()
        cardPath.lineWidth = 1
        cardPath.stroke()

        let textX = rect.minX + 16 * s
        let textWidth = max(40, rect.width - 32 * s)
        let titleFont = NSFont.systemFont(ofSize: max(8.0, 11.0 * s), weight: .semibold)
        let detailFont = NSFont.systemFont(ofSize: max(7.0, 9.0 * s))
        drawText(
            "\(tasks.count) 个任务进行中",
            in: NSRect(x: textX, y: rect.minY + 10 * s, width: textWidth, height: max(12, 22 * s)),
            font: titleFont,
            color: Self.hex("#25282D")
        )

        for (index, task) in tasks.prefix(3).enumerated() {
            let rowY = rect.minY + (36 + CGFloat(index) * 24) * s
            let state = Self.stringValue(task["state"]) ?? "IDLE"
            let stateLabel = Self.labels[state] ?? state
            let label = Self.stringValue(task["project"])
                ?? Self.stringValue(task["task"])
                ?? Self.stringValue(task["message"])
                ?? stateLabel
            let line = "\(stateLabel) · \(label)"
            let (_, fgHex) = Self.statusColors[state] ?? ("#ECEEF1", "#747A84")
            Self.hex(fgHex).setFill()
            NSBezierPath(ovalIn: NSRect(x: textX, y: rowY + 4 * s, width: 8 * s, height: 8 * s)).fill()
            drawText(
                line,
                in: NSRect(x: textX + 14 * s, y: rowY, width: textWidth - 14 * s, height: max(12, 20 * s)),
                font: detailFont,
                color: Self.hex("#747981")
            )
        }
        if tasks.count > 3 {
            drawText(
                "还有 \(tasks.count - 3) 个任务…",
                in: NSRect(x: textX + 14 * s, y: rect.minY + (36 + 3 * 24) * s,
                           width: textWidth, height: max(12, 20 * s)),
                font: detailFont,
                color: Self.hex("#9AA0A6")
            )
        }
    }

    private func drawText(_ text: String, in rect: NSRect, font: NSFont, color: NSColor) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
        ]
        (text as NSString).draw(in: rect, withAttributes: attributes)
    }

    private func strokeLine(from: NSPoint, to: NSPoint, width: CGFloat, color: NSColor) {
        color.setStroke()
        let path = NSBezierPath()
        path.lineWidth = width
        path.lineCapStyle = .round
        path.move(to: from)
        path.line(to: to)
        path.stroke()
    }

    // MARK: - Misc

    private func maybeSaveSnapshot() {
        guard let snapshotURL = snapshotURL, !snapshotSaved, !isHeadless() else { return }
        snapshotSaved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
            guard let self = self, let view = self.contentView else { return }
            if let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
                view.cacheDisplay(in: view.bounds, to: rep)
                if let data = rep.representation(using: .png, properties: [:]) {
                    try? data.write(to: snapshotURL)
                }
            }
        }
    }

    private func logEvent(_ message: [String: Any]) {
        guard let eventLogURL = eventLogURL,
              let data = try? JSONSerialization.data(withJSONObject: message),
              let line = String(data: data, encoding: .utf8) else { return }
        let payload = Data((line + "\n").utf8)
        if let handle = try? FileHandle(forWritingTo: eventLogURL) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: payload)
        } else {
            try? payload.write(to: eventLogURL)
        }
    }

    static func clampedScale(_ value: Double) -> Double {
        min(1.4, max(0.55, value))
    }

    static func clampedBubbleScale(_ value: Double) -> Double {
        min(1.2, max(0.8, value))
    }

    private static func stringValue(_ value: Any?) -> String? {
        if let string = value as? String { return string }
        if let number = value as? NSNumber { return number.stringValue }
        return nil
    }

    private static func intValue(_ value: Any?) -> Int? {
        if let int = value as? Int { return int }
        if let double = value as? Double { return Int(double) }
        if let string = value as? String { return Int(string) }
        return nil
    }

    private static func doubleValue(_ value: Any?) -> Double? {
        if let double = value as? Double { return double }
        if let int = value as? Int { return Double(int) }
        if let string = value as? String { return Double(string) }
        return nil
    }

    private static func nowMs() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    private func reportSettings(_ values: [String: Any]) {
        ProtocolIO.shared.write([
            "protocolVersion": 1,
            "kind": "settings",
            "timestamp": Self.nowMs(),
        ].merging(values) { _, new in new })
    }

    private static func hex(_ hex: String) -> NSColor {
        let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        if value.count == 6 {
            let red = Double(Int(value.prefix(2), radix: 16) ?? 0) / 255
            let green = Double(Int(value.dropFirst(2).prefix(2), radix: 16) ?? 0) / 255
            let blue = Double(Int(value.dropFirst(4).prefix(2), radix: 16) ?? 0) / 255
            return NSColor(calibratedRed: red, green: green, blue: blue, alpha: 1)
        }
        return .gray
    }
}
