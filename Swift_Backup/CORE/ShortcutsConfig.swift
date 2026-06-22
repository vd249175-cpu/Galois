import Foundation
import SwiftUI

/// Shortcut configuration model mapping keys and modifier names
public struct ShortcutKeyConfig: Codable, Hashable {
    public var key: String             // e.g. "s", "k", "z"
    public var modifiers: [String]     // e.g. ["command", "shift", "option", "control"]
    
    public init(key: String, modifiers: [String]) {
        self.key = key
        self.modifiers = modifiers
    }
    
    /// Convert to SwiftUI EventModifiers
    public var eventModifiers: EventModifiers {
        var result: EventModifiers = []
        if modifiers.contains("command") { result.insert(.command) }
        if modifiers.contains("shift") { result.insert(.shift) }
        if modifiers.contains("option") { result.insert(.option) }
        if modifiers.contains("control") { result.insert(.control) }
        return result
    }
    
    /// Convert string representation to KeyEquivalent
    public var keyEquivalent: KeyEquivalent {
        if key.count == 1, let char = key.first {
            return KeyEquivalent(char)
        }
        // Fallbacks
        return KeyEquivalent(" ")
    }
}

/// Dynamic manager for hotkey mappings config file
public class ShortcutsConfig: ObservableObject {
    public static let shared = ShortcutsConfig()
    
    @Published public var mappings: [String: ShortcutKeyConfig] = [:]
    private var configURL: URL {
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        // Store in local directory or project root path
        return paths[0].appendingPathComponent("dnote_shortcuts.json")
    }
    
    public init() {
        load()
    }
    
    /// Load shortcuts mappings from JSON file
    public func load() {
        if let data = try? Data(contentsOf: configURL),
           let decoded = try? JSONDecoder().decode([String: ShortcutKeyConfig].self, from: data) {
            self.mappings = decoded
        } else {
            // Write defaults if file does not exist
            self.mappings = [
                "editor.save": ShortcutKeyConfig(key: "s", modifiers: ["command"]),
                "terminal.clear": ShortcutKeyConfig(key: "k", modifiers: ["command"]),
                "sidebar.toggle": ShortcutKeyConfig(key: "b", modifiers: ["command"])
            ]
            save()
        }
    }
    
    /// Update shortcut mapping for a specific action ID
    public func updateMapping(actionId: String, key: String, modifiers: [String]) {
        self.mappings[actionId] = ShortcutKeyConfig(key: key, modifiers: modifiers)
        save()
    }
    
    /// Save current mappings to JSON file
    public func save() {
        if let data = try? JSONEncoder().encode(mappings) {
            try? data.write(to: configURL)
        }
    }
}
