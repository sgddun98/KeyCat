import Cocoa
import WebKit

/// Window size at scale 1, in points: the crop of the web scene's frame set in web/core.js
/// (`CROP`). At scale 1 the cat is drawn at the size it has on the reference web page.
let designSize = CGSize(width: 360, height: 368)

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    /// The main cat first; a second one joins when 第二只猫 is on.
    var cats: [CatPanel] = []
    var main: CatPanel { cats[0] }
    var panel: NSPanel { main.panel }
    var statusItem: NSStatusItem!
    var timer: Timer?
    var tapRetry: Timer?
    var statusTimer: Timer?
    var eventTap: CFMachPort?
    var keyboardAllowed = true
    var pendingDelta = CGPoint.zero
    private weak var passThroughPetCat: CatPanel?
    var heldModifiers = Set<Int>()
    /// Keys the page thinks are down, with when they went down (see releaseLostKeys).
    var heldKeys: [Int: Date] = [:]
    var heldCheck: Timer?
    /// Count only, for status.txt; which keys were pressed is never kept.
    var keyEvents = 0
    /// Not remembered across restarts: a pomodoro started yesterday is over.
    var pomodoro = false
    /// Off in the check modes, which must not overwrite the real app's status.txt.
    var statusReports = true
    let defaults = UserDefaults.standard
    lazy var settings = SettingsWindow(app: self)
    lazy var stats = StatsWindow(app: self)
    lazy var updater = Updater(app: self)

    var scale: CGFloat {
        get { CGFloat(defaults.object(forKey: "catScale") as? Double ?? 0.9) }
        set { defaults.set(Double(newValue), forKey: "catScale") }
    }
    var coat: String {
        get { defaults.string(forKey: "coat") ?? "black" }
        set { defaults.set(newValue, forKey: "coat") }
    }
    /// The second cat's coat; it shares the rest of the look with the main cat.
    var coat2: String {
        get { defaults.string(forKey: "cat2.coat") ?? "orange" }
        set { defaults.set(newValue, forKey: "cat2.coat") }
    }
    /// "2d" (flat, the default) or "3d" (soft shading).
    var style: String {
        get { defaults.string(forKey: "style") ?? "2d" }
        set { defaults.set(newValue, forKey: "style") }
    }
    /// Stripes are remembered per coat: "auto" lets the page pick (orange is a tabby, grey is plain).
    var pattern: String {
        get { defaults.string(forKey: "pattern.\(coat)") ?? "auto" }
        set { defaults.set(newValue, forKey: "pattern.\(coat)") }
    }
    var eyeColor: String {
        get { defaults.string(forKey: "eyeColor") ?? "auto" }
        set { defaults.set(newValue, forKey: "eyeColor") }
    }
    var eyeShine: String {
        get { defaults.string(forKey: "eyeShine") ?? "classic" }
        set { defaults.set(newValue, forKey: "eyeShine") }
    }
    var blush: Bool {
        get { defaults.bool(forKey: "blush") }
        set { defaults.set(newValue, forKey: "blush") }
    }
    var whiskers: Bool {
        get { defaults.object(forKey: "whiskers") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "whiskers") }
    }
    var collar: String {
        get { defaults.string(forKey: "collar") ?? "none" }
        set { defaults.set(newValue, forKey: "collar") }
    }
    /// Colourpoint coats fade into their points, as in 1.0.4, instead of a crisp edge.
    var softPoints: Bool {
        get { defaults.bool(forKey: "softPoints") }
        set { defaults.set(newValue, forKey: "softPoints") }
    }
    var gloves: String {
        get { defaults.string(forKey: "gloves") ?? "auto" }
        set { defaults.set(newValue, forKey: "gloves") }
    }
    var mouseCable: Bool {
        get { defaults.object(forKey: "mouseCable") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "mouseCable") }
    }
    var keyboardColor: String {
        get { defaults.string(forKey: "keyboardColor") ?? "cream" }
        set { defaults.set(newValue, forKey: "keyboardColor") }
    }
    /// How see-through the whole picture is, 1 solid.
    var opacity: Double {
        get { defaults.object(forKey: "opacity") as? Double ?? 1 }
        set { defaults.set(newValue, forKey: "opacity") }
    }
    /// Behaviour settings from the 调节 window, only those changed from the defaults in web/tuning.js.
    var tune: [String: Any] {
        get { defaults.dictionary(forKey: "tune") ?? [:] }
        set { defaults.set(newValue, forKey: "tune") }
    }
    var privacy: Bool {
        get { defaults.bool(forKey: "privacy") }
        set { defaults.set(newValue, forKey: "privacy") }
    }
    /// Clicks reach the window underneath. A passive mouse monitor also lets the head react.
    var clickThrough: Bool {
        get { defaults.bool(forKey: "clickThrough") }
        set {
            defaults.set(newValue, forKey: "clickThrough")
            if !newValue { endPassThroughPet(allowCuddle: false) }
            for cat in cats { cat.updateMouseTarget() }
        }
    }
    var showDockIcon: Bool {
        get { defaults.object(forKey: "showDockIcon") as? Bool ?? true }
        set {
            defaults.set(newValue, forKey: "showDockIcon")
            NSApp.setActivationPolicy(newValue ? .regular : .accessory)
        }
    }
    var sleepAfter: Int {
        get { defaults.object(forKey: "sleepAfter") as? Int ?? 60 }
        set { defaults.set(newValue, forKey: "sleepAfter") }
    }
    /// The purr; off unless asked for.
    var sound: Bool {
        get { defaults.bool(forKey: "sound") }
        set { defaults.set(newValue, forKey: "sound") }
    }
    /// Holiday hats and scarf, and the winter fluff.
    var festival: Bool {
        get { defaults.object(forKey: "festival") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "festival") }
    }
    /// The mug on the desk that the cat now and then pushes off.
    var cup: Bool {
        get { defaults.object(forKey: "cup") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "cup") }
    }
    var secondCat: Bool {
        get { defaults.bool(forKey: "secondCat") }
        set { defaults.set(newValue, forKey: "secondCat") }
    }
    /// "play": both cats have a keyboard and mouse; "split": the main cat types, the second works the mouse.
    var pairMode: String {
        get { defaults.string(forKey: "pairMode") ?? "play" }
        set { defaults.set(newValue, forKey: "pairMode") }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(showDockIcon ? .regular : .accessory)
        cats = [CatPanel(app: self, index: 0)]
        applyScale(scale, keepOrigin: false)
        panel.orderFrontRegardless()
        if secondCat { setSecondCat(true) }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let url = Bundle.main.url(forResource: "MenuBar", withExtension: "png"),
           let icon = NSImage(contentsOf: url) {
            icon.size = NSSize(width: 18, height: 18)
            icon.isTemplate = true
            statusItem.button?.image = icon
            statusItem.button?.imagePosition = .imageLeft
        }
        updateStatusTitle()
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu

        installMouseMonitors()
        startKeyboardTap()
        let check = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.releaseLostKeys() }
        }
        RunLoop.main.add(check, forMode: .common)
        heldCheck = check
        let t = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        updater.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        updater.install()
    }

    /// Adds or removes the second cat, next to the main one.
    func setSecondCat(_ on: Bool) {
        secondCat = on
        if on, cats.count == 1 {
            let cat = CatPanel(app: self, index: 1)
            cats.append(cat)
            let size = panel.frame.size
            let origin = savedOrigin(for: cat) ?? CGPoint(x: panel.frame.minX - size.width * 0.72, y: panel.frame.minY)
            cat.panel.setFrame(CGRect(origin: origin, size: size), display: true)
            if panel.isVisible { cat.panel.orderFrontRegardless() }
        } else if !on, cats.count > 1 {
            let cat = cats.removeLast()
            if passThroughPetCat === cat { endPassThroughPet(allowCuddle: false) }
            cat.panel.orderOut(nil)
            cat.webView.configuration.userContentController.removeScriptMessageHandler(forName: "cat")
            main.js("cat.friend(null)")
        }
        pushOptions()
    }

    func pageLoaded(_ cat: CatPanel) {
        // The main cat keeps the memory; hand it over before anything else happens.
        if cat.isMain { cat.js("cat.memory(\(memoryJSON))") }
        pushOptions(to: cat)
        cat.lastFriend = nil
        guard cat.isMain, statusReports else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.reportStatus() }
        statusTimer?.invalidate()
        statusTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.reportStatus() }
        }
    }

    /// ~/Library/Application Support/KeyCat/<name>, creating the folder if needed.
    func supportFile(_ name: String) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KeyCat")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(name)
    }

    /// Appends to log.txt in the support folder (lifecycle only, never input).
    func log(_ text: String) {
        let url = supportFile("log.txt")
        let line = "\(Date()) \(text)\n".data(using: .utf8)!
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(line)
            try? handle.close()
        } else {
            try? line.write(to: url)
        }
    }

    /// What the cat remembers (web/life.js), kept as the JSON the page posted.
    var memoryJSON: String {
        guard let data = defaults.data(forKey: "memory"), let text = String(data: data, encoding: .utf8) else { return "null" }
        return text
    }

    func options(for cat: CatPanel) -> [String: Any] {
        let role = secondCat && pairMode == "split" ? (cat.isMain ? "keys" : "mouse") : "both"
        return ["style": style, "coat": cat.isMain ? coat : coat2, "pattern": cat.isMain ? pattern : "auto",
                "eye": eyeColor, "shine": eyeShine, "blush": blush, "whiskers": whiskers, "collar": collar,
                "softPoints": softPoints, "gloves": gloves, "cable": mouseCable, "board": keyboardColor, "opacity": opacity,
                "privacy": privacy, "sleepAfter": sleepAfter > 0 ? sleepAfter : 1e9, "tune": tune,
                "sound": sound, "festival": festival, "cup": cup, "pomodoro": cat.isMain && pomodoro,
                "role": role, "persist": cat.isMain]
    }

    func pushOptions() {
        for cat in cats { pushOptions(to: cat) }
    }

    func pushOptions(to cat: CatPanel) {
        guard let data = try? JSONSerialization.data(withJSONObject: options(for: cat)),
              let json = String(data: data, encoding: .utf8) else { return }
        cat.js("cat.options(\(json))")
    }

    /// Input and anything else every cat should hear.
    func js(_ script: String) {
        for cat in cats { cat.js(script) }
    }

    // MARK: Frame loop: forward the pointer to the page.

    func tick() {
        let screen = NSEvent.mouseLocation
        let delta = pendingDelta
        pendingDelta = .zero
        for cat in cats {
            let page = cat.pagePoint(screen: screen)
            var calls: [String] = []
            if page != cat.lastCursor {
                cat.lastCursor = page
                calls.append("cat.cursor(\(Int(page.x)),\(Int(page.y)))")
            }
            if delta != .zero { calls.append(String(format: "cat.mouseMove(%.1f,%.1f)", delta.x, delta.y)) }
            // Each cat knows where the other one's head is, to look at it and play.
            if cats.count > 1 {
                let other = cats[1 - cat.index]
                let at = cat.pagePoint(screen: other.headOnScreen)
                if cat.lastFriend.map({ abs($0.x - at.x) + abs($0.y - at.y) > 2 }) ?? true {
                    cat.lastFriend = at
                    calls.append("cat.friend(\(Int(at.x)),\(Int(at.y)))")
                }
            }
            if !calls.isEmpty {
                let script = calls.joined(separator: ";")
                cat.js(script)
            }
            if cat.hit != "none" && !cat.dragging { refreshCursor(cat) }
        }
    }

    /// Messages from a cat's page: what is under the pointer, the memory to keep, a file to save,
    /// a picture for the 今日小结 card, something to pass on to the other cat.
    func catMessage(_ cat: CatPanel, _ body: [String: Any]) {
        if let value = body["hit"] as? String {
            cat.hit = value
            cat.updateMouseTarget()
            refreshCursor(cat)
        } else if cat.isMain, let memory = body["memory"] as? [String: Any] {
            if let data = try? JSONSerialization.data(withJSONObject: memory) { defaults.set(data, forKey: "memory") }
            stats.memoryChanged()
        } else if let file = body["saveFile"] as? [String: Any], let name = file["name"] as? String,
                  let base64 = file["base64"] as? String {
            saveToPictures(name: name, base64: base64)
        } else if let portrait = body["portrait"] as? String {
            stats.showPortrait(portrait)
        } else if let event = body["friend"] as? String, ["swat", "blink"].contains(event), cats.count > 1 {
            cats[1 - cat.index].js("cat.friendEvent('\(event)')")
        }
    }

    /// Saves a picture the page made into ~/Pictures/KeyCat and shows it in Finder.
    func saveToPictures(name: String, base64: String) {
        let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        guard ["gif", "png"].contains((safe as NSString).pathExtension.lowercased()), !safe.hasPrefix("."),
              let data = Data(base64Encoded: base64) else { return }
        let dir = FileManager.default.urls(for: .picturesDirectory, in: .userDomainMask)[0].appendingPathComponent("KeyCat")
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(safe)
            try data.write(to: url)
            NSWorkspace.shared.activateFileViewerSelecting([url])
            log("saved \(safe)")
        } catch {
            log("saving \(safe) failed: \(error.localizedDescription)")
        }
    }

    func refreshCursor(_ cat: CatPanel) {
        guard cat.hit != "none", !clickThrough else { return }
        (cat.dragging ? NSCursor.closedHand : NSCursor.openHand).set()
    }

    func pet(_ cat: CatPanel, down: Bool, x: CGFloat) {
        let script = "cat.pet(\(down), \(Int(x)))"
        cat.js(script)
    }

    // MARK: Input

    func endPassThroughPet(allowCuddle: Bool) {
        passThroughPetCat?.js("cat.pet(false, 0, \(allowCuddle))")
        passThroughPetCat = nil
    }

    private func observeMouseButton(_ event: NSEvent) {
        let down = [.leftMouseDown, .rightMouseDown, .otherMouseDown].contains(event.type)
        if event.type == .leftMouseUp { endPassThroughPet(allowCuddle: true) }
        if clickThrough, event.type == .leftMouseDown {
            endPassThroughPet(allowCuddle: false)
            let screen = event.window?.convertPoint(toScreen: event.locationInWindow) ?? event.locationInWindow
            let candidates = cats.filter {
                $0.pageReady && $0.panel.isVisible && $0.panel.isOnActiveSpace && $0.panel.frame.contains(screen)
            }.sorted { $0.panel.orderedIndex < $1.panel.orderedIndex }
            // If panels overlap, the live hit can identify a head behind transparent canvas.
            if let target = candidates.first(where: { $0.hit == "pet" && $0.lastCursor == $0.pagePoint(screen: screen) })
                ?? candidates.first {
                passThroughPetCat = target
                let point = target.pagePoint(screen: screen)
                let x = Int(point.x), y = Int(point.y)
                target.js("if (cat.hitTest(\(x),\(y)) === 'pet') cat.pet(true,\(x)); else cat.mouseButton(true)")
                for cat in cats where cat !== target { cat.js("cat.mouseButton(true)") }
                return
            }
        }
        js("cat.mouseButton(\(down))")
    }

    func installMouseMonitors() {
        let moves: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged]
        NSEvent.addGlobalMonitorForEvents(matching: moves) { [weak self] event in
            MainActor.assumeIsolated { self?.addDelta(event) }
        }
        NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved]) { [weak self] event in
            MainActor.assumeIsolated { self?.addDelta(event) }
            return event
        }
        NSEvent.addGlobalMonitorForEvents(matching: [.scrollWheel]) { [weak self] event in
            MainActor.assumeIsolated { self?.pendingDelta.y += -event.scrollingDeltaY * 0.4 }
        }
        let buttons: NSEvent.EventTypeMask = [.leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp]
        NSEvent.addGlobalMonitorForEvents(matching: buttons) { [weak self] event in
            MainActor.assumeIsolated { self?.observeMouseButton(event) }
        }
        NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp]) { [weak self] event in
            MainActor.assumeIsolated {
                if let self, self.clickThrough { self.observeMouseButton(event) }
            }
            return event
        }
    }

    func addDelta(_ event: NSEvent) {
        pendingDelta.x += event.deltaX
        pendingDelta.y += event.deltaY
    }

    /// Only which key went down or up reaches the page; nothing typed is stored or logged.
    func handleKey(_ keyCode: Int, down: Bool) {
        keyEvents += 1
        // Caps lock sends no key-up; the page lets it spring back by itself.
        if keyCode != 57 { heldKeys[keyCode] = down ? Date() : nil }
        guard let code = KeyMap.code(keyCode) else { return }
        js("cat.key('\(code)',\(down))")
    }

    /// The tap never sees some key-ups: locking the screen (⌃⌘Q), a password field's secure input,
    /// or the tap being switched off for a moment. The key would then stay down on the page and its
    /// label hang over the keyboard until pressed again. So a key held for a while is checked
    /// against the keyboard itself, and let go if it is not actually down.
    func releaseLostKeys() {
        let now = Date()
        for (keyCode, since) in heldKeys where now.timeIntervalSince(since) > 0.4 {
            if CGEventSource.keyState(.combinedSessionState, key: CGKeyCode(keyCode)) { continue }
            heldModifiers.remove(keyCode)
            handleKey(keyCode, down: false)
        }
    }

    /// A listen-only tap can be created without Input Monitoring and then never fire,
    /// so the permission itself decides whether the keyboard counts as working.
    func startKeyboardTap() {
        if CGPreflightListenEventAccess(), createTap() {
            keyboardAllowed = true
            return
        }
        keyboardAllowed = false
        CGRequestListenEventAccess()
        updateStatusTitle()
        // Give the system prompt a moment; if access is still missing, say what to do.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self, !self.keyboardAllowed else { return }
            self.explainPermission()
        }
        tapRetry = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard let self, CGPreflightListenEventAccess(), self.createTap() else { return }
                self.keyboardAllowed = true
                self.updateStatusTitle()
                timer.invalidate()
                self.reportStatus()
            }
        }
    }

    func explainPermission() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "KeyCat 需要「输入监控」权限才能跟着你敲键盘"
        alert.informativeText = "请在「系统设置 › 隐私与安全性 › 输入监控」里打开 KeyCat。"
            + "如果列表里已有 KeyCat 但打开后仍没反应，先用「−」删掉它，再重新打开 KeyCat 授权。"
            + "KeyCat 只用按键位置驱动动画，不记录你输入的内容。"
        alert.addButton(withTitle: "打开系统设置")
        alert.addButton(withTitle: "稍后")
        if alert.runModal() == .alertFirstButtonReturn { openPrivacy() }
    }

    func updateStatusTitle() {
        guard let button = statusItem?.button else { return }
        button.title = keyboardAllowed ? "" : "⚠️"
        let label = keyboardAllowed ? "KeyCat" : "KeyCat：需要输入监控权限"
        button.toolTip = label
        button.setAccessibilityLabel(label)
    }

    /// Troubleshooting line in ~/Library/Application Support/KeyCat/status.txt:
    /// keyboard permission and how many animation frames the page drew in the last second.
    func reportStatus() {
        main.js("cat.state.ticks = 0; 1")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self else { return }
            self.main.webView.evaluateJavaScript("cat.state.ticks") { result, _ in
                let fps = (result as? NSNumber).map { "\($0.intValue)" } ?? "?"
                let access = CGPreflightListenEventAccess() ? "granted" : "missing"
                let line = "\(Date()) keyboard=\(self.keyboardAllowed ? "active" : "waiting for permission") "
                    + "inputMonitoring=\(access) keyEvents=\(self.keyEvents) fps=\(fps)\n"
                try? line.write(to: self.supportFile("status.txt"), atomically: true, encoding: .utf8)
            }
        }
    }

    func createTap() -> Bool {
        guard eventTap == nil else { return true }
        let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue) | (1 << CGEventType.flagsChanged.rawValue)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
                                          eventsOfInterest: CGEventMask(mask), callback: keyTapCallback, userInfo: refcon)
        else { return false }
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        eventTap = tap
        return true
    }

    func handleFlags(_ keyCode: Int, _ flags: CGEventFlags) {
        if keyCode == 57 {
            handleKey(keyCode, down: true)
            return
        }
        let flag: CGEventFlags
        switch keyCode {
        case 56, 60: flag = .maskShift
        case 59, 62: flag = .maskControl
        case 58, 61: flag = .maskAlternate
        case 54, 55: flag = .maskCommand
        case 63: flag = .maskSecondaryFn
        default: return
        }
        // flagsChanged names the key that toggled; with its family flag cleared it was released.
        let isDown = flags.contains(flag) && !heldModifiers.contains(keyCode)
        if isDown { heldModifiers.insert(keyCode) } else { heldModifiers.remove(keyCode) }
        handleKey(keyCode, down: isDown)
    }
}

private let keyTapCallback: CGEventTapCallBack = { _, type, event, refcon in
    guard let refcon else { return Unmanaged.passUnretained(event) }
    let app = Unmanaged<AppDelegate>.fromOpaque(refcon).takeUnretainedValue()
    MainActor.assumeIsolated {
        let keyCode = Int(event.getIntegerValueField(.keyboardEventKeycode))
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap = app.eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
        case .keyDown:
            if event.getIntegerValueField(.keyboardEventAutorepeat) == 0 { app.handleKey(keyCode, down: true) }
        case .keyUp:
            app.handleKey(keyCode, down: false)
        case .flagsChanged:
            app.handleFlags(keyCode, event.flags)
        default:
            break
        }
    }
    return Unmanaged.passUnretained(event)
}
