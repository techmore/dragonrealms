// Dragon Realms — menu-bar admin app (native Swift + AppKit).
// A status item in the menu bar; right-click (or click) opens a menu with the
// admin dash, GM console, play, roadmap, Start/Stop World, Reload, and Quit.
// Manages the live Node world server as a child process.
//
// Build: swiftc -O admin/main.swift -o bins/dradmin
// Run:   bins/dradmin  (or bundle into a .app for a Dock + menu presence)
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

let ROOT = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).path
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
        // Mapper/bot audit harness needs the debug fixtures (teleport,
        // clearCombat) and a stable secret. Configurable via env; the mapper
        // agent reads the same value from DR_MAPPER_DEBUG.
        env["DR_ENABLE_DEBUG_API"] = "1"
        env["DR_DEBUG_TOKEN"] = ProcessInfo.processInfo.environment["DR_DEBUG_TOKEN"] ?? "mapper-debug-1"
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

        for a in [Action.admin, .gm, .copyToken, .play, .roadmap] {
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
        m.addItem(NSMenuItem(title: Action.quit.rawValue, action: #selector(runAction(_:)), keyEquivalent: "q").then {
            $0.target = self; $0.representedObject = Action.quit.rawValue
        })
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
