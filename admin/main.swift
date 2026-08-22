// Dragon Realms — menu-bar admin app (native Swift + AppKit).
// A status item in the menu bar; right-click (or click) opens a menu with the
// admin dash, GM console, play, roadmap, Start/Stop World, Reload, and Quit.
// Manages the live Node world server as a child process.
//
// Build: swiftc -O admin/main.swift -o bins/dradmin
// Run:   bins/dradmin  (or bundle into a .app for a Dock + menu presence)
//
// The forward-declared AppDelegate/handlers keep actions real (target+selector).

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

// A server already running on the port publishes its credential to this file
// (server/index.js). Prefer it over our own token so "Copy GM Token" and the
// Open-Dash handoff match whatever world is actually answering on :3000.
func liveWorldToken() -> String? {
    // Per-port token file (server/index.js publishes dr-world-token-<port>.json).
    let path = "/tmp/dr-world-token-\(PORT).json"
    guard let data = FileManager.default.contents(atPath: path),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let token = obj["token"] as? String, !token.isEmpty
    else { return nil }
    // Stale file from a world that has since died? The health check below decides.
    return token
}

let ROOT = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).path
let PORT = 3000
// Token resolution: env > running world's published credential > fresh random.
// When we start the world ourselves, OUR token wins and gets published by the
// child; when a world is already up, ITS published token is authoritative.
let GMTOKEN = configuredOrRandomGMToken()
func effectiveToken() -> String {
    if let env = ProcessInfo.processInfo.environment["DR_GM_TOKEN"], !env.isEmpty { return env }
    if worldOnline(), let live = liveWorldToken() { return live }
    return GMTOKEN
}
let BASE = "http://127.0.0.1:\(PORT)"
let LOG_PATH = "/tmp/dr-world.log"

func worldOnline() -> Bool {
    guard let url = URL(string: "\(BASE)/api/health"),
          let data = try? Data(contentsOf: url) else { return false }
    return !data.isEmpty
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

    func start() {
        guard !worldOnline() else { return }
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
        do { try t.run() } catch { task = nil }
    }

    func stop() {
        guard let t = task, t.isRunning else { return }
        t.terminate()
        task = nil
        try? logHandle?.close()
    }

    func reload() {
        guard worldOnline() else { return }
        var req = URLRequest(url: URL(string: "\(BASE)/api/gm/admin/reload")!)
        req.httpMethod = "GET"
        req.setValue("Bearer \(GMTOKEN)", forHTTPHeaderField: "Authorization")
        let task = URLSession.shared.dataTask(with: req) { _, resp, _ in
            if let h = resp as? HTTPURLResponse, h.statusCode == 200 {
                let n = NSUserNotification()
                n.title = "Dragon Realms"
                n.informativeText = "World data reloaded."
                NSUserNotificationCenter.default.deliver(n)
            }
        }
        task.resume()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSUserNotificationCenterDelegate {
    private var statusItem: NSStatusItem!
    private var menu: NSMenu!

    func applicationDidFinishLaunching(_ n: Notification) {
        NSApp.setActivationPolicy(.accessory) // menu-bar only (no Dock icon)
        NSUserNotificationCenter.default.delegate = self
        menu = buildMenu()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: "dragon", accessibilityDescription: "Dragon Realms")
        // fall back to an emoji title if the symbol is unavailable
        if button.image == nil { button.title = "🐉" }
        statusItem.menu = menu
        // keep Start/Stop/State fresh
        Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [weak self] _ in
            self?.menu = self?.buildMenu() ?? NSMenu()
            self?.statusItem.menu = self?.menu
        }
    }

    private func buildMenu() -> NSMenu {
        let m = NSMenu()
        let online = worldOnline()
        let state = NSMenuItem(title: online ? "● World online" : "○ World offline", action: nil, keyEquivalent: "")
        state.isEnabled = false
        m.addItem(state)
        m.addItem(.separator())

        for a in [Action.admin, .gm, .copyToken, .play, .roadmap] {
            m.addItem(NSMenuItem(title: a.rawValue, action: #selector(runAction(_:)), keyEquivalent: "").then {
                $0.target = self; $0.representedObject = a.rawValue
            })
        }
        m.addItem(.separator())
        if online {
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
        return m
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
