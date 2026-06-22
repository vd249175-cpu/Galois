import SwiftUI

/// **PoppedWindowShell**: A native macOS window host rendering a popped-out viewport component.
/// It retrieves the component type from `Blood` based on the passed UUID and mounts it.
public struct PoppedWindowShell: View {
    @Environment(\.dismiss) private var dismiss
    
    let areaId: UUID
    @ObservedObject var blood: Blood
    @ObservedObject var registry = ComponentRegistry.shared
    
    public init(areaId: UUID, blood: Blood) {
        self.areaId = areaId
        self._blood = ObservedObject(wrappedValue: blood)
    }
    
    private var componentType: String {
        blood.getValue("layout.poppedAreas.\(areaId)", default: "editor")
    }
    
    public var body: some View {
        VStack(spacing: 0) {
            if registry.getComponent(componentType) != nil {
                // Render the standard AreaShell, but now it runs in its own native window context
                AreaShell(areaId: areaId, componentType: componentType, blood: blood, isPopped: true)
            } else {
                VStack {
                    ProgressView()
                    Text("Loading workspace panel...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(minWidth: 320, minHeight: 240)
        .onReceive(blood.channelPublisher) { changedChannels in
            // If the main window layout absorbs this area back (removeArea becomes false), dismiss this native window
            if changedChannels.contains("layout.removeArea.\(areaId)") {
                if !blood.getValue("layout.removeArea.\(areaId)", default: false) {
                    dismiss()
                }
            }
        }
    }
}
