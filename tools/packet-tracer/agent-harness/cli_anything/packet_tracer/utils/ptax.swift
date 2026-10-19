// ptax — macOS Accessibility bridge used by cli-anything-packet-tracer.
//
// Packet Tracer ships no scripting interface. This helper drives the real
// application through the Accessibility (AX) API so the harness always
// operates on live application state instead of a reimplementation.
//
// Build: swiftc -O -o ptax ptax.swift -framework ApplicationServices -framework AppKit
// Usage: see `ptax help`.

import AppKit
import ApplicationServices
import Foundation

// MARK: - JSON output

func emit(_ object: Any, ok: Bool = true) -> Never {
    let payload: [String: Any] = ok ? ["ok": true, "data": object] : ["ok": false, "error": object]
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
       let text = String(data: data, encoding: .utf8) {
        print(text)
    } else {
        print("{\"ok\":false,\"error\":\"failed to encode JSON\"}")
    }
    exit(ok ? 0 : 1)
}

func fail(_ message: String) -> Never {
    emit(message, ok: false)
}

// MARK: - Process + AX plumbing

let systemWide = AXUIElementCreateSystemWide()

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    guard status == .success else { return nil }
    return value
}

func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
    guard let value = attribute(element, name) else { return nil }
    if let string = value as? String { return string }
    if let number = value as? NSNumber { return number.stringValue }
    return nil
}

func boolAttribute(_ element: AXUIElement, _ name: String) -> Bool? {
    guard let value = attribute(element, name) else { return nil }
    if let bool = value as? Bool { return bool }
    if let number = value as? NSNumber { return number.boolValue }
    return nil
}

func pointAttribute(_ element: AXUIElement, _ name: String) -> CGPoint? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    if AXValueGetValue(value as! AXValue, .cgPoint, &point) { return point }
    return nil
}

func sizeAttribute(_ element: AXUIElement, _ name: String) -> CGSize? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    var size = CGSize.zero
    if AXValueGetValue(value as! AXValue, .cgSize, &size) { return size }
    return nil
}

func axElement(_ value: AnyObject?) -> AXUIElement? {
    guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return unsafeBitCast(value, to: AXUIElement.self)
}

func axArray(_ value: AnyObject?) -> [AXUIElement] {
    guard let value, CFGetTypeID(value) == CFArrayGetTypeID() else { return [] }
    let array = unsafeBitCast(value, to: CFArray.self)
    return (0..<CFArrayGetCount(array)).map { index in
        unsafeBitCast(CFArrayGetValueAtIndex(array, index), to: AXUIElement.self)
    }
}

func children(_ element: AXUIElement) -> [AXUIElement] {
    axArray(attribute(element, kAXChildrenAttribute as String))
}

func role(_ element: AXUIElement) -> String {
    stringAttribute(element, kAXRoleAttribute as String) ?? ""
}

func title(_ element: AXUIElement) -> String {
    stringAttribute(element, kAXTitleAttribute as String) ?? ""
}

func description(_ element: AXUIElement) -> String {
    stringAttribute(element, kAXDescriptionAttribute as String) ?? ""
}

func valueString(_ element: AXUIElement) -> String {
    guard let value = attribute(element, kAXValueAttribute as String) else { return "" }
    if let string = value as? String { return string }
    if let number = value as? NSNumber { return number.stringValue }
    return ""
}

func actionNames(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success,
          let list = names as? [String] else { return [] }
    return list
}

func screenFrame(_ element: AXUIElement) -> CGRect? {
    guard let position = pointAttribute(element, kAXPositionAttribute as String),
          let size = sizeAttribute(element, kAXSizeAttribute as String) else { return nil }
    return CGRect(origin: position, size: size)
}

// MARK: - Application lookup

struct TargetApp {
    let pid: pid_t
    let name: String
    let bundleID: String
}

func findPacketTracer() -> TargetApp? {
    let workspace = NSWorkspace.shared
    for app in workspace.runningApplications {
        let name = app.localizedName ?? ""
        let bundle = app.bundleIdentifier ?? ""
        let executable = app.executableURL?.path ?? ""
        if bundle.lowercased().contains("packettracer")
            || name.lowercased().contains("packet tracer")
            || name == "PacketTracer"
            || executable.lowercased().contains("packettracer") {
            return TargetApp(pid: app.processIdentifier, name: name, bundleID: bundle)
        }
    }
    return nil
}

func applicationElement(_ target: TargetApp) -> AXUIElement {
    AXUIElementCreateApplication(target.pid)
}

func appWindows(_ app: AXUIElement) -> [AXUIElement] {
    axArray(attribute(app, kAXWindowsAttribute as String))
}

func selectWindow(_ app: AXUIElement, named: String?, index: Int) -> AXUIElement? {
    let windows = appWindows(app)
    if let wanted = named {
        if let exact = windows.first(where: { windowTitle($0) == wanted }) { return exact }
        if let contains = windows.first(where: { windowTitle($0).localizedCaseInsensitiveContains(wanted) }) { return contains }
        return nil
    }
    if let main = windows.first(where: { windowTitle($0).localizedCaseInsensitiveContains("Packet Tracer") }) {
        return main
    }
    return index < windows.count ? windows[index] : windows.first
}

/// Search scope for element commands: a named window, or every window with the
/// main application window first so palette/toolbar lookups win over dialogs.
func searchScope(_ app: AXUIElement, named: String?, index: Int) -> [AXUIElement] {
    if let wanted = named {
        if let window = selectWindow(app, named: wanted, index: index) { return [window] }
        return []
    }
    let windows = appWindows(app)
    let main = windows.filter { windowTitle($0).localizedCaseInsensitiveContains("Packet Tracer") }
    let rest = windows.filter { !windowTitle($0).localizedCaseInsensitiveContains("Packet Tracer") }
    return main + rest
}

func windowTitle(_ window: AXUIElement) -> String {
    let titleValue = title(window)
    if !titleValue.isEmpty { return titleValue }
    return stringAttribute(window, kAXDocumentAttribute as String) ?? ""
}

// MARK: - CLI parsing

struct Arguments {
    var command: String = "help"
    var flags: [String: String] = [:]
    var switches: Set<String> = []

    init(_ raw: [String]) {
        var iterator = raw.makeIterator()
        var positional: [String] = []
        var pending: String? = nil
        while true {
            let token = pending ?? iterator.next()
            pending = nil
            guard let token else { break }
            if token.hasPrefix("--") {
                let body = String(token.dropFirst(2))
                if let equals = body.firstIndex(of: "=") {
                    let key = String(body[..<equals])
                    flags[key] = String(body[body.index(after: equals)...])
                } else {
                    let next = iterator.next()
                    if let next, next.hasPrefix("--") {
                        switches.insert(body)
                        pending = next
                    } else if let next {
                        flags[body] = next
                    } else {
                        switches.insert(body)
                    }
                }
            } else {
                positional.append(token)
            }
        }
        if let first = positional.first { command = first }
        if flags["index"] == nil, let value = flags["i"] { flags["index"] = value }
    }

    func flag(_ name: String, default fallback: String? = nil) -> String? {
        flags[name] ?? fallback
    }

    func intFlag(_ name: String, default fallback: Int) -> Int {
        if let raw = flags[name], let value = Int(raw) { return value }
        return fallback
    }

    func has(_ name: String) -> Bool {
        switches.contains(name) || flags[name] != nil
    }
}

func flagBool(_ arguments: Arguments, _ name: String, default fallback: Bool) -> Bool {
    if arguments.switches.contains(name) { return true }
    if let raw = arguments.flags[name] {
        return ["1", "true", "yes", "on"].contains(raw.lowercased())
    }
    return fallback
}

// MARK: - Element serialization

func serialize(_ element: AXUIElement, depth: Int, maxDepth: Int, includeActions: Bool) -> [String: Any] {
    var node: [String: Any] = [
        "role": role(element),
        "title": title(element),
        "name": stringAttribute(element, kAXTitleAttribute as String) ?? "",
        "description": description(element),
        "value": valueString(element),
    ]
    if node["name"] as? String == "" {
        node["name"] = description(element)
    }
    if let identifier = stringAttribute(element, kAXIdentifierAttribute as String), !identifier.isEmpty {
        node["identifier"] = identifier
    }
    if let helper = stringAttribute(element, kAXHelpAttribute as String), !helper.isEmpty {
        node["help"] = helper
    }
    if let enabled = boolAttribute(element, kAXEnabledAttribute as String) {
        node["enabled"] = enabled
    }
    if let frame = screenFrame(element) {
        node["position"] = [frame.origin.x, frame.origin.y]
        node["size"] = [frame.size.width, frame.size.height]
    }
    if includeActions {
        node["actions"] = actionNames(element)
    }
    if depth < maxDepth {
        let kids = children(element)
        if !kids.isEmpty {
            node["children"] = kids.map { serialize($0, depth: depth + 1, maxDepth: maxDepth, includeActions: includeActions) }
        }
    }
    return node
}

func elementBag(_ element: AXUIElement) -> [[String: Any]] {
    var bag: [[String: Any]] = []
    var stack: [(AXUIElement, Int)] = [(element, 0)]
    while let (current, depth) = stack.popLast() {
        var node: [String: Any] = [
            "role": role(current),
            "title": title(current),
            "description": description(current),
            "value": valueString(current),
        ]
        if let identifier = stringAttribute(current, kAXIdentifierAttribute as String), !identifier.isEmpty {
            node["identifier"] = identifier
        }
        if let frame = screenFrame(current) {
            node["position"] = [frame.origin.x, frame.origin.y]
            node["size"] = [frame.size.width, frame.size.height]
        }
        bag.append(node)
        for child in children(current) {
            stack.append((child, depth + 1))
        }
    }
    return bag
}

func matches(_ element: AXUIElement, name: String?, role wanted: String?, contains: Bool, identifier wantedIdentifier: String? = nil) -> Bool {
    if let wantedRole = wanted, role(element) != wantedRole { return false }
    if let wantedIdentifier {
        let identifier = stringAttribute(element, kAXIdentifierAttribute as String) ?? ""
        if !identifier.localizedCaseInsensitiveContains(wantedIdentifier) { return false }
        if name == nil { return true }
    }
    guard let wantedName = name else { return true }
    let candidates = [title(element), description(element), valueString(element), stringAttribute(element, kAXIdentifierAttribute as String) ?? ""]
    if contains {
        return candidates.contains { $0.localizedCaseInsensitiveContains(wantedName) }
    }
    return candidates.contains { $0 == wantedName }
}

func findElements(_ root: AXUIElement, name: String?, role wanted: String?, contains: Bool, limit: Int, identifier: String? = nil) -> [AXUIElement] {
    var results: [AXUIElement] = []
    var stack: [AXUIElement] = [root]
    while let current = stack.popLast() {
        if matches(current, name: name, role: wanted, contains: contains, identifier: identifier) {
            results.append(current)
            if results.count >= limit { break }
        }
        stack.append(contentsOf: children(current))
    }
    return results
}

func findAcross(_ roots: [AXUIElement], name: String?, role wanted: String?, contains: Bool, limit: Int, identifier: String? = nil) -> [AXUIElement] {
    var results: [AXUIElement] = []
    for root in roots {
        results.append(contentsOf: findElements(root, name: name, role: wanted, contains: contains, limit: limit - results.count, identifier: identifier))
        if results.count >= limit { break }
    }
    return results
}

// MARK: - Menus

func menuBarTree(_ app: AXUIElement) -> [[String: Any]] {
    guard let menuBar = axElement(attribute(app, kAXMenuBarAttribute as String)) else { return [] }
    return children(menuBar).map { item in
        var node: [String: Any] = ["title": title(item)]
        let menus = children(item)
        if let menu = menus.first(where: { role($0) == "AXMenu" }) {
            node["items"] = children(menu).map { menuItem in
                var child: [String: Any] = ["title": title(menuItem)]
                if let enabled = boolAttribute(menuItem, kAXEnabledAttribute as String) { child["enabled"] = true && enabled }
                if let submenu = children(menuItem).first(where: { role($0) == "AXMenu" }) {
                    child["items"] = children(submenu).map { subItem in
                        ["title": title(subItem), "enabled": boolAttribute(subItem, kAXEnabledAttribute as String) ?? true]
                    }
                }
                return child
            }
        }
        return node
    }
}

func findMenuItem(_ app: AXUIElement, path: [String]) -> AXUIElement? {
    guard let menuBar = axElement(attribute(app, kAXMenuBarAttribute as String)) else { return nil }
    var current: AXUIElement? = nil
    var level: [AXUIElement] = children(menuBar)
    for (index, segment) in path.enumerated() {
        guard let match = level.first(where: { title($0) == segment }) else { return nil }
        if index == path.count - 1 {
            current = match
            break
        }
        var nextLevel: [AXUIElement] = []
        for container in children(match) {
            nextLevel.append(contentsOf: children(container))
        }
        level = nextLevel
        current = match
    }
    return current
}

// MARK: - Input synthesis

func activate(_ target: TargetApp) {
    if let app = NSRunningApplication(processIdentifier: target.pid) {
        app.activate(options: [.activateIgnoringOtherApps])
    }
    usleep(120_000)
}

func mouseClick(_ point: CGPoint, count: Int = 1) {
    let source = CGEventSource(stateID: .hidSystemState)
    for index in 1...max(1, count) {
        let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
        let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
        down?.setIntegerValueField(.mouseEventClickState, value: Int64(index))
        up?.setIntegerValueField(.mouseEventClickState, value: Int64(index))
        down?.post(tap: .cghidEventTap)
        usleep(30_000)
        up?.post(tap: .cghidEventTap)
        if index < count {
            usleep(40_000)
        }
    }
}

let keyCodeTable: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
    "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19,
    "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28,
    "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "return": 36,
    "enter": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44,
    "n": 45, "m": 46, ".": 47, "tab": 48, "space": 49, "`": 50, "delete": 51, "escape": 53,
    "esc": 53, "right": 124, "left": 123, "down": 125, "up": 126, "f1": 122, "f2": 120,
    "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109,
    "f11": 103, "f12": 111, "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
    "forwarddelete": 117,
]

func synthesizeKey(_ combo: String, target: TargetApp) {
    let parts = combo.lowercased().split(separator: "+").map(String.init)
    guard let keyName = parts.last, let keyCode = keyCodeTable[keyName] else {
        fail("unsupported key in combo: \(combo)")
    }
    var flags = CGEventFlags()
    for modifier in parts.dropLast() {
        switch modifier {
        case "cmd", "command": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "alt", "option", "opt": flags.insert(.maskAlternate)
        case "ctrl", "control": flags.insert(.maskControl)
        case "fn": flags.insert(.maskSecondaryFn)
        default: fail("unsupported modifier: \(modifier)")
        }
    }
    activate(target)
    let source = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
    down?.flags = flags
    up?.flags = flags
    down?.post(tap: .cghidEventTap)
    usleep(40_000)
    up?.post(tap: .cghidEventTap)
}

func synthesizeText(_ text: String, target: TargetApp) {
    activate(target)
    let source = CGEventSource(stateID: .hidSystemState)
    for scalar in text.unicodeScalars {
        var value = UInt16(scalar.value)
        let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
        down?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        down?.post(tap: .cghidEventTap)
        let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
        up?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        up?.post(tap: .cghidEventTap)
        usleep(12_000)
    }
}

// MARK: - Screenshot (optional, needs Screen Recording permission)

func windowScreenshot(_ window: AXUIElement, outPath: String) -> [String: Any] {
    guard let frame = screenFrame(window) else { fail("window has no screen frame") }
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        fail("CGWindowList unavailable")
    }
    var windowID: CGWindowID = 0
    for info in list {
        guard let bounds = info[kCGWindowBounds as String] as? [String: Any],
              let x = bounds["X"] as? CGFloat, let y = bounds["Y"] as? CGFloat,
              let width = bounds["Width"] as? CGFloat, let height = bounds["Height"] as? CGFloat else { continue }
        if abs(x - frame.origin.x) < 4, abs(y - frame.origin.y) < 4,
           abs(width - frame.size.width) < 4, abs(height - frame.size.height) < 4 {
            windowID = info[kCGWindowNumber as String] as? CGWindowID ?? 0
            break
        }
    }
    guard windowID != 0 else { fail("could not match AX window to a CGWindow") }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    process.arguments = ["-x", "-o", "-l\(windowID)", outPath]
    do {
        try process.run()
        process.waitUntilExit()
    } catch {
        fail("screencapture failed to launch: \(error.localizedDescription)")
    }
    guard process.terminationStatus == 0, FileManager.default.fileExists(atPath: outPath) else {
        fail("screencapture failed (Screen Recording permission for this terminal?)")
    }
    let size = (try? FileManager.default.attributesOfItem(atPath: outPath)[.size] as? Int) ?? 0
    return ["path": outPath, "bytes": size ?? 0, "windowId": Int(windowID)]
}

// MARK: - Main

let arguments = Arguments(Array(CommandLine.arguments.dropFirst()))

switch arguments.command {
case "help", "-h", "--help":
    let help = """
    ptax — Accessibility bridge for Cisco Packet Tracer (macOS)

      ptax doctor
      ptax windows
      ptax tree [--window NAME] [--index N] [--depth N] [--actions]
      ptax find --name TEXT [--role ROLE] [--contains] [--window NAME] [--limit N]
      ptax get --name TEXT [--role ROLE] [--contains] [--index N]
      ptax click --name TEXT [--role ROLE] [--contains] [--index N] [--window NAME] [--mode press|mouse] [--count N]
      ptax click-at --x PX --y PX [--count N]
      ptax set --name TEXT --value TEXT [--role ROLE] [--index N] [--window NAME]
      ptax menubar
      ptax menu-click --path "File>Open ..."
      ptax activate
      ptax type --text "..."
      ptax key --combo "cmd+s"
      ptax screenshot --window NAME --out FILE
    """
    print(help)
    exit(0)

case "doctor":
    var info: [String: Any] = [
        "accessibilityTrusted": AXIsProcessTrusted(),
        "platform": "macOS",
    ]
    if let target = findPacketTracer() {
        info["running"] = true
        info["pid"] = Int(target.pid)
        info["name"] = target.name
        info["bundleId"] = target.bundleID
        info["windowCount"] = appWindows(applicationElement(target)).count
    } else {
        info["running"] = false
    }
    let bundleCandidates = [
        "/Applications/Cisco Packet Tracer 9.0.1/Cisco Packet Tracer 9.0.1.app",
    ]
    info["installedBundles"] = bundleCandidates.filter { FileManager.default.fileExists(atPath: $0) }
    emit(info)

case "windows":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    let windows = appWindows(applicationElement(target)).map { window -> [String: Any] in
        var node: [String: Any] = ["title": windowTitle(window), "role": role(window)]
        if let frame = screenFrame(window) {
            node["position"] = [frame.origin.x, frame.origin.y]
            node["size"] = [frame.size.width, frame.size.height]
        }
        return node
    }
    emit(["pid": Int(target.pid), "windows": windows])

case "tree":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    let app = applicationElement(target)
    guard let window = selectWindow(app, named: arguments.flag("window"), index: arguments.intFlag("index", default: 0)) else {
        fail("no matching window")
    }
    let depth = arguments.intFlag("depth", default: 6)
    emit(["title": windowTitle(window), "tree": serialize(window, depth: 0, maxDepth: depth, includeActions: arguments.has("actions"))])

case "find":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    let app = applicationElement(target)
    let name = arguments.flag("name")
    let identifier = arguments.flag("identifier")
    guard name != nil || identifier != nil else { fail("--name or --identifier is required") }
    let scope = searchScope(app, named: arguments.flag("window"), index: arguments.intFlag("index", default: 0))
    let found = findAcross(scope, name: name, role: arguments.flag("role"), contains: arguments.has("contains"), limit: arguments.intFlag("limit", default: 20), identifier: identifier)
    let results = found.map { element -> [String: Any] in
        var node: [String: Any] = [
            "role": role(element),
            "title": title(element),
            "description": description(element),
            "value": valueString(element),
            "actions": actionNames(element),
        ]
        if let frame = screenFrame(element) {
            node["position"] = [frame.origin.x, frame.origin.y]
            node["size"] = [frame.size.width, frame.size.height]
        }
        return node
    }
    emit(["count": results.count, "matches": results])

case "get":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    let app = applicationElement(target)
    let name = arguments.flag("name")
    let identifier = arguments.flag("identifier")
    guard name != nil || identifier != nil else { fail("--name or --identifier is required") }
    let scope = searchScope(app, named: arguments.flag("window"), index: 0)
    guard let element = findAcross(scope, name: name, role: arguments.flag("role"), contains: arguments.has("contains"), limit: 1, identifier: identifier).first else {
        fail("no element matched \(name ?? identifier ?? "")")
    }
    var node: [String: Any] = [
        "role": role(element),
        "title": title(element),
        "description": description(element),
        "value": valueString(element),
        "actions": actionNames(element),
        "attributes": attributeNames(element),
    ]
    if let frame = screenFrame(element) {
        node["position"] = [frame.origin.x, frame.origin.y]
        node["size"] = [frame.size.width, frame.size.height]
    }
    emit(node)

case "click":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    let app = applicationElement(target)
    let name = arguments.flag("name")
    let identifier = arguments.flag("identifier")
    guard name != nil || identifier != nil else { fail("--name or --identifier is required") }
    let scope = searchScope(app, named: arguments.flag("window"), index: 0)
    let matches = findAcross(scope, name: name, role: arguments.flag("role"), contains: arguments.has("contains"), limit: arguments.intFlag("index", default: 0) + 1, identifier: identifier)
    let index = arguments.intFlag("index", default: 0)
    guard index < matches.count else { fail("no element matched \(name ?? identifier ?? "") at index \(index)") }
    let element = matches[index]
    let mode = arguments.flag("mode", default: "press") ?? "press"
    var performed = false
    var method = "AXPress"
    if mode != "mouse" {
        if AXUIElementPerformAction(element, kAXPressAction as CFString) == .success {
            performed = true
        }
    }
    if !performed {
        activate(target)
        guard let frame = screenFrame(element) else { fail("element has no screen frame for a mouse click") }
        let count = arguments.intFlag("count", default: 1)
        mouseClick(CGPoint(x: frame.midX, y: frame.midY), count: count)
        method = count > 1 ? "mouse x\(count)" : "mouse"
        performed = true
    }
    emit(["clicked": name ?? identifier ?? "", "role": role(element), "method": method])

case "click-at":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    let x = arguments.intFlag("x", default: -1)
    let y = arguments.intFlag("y", default: -1)
    guard x >= 0, y >= 0 else { fail("--x and --y are required") }
    activate(target)
    let countAt = arguments.intFlag("count", default: 1)
    mouseClick(CGPoint(x: CGFloat(x), y: CGFloat(y)), count: countAt)
    emit(["clickedAt": [x, y], "count": countAt])

case "set":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    let app = applicationElement(target)
    let name = arguments.flag("name")
    let identifier = arguments.flag("identifier")
    guard let newValue = arguments.flag("value") else { fail("--value is required") }
    guard name != nil || identifier != nil else { fail("--name or --identifier is required") }
    let scope = searchScope(app, named: arguments.flag("window"), index: 0)
    guard let element = findAcross(scope, name: name, role: arguments.flag("role"), contains: arguments.has("contains"), limit: 1, identifier: identifier).first else {
        fail("no element matched \(name ?? identifier ?? "")")
    }
    let status = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, newValue as CFTypeRef)
    guard status == .success else { fail("AXValue set failed with status \(status.rawValue)") }
    emit(["set": name ?? identifier ?? "", "value": newValue, "role": role(element)])

case "menubar":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    emit(["menus": menuBarTree(applicationElement(target))])

case "menu-click":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    guard let path = arguments.flag("path") else { fail("--path is required") }
    let segments = path.components(separatedBy: ">").map { $0.trimmingCharacters(in: .whitespaces) }
    guard let item = findMenuItem(applicationElement(target), path: segments) else { fail("menu path not found: \(path)") }
    activate(target)
    let status = AXUIElementPerformAction(item, kAXPressAction as CFString)
    guard status == .success else { fail("menu press failed with status \(status.rawValue)") }
    emit(["clicked": segments])

case "activate":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    activate(target)
    emit(["activated": Int(target.pid)])

case "type":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    guard let text = arguments.flag("text") else { fail("--text is required") }
    synthesizeText(text, target: target)
    emit(["typed": text.count])

case "key":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    guard let combo = arguments.flag("combo") else { fail("--combo is required") }
    synthesizeKey(combo, target: target)
    emit(["key": combo])

case "screenshot":
    guard let target = findPacketTracer() else { fail("Cisco Packet Tracer is not running") }
    guard let out = arguments.flag("out") else { fail("--out is required") }
    let app = applicationElement(target)
    guard let window = selectWindow(app, named: arguments.flag("window"), index: 0) else { fail("no matching window") }
    emit(windowScreenshot(window, outPath: out))

default:
    fail("unknown command: \(arguments.command)")
}

// Kept for symmetry with AX attribute dumps.
func attributeNames(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyAttributeNames(element, &names) == .success,
          let list = names as? [String] else { return [] }
    return list
}
