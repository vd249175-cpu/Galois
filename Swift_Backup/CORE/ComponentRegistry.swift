import SwiftUI

/// **AreaComponent**: Protocol representing a mountable workspace panel type.
public protocol AreaComponent {
    var typeId: String { get }
    var displayName: String { get }
    var iconName: String { get }
    
    /// Dynamic view instantiator
    func makeView(areaId: UUID, blood: Blood) -> AnyView
}

/// **ComponentRegistry**: Central manager for registering layout plugins.
public final class ComponentRegistry: ObservableObject {
    public static let shared = ComponentRegistry()
    
    @Published public private(set) var registeredComponents: [String: AreaComponent] = [:]
    
    public init() {}
    
    public var availableTypes: [String] {
        return Array(registeredComponents.keys).sorted()
    }
    
    public func register(_ component: AreaComponent) {
        registeredComponents[component.typeId] = component
    }
    
    public func getComponent(_ typeId: String) -> AreaComponent? {
        return registeredComponents[typeId]
    }
}
