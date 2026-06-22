import SwiftUI

/// **ActionContext**: Scope arguments passed into an action handler.
/// Helps actions decide whether to operate on the active macOS window, the focused panel, or globally.
public struct ActionContext {
    public let blood: Blood
    public let activeWindowId: UUID?
    public let focusedAreaId: UUID?
    public let sourceAreaId: UUID?
    
    public init(
        blood: Blood,
        activeWindowId: UUID? = nil,
        focusedAreaId: UUID? = nil,
        sourceAreaId: UUID? = nil
    ) {
        self.blood = blood
        self.activeWindowId = activeWindowId
        self.focusedAreaId = focusedAreaId
        self.sourceAreaId = sourceAreaId
    }
    
    /// Target Area resolution order: explicit sourceArea (clicked) drops back to focusedArea (key event)
    public var targetAreaId: UUID? {
        return sourceAreaId ?? focusedAreaId
    }
}

/// **ActionButton**: Represents a registered action button that can map to hotkeys.
public struct ActionButton: Identifiable {
    public let id: String
    public var label: String
    public var iconName: String
    
    // Configurable action logic
    public let run: (ActionContext) -> Void
    
    public init(
        id: String,
        label: String,
        iconName: String,
        run: @escaping (ActionContext) -> Void
    ) {
        self.id = id
        self.label = label
        self.iconName = iconName
        self.run = run
    }
}
