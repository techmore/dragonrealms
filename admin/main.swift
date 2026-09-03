// Dragon Realms — menu-bar admin app (native Swift + AppKit).
// A status item in the menu bar; right-click (or click) opens a menu with the
// admin dash, GM console, play, Sims EXP monitor, roadmap, Start/Stop World,
// Reload, and Quit.
// Manages the live Node world server as a child process.
//
// Build: ./scripts/build-admin-app.sh
// Run:   open bin/admin/dragonrealms-admin.app
//
// Health-check design (why it's async):
// The world server shares its event loop with game ticks and grind sims, so a
// naive synchronous Data(contentsOf:) probe intermittently times out and the
// menu reported "offline" while the world was actually up. We now probe
// asynchronously with a short timeout, cache the result, and only flip to
// OFFLINE after N consecutive failures (hysteresis) — one blip never lies.
// The menu itself refreshes lazily via NSMenuDelegate when opened, plus a
// background poll that keeps the icon tint honest.

import AppKit
import Foundation
import Security

func configuredOrRandomGMToken() -> String {
    if let configured = ProcessInfo.processInfo.environment["DR_GM_TOKEN"], !configured.isEmpty {
        return configured
    }
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
        fatalError("Unable to generate the required GM credential.")
    }
    return bytes.map { String(format: "%02x", $0) }.joined()
}

// LaunchServices does not guarantee the current directory when opening the
// menu-bar app. Resolve the project root from the bundle location so live
// experiment files are found whether the app is launched by Finder, `open`,
// or directly from a terminal.
let ROOT: String = {
    let bundle = Bundle.main.bundleURL
    let project = bundle
        .deletingLastPathComponent() // admin/
        .deletingLastPathComponent() // bin/
        .deletingLastPathComponent() // project/
    if FileManager.default.fileExists(atPath: project.appendingPathComponent("public/live").path) {
        return project.path
    }
    return FileManager.default.currentDirectoryPath
}()
let PORT = 3000
let BASE = "http://127.0.0.1:\(PORT)"
let LOG_PATH = "/tmp/dr-world.log"
// Token resolution: env > running world's published credential > fresh random.
// When we start the world ourselves, OUR token wins and gets published by the
// child; when a world is already up, ITS published token is authoritative.
let GMTOKEN = configuredOrRandomGMToken()

// Per-port token file (server/index.js publishes dr-world-token-<port>.json).
func liveWorldToken() -> String? {
    let path = "/tmp/dr-world-token-\(PORT).json"
    guard let data = FileManager.default.contents(atPath: path),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let token = obj["token"] as? String, !token.isEmpty
    else { return nil }
    // Stale file from a world that has since died? The health check decides.
    return token
}

/// Asynchronous, hysteresis-guarded health state for the world server.
final class Health {
    static let shared = Health()
    /// Offline only after this many consecutive failed probes — a single
    /// hiccup (event loop busy, socket backlog) never flips the menu.
    private static let failuresToGoOffline = 2
    private(set) var online = false
    private var consecutiveFailures = 0
    private var probing = false
    private var onChange: ((Bool) -> Void)?
    /// Set while the world we spawned is still booting — suppresses the
    /// "offline" flap during the listen window after Start World.
    private(set) var bootingUntil = Date.distantPast

    func bind(onChange: @escaping (Bool) -> Void) { self.onChange = onChange }

    func markBooting(seconds: TimeInterval) { bootingUntil = Date().addingTimeInterval(seconds) }

    func probe() {
        guard !probing else { return }
        probing = true
        var req = URLRequest(url: URL(string: "\(BASE)/api/health")!)
        req.timeoutInterval = 1.5
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let task = URLSession.shared.dataTask(with: req) { [weak self] data, resp, _ in
            defer { self?.probing = false }
            guard let self else { return }
            let ok = (resp as? HTTPURLResponse)?.statusCode == 200 && (data?.isEmpty == false)
            DispatchQueue.main.async { self.absorb(ok) }
        }
        task.resume()
    }

    private func absorb(_ ok: Bool) {
        if ok {
            consecutiveFailures = 0
        } else {
            consecutiveFailures += 1
        }
        let nowOnline = ok || consecutiveFailures < Health.failuresToGoOffline
        // While our freshly started world boots, stay optimistic.
        let effective = nowOnline || Date() < bootingUntil
        if effective != online {
            online = effective
            onChange?(online)
        }
    }
}

func effectiveToken() -> String {
    if let env = ProcessInfo.processInfo.environment["DR_GM_TOKEN"], !env.isEmpty { return env }
    if Health.shared.online, let live = liveWorldToken() { return live }
    return GMTOKEN
}

enum Action: String, CaseIterable {
    case admin = "Open Admin Dash"
    case gm = "GM Console"
    case copyToken = "Copy GM Token"
    case play = "Play"
    case sims = "Sims — Condensed EXP"
    case roadmap = "Roadmap"
    case start = "Start World"
    case stop = "Stop World"
    case reload = "Reload World"
    case quit = "Quit"
}

final class World {
    static let shared = World()
    private var task: Process?
    private var logHandle: FileHandle?

    var isManagedRunning: Bool { task?.isRunning ?? false }

    func start() {
        guard !Health.shared.online else { return }
        task = Process()
        guard let t = task else { return }
        t.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        t.arguments = ["node", "\(ROOT)/server/index.js"]
        var env = ProcessInfo.processInfo.environment
        env["DR_ENABLE_API"] = "1"
        env["DR_GM_TOKEN"] = GMTOKEN
        // Debug fixtures (teleport, clearCombat, setSkills...) stay OFF by
        // default — they are state-mutating test surfaces. The operator opts
        // in explicitly via DR_ENABLE_DEBUG_API=1 plus a DR_DEBUG_TOKEN they
        // chose (mapper-agent reads the same value from DR_MAPPER_DEBUG).
        if let dbg = ProcessInfo.processInfo.environment["DR_DEBUG_TOKEN"], !dbg.isEmpty {
            env["DR_ENABLE_DEBUG_API"] = "1"
            env["DR_DEBUG_TOKEN"] = dbg
        }
        t.environment = env
        t.currentDirectoryURL = URL(fileURLWithPath: ROOT)
        // pipe output to a log file
        FileManager.default.createFile(atPath: LOG_PATH, contents: nil, attributes: nil)
        logHandle = FileHandle(forWritingAtPath: LOG_PATH)
        t.standardOutput = logHandle
        t.standardError = logHandle
        do {
            try t.run()
            Health.shared.markBooting(seconds: 6)
            // If the child dies (crash, duplicate-world refusal), surface it
            // instead of silently keeping a zombie handle around.
            t.terminationHandler = { [weak self] proc in
                DispatchQueue.main.async {
                    guard proc === self?.task else { return }
                    self?.task = nil
                    Health.shared.probe()
                    if proc.terminationStatus != 0 {
                        let n = NSUserNotification()
                        n.title = "Dragon Realms"
                        n.informativeText = "World process exited (status \(proc.terminationStatus)). See /tmp/dr-world.log."
                        NSUserNotificationCenter.default.deliver(n)
                    }
                }
            }
        } catch {
            task = nil
        }
    }

    func stop() {
        guard let t = task, t.isRunning else { return }
        t.terminate()
        task = nil
        try? logHandle?.close()
    }

    func reload() {
        guard Health.shared.online else { return }
        // Use the EFFECTIVE token — if the running world was started by
        // something else, our own GMTOKEN would be rejected (silent 401).
        let token = effectiveToken()
        var req = URLRequest(url: URL(string: "\(BASE)/api/gm/admin/reload")!)
        req.httpMethod = "GET"
        req.timeoutInterval = 10
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let task = URLSession.shared.dataTask(with: req) { _, resp, _ in
            DispatchQueue.main.async {
                let n = NSUserNotification()
                n.title = "Dragon Realms"
                if let h = resp as? HTTPURLResponse, h.statusCode == 200 {
                    n.informativeText = "World data reloaded."
                } else {
                    n.informativeText = "Reload rejected by the world (check GM credential)."
                }
                NSUserNotificationCenter.default.deliver(n)
            }
        }
        task.resume()
    }
}

final class CompactSimsView: NSView {
    init(variant: String, colors: [NSColor]) {
        super.init(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        let icon = NSImageView(image: NSImage(systemSymbolName: "sword", accessibilityDescription: "Barbarian guild") ?? NSImage(systemSymbolName: "figure.fencing", accessibilityDescription: "Barbarian guild")!)
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.contentTintColor = .systemRed
        let label = NSTextField(labelWithString: variant)
        label.translatesAutoresizingMaskIntoConstraints = false
        label.lineBreakMode = .byTruncatingTail
        let blips = NSStackView()
        blips.translatesAutoresizingMaskIntoConstraints = false
        blips.orientation = .horizontal
        blips.spacing = 2
        for color in colors {
            let b = NSView()
            b.translatesAutoresizingMaskIntoConstraints = false
            b.wantsLayer = true
            b.layer?.backgroundColor = color.cgColor
            b.layer?.cornerRadius = 2
            blips.addArrangedSubview(b)
            NSLayoutConstraint.activate([b.widthAnchor.constraint(equalToConstant: 7), b.heightAnchor.constraint(equalToConstant: 11)])
        }
        addSubview(icon); addSubview(label); addSubview(blips)
        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8), icon.centerYAnchor.constraint(equalTo: centerYAnchor), icon.widthAnchor.constraint(equalToConstant: 16), icon.heightAnchor.constraint(equalToConstant: 16),
            label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 6), label.centerYAnchor.constraint(equalTo: centerYAnchor),
            blips.leadingAnchor.constraint(greaterThanOrEqualTo: label.trailingAnchor, constant: 8), blips.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8), blips.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSUserNotificationCenterDelegate {
    private var statusItem: NSStatusItem!
    private var menu: NSMenu!
    /// Skip rebuilds while the user has the menu open — swapping the menu out
    /// from under an open tracking session is what made items feel dead.
    private var menuOpen = false

    func applicationDidFinishLaunching(_ n: Notification) {
        NSApp.setActivationPolicy(.accessory) // menu-bar only (no Dock icon)
        NSUserNotificationCenter.default.delegate = self

        menu = NSMenu()
        menu.delegate = self
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        guard let button = statusItem.button else { return }
        let icon = NSImage(systemSymbolName: "dragon", accessibilityDescription: "Dragon Realms")
        // Slightly larger than the menu-bar default (~16-18pt) for visibility.
        icon?.size = NSSize(width: 24, height: 24)
        button.image = icon
        // fall back to an emoji title if the symbol is unavailable
        if button.image == nil {
            button.title = "🐉"
            button.font = NSFont.systemFont(ofSize: 17)
        }
        statusItem.menu = menu

        Health.shared.bind(onChange: { [weak self] _ in self?.refreshIcon() })
        Health.shared.probe()

        // Background honesty poll: keeps the icon tint current without ever
        // touching the menu while it is open. The menu contents themselves are
        // rebuilt lazily via menuNeedsUpdate when the user opens it.
        Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Health.shared.probe()
            _ = self // icon refresh happens through the health callback
        }
        refreshIcon()
    }

    func menuWillOpen(_ m: NSMenu) {
        menuOpen = true
        Health.shared.probe() // freshest possible answer right as it opens
        rebuildMenu()
    }
    func menuDidClose(_ m: NSMenu) { menuOpen = false }
    func menuNeedsUpdate(_ m: NSMenu) { rebuildMenu() }

    private func refreshIcon() {
        guard let button = statusItem?.button else { return }
        button.contentTintColor = Health.shared.online
            ? NSColor.systemGreen
            : NSColor.systemGray
        button.appearsDisabled = !Health.shared.online
    }

    private func rebuildMenu() {
        guard let m = menu else { return }
        m.removeAllItems()

        let online = Health.shared.online
        let state = NSMenuItem(title: online ? "● World online" : "○ World offline", action: nil, keyEquivalent: "")
        state.isEnabled = false
        m.addItem(state)
        m.addItem(.separator())

        for a in [Action.admin, .gm, .copyToken, .play, .sims, .roadmap] {
            m.addItem(NSMenuItem(title: a.rawValue, action: #selector(runAction(_:)), keyEquivalent: "").then {
                $0.target = self; $0.representedObject = a.rawValue
            })
        }
        // Quick Play submenu: one click into an auto-provisioned boosted
        // character (same ?play= deep link the admin dash uses). Boost is
        // fixed at x20 here; finer control lives on the dash.
        let qp = NSMenu()
        for g in ["barbarian", "empath", "warmage", "bard", "thief", "ranger"] {
            let it = NSMenuItem(title: g.capitalized, action: #selector(quickPlay(_:)), keyEquivalent: "")
            it.target = self
            it.representedObject = g
            qp.addItem(it)
        }
        let qpItem = NSMenuItem(title: "Quick Play (boost x20)", action: nil, keyEquivalent: "")
        qpItem.submenu = qp
        m.addItem(qpItem)
        m.addItem(.separator())
        if online || World.shared.isManagedRunning {
            m.addItem(NSMenuItem(title: "Stop World", action: #selector(runAction(_:)), keyEquivalent: "").then {
                $0.target = self; $0.representedObject = Action.stop.rawValue
            })
        } else {
            m.addItem(NSMenuItem(title: Action.start.rawValue, action: #selector(runAction(_:)), keyEquivalent: "").then {
                $0.target = self; $0.representedObject = Action.start.rawValue
            })
        }
        m.addItem(NSMenuItem(title: Action.reload.rawValue, action: #selector(runAction(_:)), keyEquivalent: "").then {
            $0.target = self; $0.representedObject = Action.reload.rawValue
        })
        m.addItem(.separator())
        for item in compactSimsItems() { m.addItem(item) }
        m.addItem(.separator())
        m.addItem(NSMenuItem(title: Action.quit.rawValue, action: #selector(runAction(_:)), keyEquivalent: "q").then {
            $0.target = self; $0.representedObject = Action.quit.rawValue
        })
    }

    private func compactSimsItems() -> [NSMenuItem] {
        guard let data = FileManager.default.contents(atPath: "\(ROOT)/public/live/experiment-current.json"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let plan = obj["plan"] as? [[String: Any]] else {
            return [compactSimsItem(title: "Sims  ·  EXP unavailable")]
        }
        let runID = obj["runId"] as? String ?? ""
        let capMinutes = (obj["minutesPerLeg"] as? NSNumber)?.doubleValue ?? 20
        let startedAt = (obj["startedAt"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) }
        let remaining = startedAt.map { max(0, Int(ceil(capMinutes * 60 - Date().timeIntervalSince($0)))) }
        let running = plan.filter { ($0["status"] as? String) == "running" }
        if running.isEmpty { return [compactSimsItem(title: "Sims  ·  no active workers")] }
        return running.map { worker in
            let variant = worker["variant"] as? String ?? "unknown"
            let char = worker["char"] as? String ?? ""
            return compactSimsItem(variant: variant, runID: runID, char: char, remainingSeconds: remaining)
        }
    }

    private func compactSimsItem(title: String? = nil, variant: String? = nil, runID: String = "", char: String = "", remainingSeconds: Int? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title ?? "Sims  ·  \(variant ?? "unknown")", action: #selector(openSims(_:)), keyEquivalent: "")
        item.target = self
        guard let variant else { return item }
        var colors = Array(repeating: NSColor.systemRed, count: 16)
        let liveDir = "\(ROOT)/public/live"
        if let files = try? FileManager.default.contentsOfDirectory(atPath: liveDir),
           let name = files.filter({ $0.contains(variant) && $0.contains(runID) && $0.hasSuffix(".log") }).sorted().last,
           let text = try? String(contentsOfFile: "\(liveDir)/\(name)", encoding: .utf8),
           let line = text.split(separator: "\n").last(where: { $0.contains("[reqs]") }) {
            let lineString = String(line)
            let pairRegex = try? NSRegularExpression(pattern: "([0-9]+)\\/([0-9]+)")
            let range = NSRange(lineString.startIndex..<lineString.endIndex, in: lineString)
            for (i, match) in (pairRegex?.matches(in: lineString, options: [], range: range) ?? []).prefix(16).enumerated() {
                if let haveRange = Range(match.range(at: 1), in: lineString),
                   let needRange = Range(match.range(at: 2), in: lineString),
                   let have = Int(lineString[haveRange]), let need = Int(lineString[needRange]) {
                    colors[i] = have >= need + 4 ? NSColor.systemPurple : have >= need ? NSColor.systemGreen : have + 2 >= need ? NSColor.systemOrange : NSColor.systemRed
                }
            }
        }
        let remainingText = remainingSeconds.map { " · \($0 / 60)m \($0 % 60)s left" } ?? ""
        item.view = CompactSimsView(variant: variant + remainingText, colors: colors)
        item.toolTip = "Condensed EXP: green met · orange within 2 · red unmet · purple overtrained"
        return item
    }

    @objc private func openSims(_ sender: NSMenuItem) {
        NSWorkspace.shared.open(URL(string: "\(BASE)/sims.html#exp")!)
    }

    @objc private func quickPlay(_ sender: NSMenuItem) {
        // Start the world first if it isn't up — the deep link will land on a
        // live client either way once the server answers.
        if !Health.shared.online { World.shared.start() }
        guard let guild = sender.representedObject as? String else { return }
        let url = "\(BASE)/?play=\(guild)&boost=20#gm=\(effectiveToken())"
        NSWorkspace.shared.open(URL(string: url)!)
    }

    @objc private func runAction(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let a = Action(rawValue: raw) else { return }
        switch a {
        case .admin: NSWorkspace.shared.open(URL(string: "\(BASE)/admin.html#gm=\(effectiveToken())")!)
        case .gm: NSWorkspace.shared.open(URL(string: "\(BASE)/gm.html#gm=\(effectiveToken())")!)
        case .copyToken:
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(effectiveToken(), forType: .string)
            let n = NSUserNotification()
            n.title = "Dragon Realms"
            n.informativeText = "GM token copied to the clipboard."
            NSUserNotificationCenter.default.deliver(n)
        case .play: NSWorkspace.shared.open(URL(string: "\(BASE)/")!)
        case .sims: NSWorkspace.shared.open(URL(string: "\(BASE)/sims.html#exp")!)
        case .roadmap: NSWorkspace.shared.open(URL(string: "\(BASE)/ROADMAP.html")!)
        case .start: World.shared.start()
        case .stop: World.shared.stop()
        case .reload: World.shared.reload()
        case .quit: World.shared.stop(); NSApp.terminate(nil)
        }
    }
}

extension NSMenuItem {
    func then(_ f: (NSMenuItem) -> Void) -> NSMenuItem { f(self); return self }
}

let app = NSApplication.shared
// Single instance: if another dradmin is running, bring its status item to
// the front and quit (prevents stacking duplicate world processes).
struct Singleton {
    static let lockFile = "/tmp/dradmin.lock"
    static func claim() -> Bool {
        if FileManager.default.fileExists(atPath: lockFile) {
            if let pidStr = try? String(contentsOfFile: lockFile, encoding: .utf8),
               let pid = Int(pidStr.trimmingCharacters(in: .whitespacesAndNewlines)),
               kill(pid_t(pid), 0) == 0 {
                return false
            }
            try? FileManager.default.removeItem(atPath: lockFile)
        }
        try? String(ProcessInfo.processInfo.processIdentifier).write(toFile: lockFile, atomically: true, encoding: .utf8)
        return true
    }
}
if !Singleton.claim() {
    print("dradmin already running — quitting duplicate")
    exit(0)
}
let delegate = AppDelegate()
app.delegate = delegate
app.run()
try? FileManager.default.removeItem(atPath: Singleton.lockFile)
