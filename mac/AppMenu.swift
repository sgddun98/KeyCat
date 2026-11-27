import Cocoa

/// What a menu item does when picked; kept in `representedObject` so one selector serves every option.
final class MenuAction: NSObject {
    let run: () -> Void
    init(_ run: @escaping () -> Void) { self.run = run }
}

let coatOptions = [("黑猫", "black"), ("奶牛猫", "tuxedo"), ("橘猫", "orange"), ("蓝灰猫", "grey"),
                   ("英短蓝金渐层", "britishBlueGolden"),
                   ("白猫", "white"), ("三花猫", "calico"), ("暹罗猫", "siamese"), ("布偶猫", "ragdoll"),
                   ("德文卷毛猫", "devon"), ("美短银虎斑", "silver"), ("狸花猫", "lihua"),
                   ("哈士奇", "husky"), ("柯基", "corgi"), ("阿拉斯加", "malamute"),
                   ("金毛", "goldenRetriever"), ("萨摩耶", "samoyed"), ("腊肠犬", "dachshund"), ("边牧", "borderCollie")]
/// Coats with colourpoints (dark face, ears, legs and tail), which get the soft-points choice.
let pointCoats: Set = ["siamese", "ragdoll"]

extension AppDelegate {
    /// Resizes every cat; the second keeps its place next to the main one.
    func applyScale(_ s: CGFloat, keepOrigin: Bool) {
        scale = s
        let size = CGSize(width: designSize.width * s, height: designSize.height * s)
        for cat in cats {
            var origin = cat.panel.frame.origin
            if !keepOrigin {
                origin = savedOrigin(for: cat) ?? (cat.isMain ? defaultOrigin(for: size)
                    : CGPoint(x: panel.frame.minX - size.width * 0.72, y: panel.frame.minY))
            }
            cat.panel.setFrame(CGRect(origin: origin, size: size), display: true)
        }
    }

    func defaultOrigin(for size: CGSize) -> CGPoint {
        let area = NSScreen.main?.visibleFrame ?? CGRect(x: 0, y: 0, width: 1440, height: 900)
        return CGPoint(x: area.maxX - size.width - 20, y: area.minY)
    }

    func savedOrigin(for cat: CatPanel) -> CGPoint? {
        guard let x = defaults.object(forKey: cat.prefix + "originX") as? Double,
              let y = defaults.object(forKey: cat.prefix + "originY") as? Double else { return nil }
        let p = CGPoint(x: x, y: y)
        let probe = CGRect(origin: p, size: CGSize(width: 80, height: 80))
        return NSScreen.screens.contains { $0.frame.intersects(probe) } ? p : nil
    }

    func saveOrigin(_ cat: CatPanel) {
        defaults.set(Double(cat.panel.frame.origin.x), forKey: cat.prefix + "originX")
        defaults.set(Double(cat.panel.frame.origin.y), forKey: cat.prefix + "originY")
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        buildMenu(menu)
    }

    func showMenu(_ event: NSEvent, in view: NSView) {
        let menu = NSMenu()
        buildMenu(menu)
        NSMenu.popUpContextMenu(menu, with: event, for: view)
    }

    /// Things to do first, then the settings in three groups (the cat, the desk, its habits), then
    /// window and app items. Same order and wording as the Windows tray.
    func buildMenu(_ menu: NSMenu) {
        menu.addItem(toggle(pomodoro ? "结束番茄钟" : "开始番茄钟", pomodoro) { $0.pomodoro.toggle() })
        menu.addItem(item("今日小结…") { $0.stats.show() })
        menu.addItem(item("拍一张动图（3 秒）") { $0.main.js("cat.record(3)") })
        menu.addItem(.separator())
        menu.addItem(group("外观", lookItems()))
        menu.addItem(group("桌面", [
            submenu("键盘颜色", [("奶白", "cream"), ("黑灰", "dark"), ("樱粉", "pink"), ("薄荷", "mint")],
                    selected: keyboardColor) { $0.keyboardColor = $1 },
            toggle("鼠标线", mouseCable) { $0.mouseCable.toggle() },
            toggle("桌面道具（它会推下去）", cup) { $0.cup.toggle() },
            submenu("透明度", [("不透明", 1.0), ("85%", 0.85), ("70%", 0.7), ("55%", 0.55)] as [(String, Double)],
                    selected: opacity) { $0.opacity = $1 },
        ]))
        menu.addItem(group("习性", [
            submenu("多久睡着", [("30 秒", 30), ("1 分钟", 60), ("3 分钟", 180), ("10 分钟", 600), ("不睡", 0)],
                    selected: sleepAfter) { $0.sleepAfter = $1 },
            toggle("声音（摸它时呼噜）", sound) { $0.sound.toggle() },
            item("调节反应…") { $0.settings.show() },
        ]))
        menu.addItem(secondCatMenu())
        menu.addItem(.separator())
        menu.addItem(toggle("隐私模式（不显示键名）", privacy) { $0.privacy.toggle() })
        menu.addItem(toggle("鼠标穿透（点击直接落到下层窗口）", clickThrough) { $0.clickThrough.toggle() })
        menu.addItem(toggle("在 Dock 中显示", showDockIcon) { $0.showDockIcon.toggle() })
        menu.addItem(item("回到右下角") { $0.resetPosition() })
        menu.addItem(item(panel.isVisible ? "隐藏" : "显示") { $0.toggleVisible() })
        menu.addItem(.separator())
        if !keyboardAllowed {
            menu.addItem(item("开启「输入监控」权限…") { $0.openPrivacy() })
            menu.addItem(item("授权后重新启动") { $0.relaunch() })
            menu.addItem(.separator())
        }
        menu.addItem(updateItem())
        menu.addItem(.separator())
        menu.addItem(item("退出 KeyCat") { _ in NSApp.terminate(nil) })
    }

    /// The cat itself: coat and size first, then the details.
    private func lookItems() -> [NSMenuItem] {
        var items = [submenu("形象", coatOptions, selected: coat) { $0.coat = $1 }]
        // Only coats whose stripes would show get the choice; black and white stay plain.
        if coat == "orange" || coat == "grey" {
            let striped = pattern == "tabby" || (pattern == "auto" && coat == "orange")
            items.append(submenu("花纹", [("纯色", "solid"), ("虎斑条纹", "tabby")],
                                 selected: striped ? "tabby" : "solid") { $0.pattern = $1 })
        }
        // The second cat shares the look, so its coat counts too.
        if pointCoats.contains(coat) || (secondCat && pointCoats.contains(coat2)) {
            items.append(toggle("重点色柔和渐变", softPoints) { $0.softPoints.toggle() })
        }
        items += [
            submenu("大小", [("特小", 0.5), ("小", 0.7), ("中", 0.9), ("大", 1.1), ("特大", 1.35)] as [(String, CGFloat)],
                    selected: scale) { $0.applyScale($1, keepOrigin: true) },
            // Off is the flat 2D sticker look; on adds soft volume shading.
            toggle("立体效果（3D）", style == "3d") { $0.style = $0.style == "3d" ? "2d" : "3d" },
            .separator(),
            submenu("眼睛颜色", [("跟随毛色", "auto"), ("金色", "gold"), ("绿色", "green"), ("蓝色", "blue"),
                                 ("琥珀色", "amber"), ("鸳鸯眼（一蓝一金）", "odd")], selected: eyeColor) { $0.eyeColor = $1 },
            submenu("眼睛高光", [("无", "none"), ("经典", "classic"), ("闪亮", "sparkle")], selected: eyeShine) { $0.eyeShine = $1 },
            submenu("手套颜色", [("跟随毛色", "auto"), ("白色", "white"), ("黑色", "black"), ("粉色", "pink")],
                    selected: gloves) { $0.gloves = $1 },
            submenu("项圈", [("无", "none"), ("红色铃铛", "red"), ("蓝色铃铛", "blue"), ("粉色铃铛", "pink"),
                             ("绿色铃铛", "green")], selected: collar) { $0.collar = $1 },
            toggle("腮红", blush) { $0.blush.toggle() },
            toggle("胡须", whiskers) { $0.whiskers.toggle() },
            toggle("节日装扮", festival) { $0.festival.toggle() },
        ]
        return items
    }

    private func group(_ title: String, _ items: [NSMenuItem]) -> NSMenuItem {
        let parent = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let sub = NSMenu()
        for i in items { sub.addItem(i) }
        parent.submenu = sub
        return parent
    }

    private func secondCatMenu() -> NSMenuItem {
        let parent = NSMenuItem(title: "第二只猫", action: nil, keyEquivalent: "")
        let sub = NSMenu()
        sub.addItem(toggle("陪着它", secondCat) { $0.setSecondCat(!$0.secondCat) })
        sub.addItem(submenu("它的形象", coatOptions, selected: coat2) { $0.coat2 = $1 })
        sub.addItem(submenu("怎么相处", [("一起玩（各有键盘鼠标，会互相打闹）", "play"), ("分工（一只打字，一只管鼠标）", "split")],
                            selected: pairMode) { $0.pairMode = $1 })
        parent.submenu = sub
        return parent
    }

    /// Same wording as the Windows tray. 重启 swaps the new app in on the way out (applicationWillTerminate).
    private func updateItem() -> NSMenuItem {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        guard updater.enabled else { return note("v\(version)（不在「应用程序」文件夹里，不自动更新）") }
        switch updater.state {
        case .ready(let new): return item("重启并更新到 v\(new)") { $0.relaunch() }
        case .downloading: return note("正在下载更新…")
        case .checking: return note("正在检查更新…")
        case .current: return note("已是最新版本 v\(version)")
        case .failed: return item("检查更新失败，点击重试") { $0.updater.check() }
        case .idle: return item("检查更新…") { $0.updater.check() }
        }
    }

    private func note(_ title: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        i.isEnabled = false
        return i
    }

    /// Radio-style submenu. Picking an option runs `pick` and pushes the new look to the page.
    private func submenu<T: Equatable>(_ title: String, _ options: [(String, T)], selected: T,
                                       pick: @escaping (AppDelegate, T) -> Void) -> NSMenuItem {
        let parent = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let sub = NSMenu()
        for (label, value) in options {
            let i = item(label) { app in
                pick(app, value)
                app.pushOptions()
            }
            i.state = value == selected ? .on : .off
            sub.addItem(i)
        }
        parent.submenu = sub
        return parent
    }

    private func toggle(_ title: String, _ on: Bool, flip: @escaping (AppDelegate) -> Void) -> NSMenuItem {
        let i = item(title) { app in
            flip(app)
            app.pushOptions()
        }
        i.state = on ? .on : .off
        return i
    }

    private func item(_ title: String, _ run: @escaping (AppDelegate) -> Void) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: #selector(runMenuAction(_:)), keyEquivalent: "")
        i.target = self
        i.representedObject = MenuAction { [weak self] in if let self { run(self) } }
        return i
    }

    @objc func runMenuAction(_ sender: NSMenuItem) { (sender.representedObject as? MenuAction)?.run() }

    func resetPosition() {
        for cat in cats {
            defaults.removeObject(forKey: cat.prefix + "originX")
            defaults.removeObject(forKey: cat.prefix + "originY")
        }
        applyScale(scale, keepOrigin: false)
    }

    func toggleVisible() {
        let show = !panel.isVisible
        if !show { endPassThroughPet(allowCuddle: false) }
        for cat in cats { if show { cat.panel.orderFrontRegardless() } else { cat.panel.orderOut(nil) } }
    }

    func openPrivacy() {
        CGRequestListenEventAccess()
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent") {
            NSWorkspace.shared.open(url)
        }
    }

    func relaunch() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/sh")
        // Wait for this process to exit; `open` on a running app only brings it forward.
        task.arguments = ["-c", "while kill -0 \"$1\" 2>/dev/null; do sleep 0.1; done; open \"$0\"",
                          Bundle.main.bundlePath, String(ProcessInfo.processInfo.processIdentifier)]
        try? task.run()
        NSApp.terminate(nil)
    }
}
