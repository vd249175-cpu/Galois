import SwiftUI
import Combine

/// **Blood (血液)**: The central, unified state manager.
/// Components modify the state rather than communicating directly.
/// The state changes are broadcast via Combine publishers.
public final class Blood: ObservableObject {
    public static let shared = Blood()
    
    // Core state storage
    @Published private var state: [String: Any] = [:]
    
    // Broadcasts which channels have changed
    public let channelPublisher = PassthroughSubject<Set<String>, Never>()
    
    public init() {}
    
    /// Retrieve value from a state channel
    public func getValue<T>(_ channel: String, default defaultValue: T) -> T {
        return state[channel] as? T ?? defaultValue
    }
    
    /// Update multiple state channels and trigger broadcast
    public func update(_ values: [String: Any]) {
        var modified = Set<String>()
        for (channel, value) in values {
            // Compare and update (simplified)
            state[channel] = value
            modified.insert(channel)
        }
        if !modified.isEmpty {
            channelPublisher.send(modified)
        }
    }
    
    /// Update a single state channel
    public func update(_ channel: String, _ value: Any) {
        update([channel: value])
    }
}
