import SwiftUI
import UniformTypeIdentifiers

/// **AreaShell**: The outer frame of each workspace grid area.
/// Contains the Blender-like header selector and the component content viewport.
public struct AreaShell: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismiss) private var dismiss
    
    let areaId: UUID
    let componentType: String
    let blood: Blood
    let isPopped: Bool
    
    @ObservedObject var registry = ComponentRegistry.shared
    @ObservedObject var bloodObserved: Blood
    
    // State lock to prevent multiple native windows spawning during high-frequency onChanged callbacks
    @State private var isPopping = false
    
    public init(areaId: UUID, componentType: String, blood: Blood, isPopped: Bool = false) {
        self.areaId = areaId
        self.componentType = componentType
        self.blood = blood
        self._bloodObserved = ObservedObject(wrappedValue: blood)
        self.isPopped = isPopped
    }
    
    private var isFocused: Bool {
        bloodObserved.getValue("system.focusedAreaId", default: nil as UUID?) == areaId
    }
    
    /// Calculate and render dynamic split highlighters when another panel is dragged over this one
    private var dragOverlay: AnyView? {
        let dragState = bloodObserved.getValue("system.dragState", default: [:] as [String: Any])
        guard let locationDict = dragState["location"] as? [String: CGFloat],
              let draggedIdStr = dragState["draggedId"] as? String,
              let draggedId = UUID(uuidString: draggedIdStr),
              draggedId != areaId else {
            return nil
        }
        
        let loc = CGPoint(x: locationDict["x"] ?? 0, y: locationDict["y"] ?? 0)
        
        // Fetch registered bounds of this panel
        let myFrame = bloodObserved.getValue("system.areaFrames.\(areaId)", default: [:] as [String: CGFloat])
        guard let minX = myFrame["minX"], let maxX = myFrame["maxX"],
              let minY = myFrame["minY"], let maxY = myFrame["maxY"] else {
            return nil
        }
        
        // If cursor falls within this panel, render drop-zone previews
        if loc.x >= minX && loc.x <= maxX && loc.y >= minY && loc.y <= maxY {
            let splitRes = AreaShell.calculateSplitRegion(location: loc, frame: myFrame)
            return AnyView(
                GeometryReader { geo in
                    let w = geo.size.width
                    let h = geo.size.height
                    if splitRes.direction == .horizontal {
                        Color.blue.opacity(0.2)
                            .frame(width: w * 0.5)
                            .offset(x: splitRes.insertFirst ? 0 : w * 0.5)
                    } else {
                        Color.blue.opacity(0.2)
                            .frame(height: h * 0.5)
                            .offset(y: splitRes.insertFirst ? 0 : h * 0.5)
                    }
                }
            )
        }
        return nil
    }
    
    public var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                // Header Bar (Blender style)
                HStack(spacing: 6) {
                    // Top-Left dropdown to switch panel types
                    Menu {
                        ForEach(registry.availableTypes, id: \.self) { type in
                            Button(action: {
                                blood.update("layout.changeAreaType.\(areaId)", type)
                            }) {
                                Label(
                                    registry.getComponent(type)?.displayName ?? type,
                                    systemImage: registry.getComponent(type)?.iconName ?? "square"
                                )
                            }
                        }
                    } label: {
                        Image(systemName: registry.getComponent(componentType)?.iconName ?? "square")
                            .font(.system(size: 11))
                            .foregroundColor(isFocused ? .accentColor : .secondary)
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                    
                    Text(registry.getComponent(componentType)?.displayName ?? componentType)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(isFocused ? .primary : .secondary)
                    
                    Spacer()
                    
                    // Slots for dynamically injected buttons
                    AreaInjectedToolbar(areaId: areaId, componentType: componentType, blood: blood)
                    
                    // Splitting Buttons
                    if !isPopped {
                        Button(action: {
                            blood.update("layout.splitArea.\(areaId)", "horizontal")
                        }) {
                            Image(systemName: "square.split.2x1")
                                .font(.system(size: 11))
                        }
                        .buttonStyle(.plain)
                        .help("Split Horizontally")
                        
                        Button(action: {
                            blood.update("layout.splitArea.\(areaId)", "vertical")
                        }) {
                            Image(systemName: "square.split.1x2")
                                .font(.system(size: 11))
                        }
                        .buttonStyle(.plain)
                        .help("Split Vertically")
                    }
                    
                    // Pop Out / Merge Back / Close Buttons
                    if !isPopped {
                        Button(action: {
                            blood.update("layout.poppedAreas.\(areaId)", componentType)
                            openWindow(id: "native-window", value: areaId)
                            blood.update("layout.removeArea.\(areaId)", true)
                        }) {
                            Image(systemName: "macwindow.badge.plus")
                                .font(.system(size: 11))
                        }
                        .buttonStyle(.plain)
                        .help("Pop out to native macOS window")
                        
                        Button(action: {
                            blood.update("layout.removeArea.\(areaId)", true)
                        }) {
                            Image(systemName: "xmark")
                                .font(.system(size: 11))
                        }
                        .buttonStyle(.plain)
                        .help("Close Panel")
                    } else {
                        Button(action: {
                            blood.update("layout.mergeBackArea.\(areaId)", true)
                            dismiss()
                        }) {
                            Image(systemName: "arrow.down.right.and.arrow.up.left")
                                .font(.system(size: 11))
                        }
                        .buttonStyle(.plain)
                        .help("Merge back into main workspace")
                    }
                }
                .padding(.horizontal, 6)
                .frame(height: 24)
                .background(Color(NSColor.windowBackgroundColor))
                .contentShape(Rectangle())
                // Conditionally loads native drag back features ONLY if popped.
                // If docked, uses the DragGesture instead to avoid system gesture hijacking.
                .condDrag(isPopped: isPopped, blood: blood, areaId: areaId, data: { areaId.uuidString as NSString }, typeIdentifier: "com.dnote.area")
                .gesture(
                    DragGesture(coordinateSpace: .global)
                        .onChanged { value in
                            if isPopped { return } // Popped panels use native onDrag, ignore gesture tracking
                            if isPopping { return }
                            let loc = value.location
                            
                            // Detect if cursor left the main window bounds
                            let mainSize = blood.getValue("system.mainWindowSize", default: [:] as [String: CGFloat])
                            if let w = mainSize["width"], let h = mainSize["height"] {
                                if loc.x < 0 || loc.x > w || loc.y < 0 || loc.y > h {
                                    // Lock popping state
                                    isPopping = true
                                    DispatchQueue.main.async {
                                        withAnimation(.easeInOut(duration: 0.25)) {
                                            blood.update("layout.poppedAreas.\(areaId)", componentType)
                                            openWindow(id: "native-window", value: areaId)
                                            blood.update("layout.removeArea.\(areaId)", true)
                                            
                                            // Reset dragging states
                                            blood.update("system.dragState", [:] as [String: Any])
                                        }
                                    }
                                    return
                                }
                            }
                            
                            // Update drag coordinates in global Blood state
                            blood.update("system.dragState", [
                                "draggedId": areaId.uuidString,
                                "location": ["x": loc.x, "y": loc.y]
                            ])
                        }
                        .onEnded { value in
                            if isPopped { return }
                            if isPopping || blood.getValue("layout.removeArea.\(areaId)", default: false) {
                                isPopping = false
                                blood.update("system.dragState", [:] as [String: Any])
                                return
                            }
                            isPopping = false
                            let loc = value.location
                            
                            // Find if released over another panel
                            let frames = blood.getValue("system.areaFrames", default: [:] as [String: [String: CGFloat]])
                            for (idStr, dict) in frames {
                                if let targetId = UUID(uuidString: idStr),
                                   targetId != areaId,
                                   let minX = dict["minX"], let maxX = dict["maxX"],
                                   let minY = dict["minY"], let maxY = dict["maxY"] {
                                    
                                    if loc.x >= minX && loc.x <= maxX && loc.y >= minY && loc.y <= maxY {
                                        let splitRes = AreaShell.calculateSplitRegion(location: loc, frame: dict)
                                        
                                        DispatchQueue.main.async {
                                            withAnimation(.easeInOut(duration: 0.25)) {
                                                blood.update("layout.dragMerge", [
                                                    "targetId": targetId.uuidString,
                                                    "draggedId": areaId.uuidString,
                                                    "direction": splitRes.direction.rawValue,
                                                    "insertFirst": splitRes.insertFirst
                                                ])
                                            }
                                        }
                                        break
                                    }
                                }
                            }
                            
                            // Clear drag state
                            blood.update("system.dragState", [:] as [String: Any])
                        }
                )
                
                Divider()
                
                // Content Viewport
                if let component = registry.getComponent(componentType) {
                    component.makeView(areaId: areaId, blood: blood)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Text("Select Component in Header Dropdown")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .border(isFocused ? Color.accentColor : Color.clear, width: 1.5)
            .contentShape(Rectangle())
            .onTapGesture {
                blood.update("system.focusedAreaId", areaId)
            }
            .background(
                GeometryReader { panelGeo in
                    Color.clear
                        .onAppear {
                            if isPopped { return }
                            let frame = panelGeo.frame(in: .global)
                            blood.update("system.areaFrames.\(areaId)", [
                                "minX": frame.minX, "maxX": frame.maxX,
                                "minY": frame.minY, "maxY": frame.maxY
                            ])
                        }
                        .onChange(of: panelGeo.frame(in: .global)) { newFrame in
                            if isPopped { return }
                            blood.update("system.areaFrames.\(areaId)", [
                                "minX": newFrame.minX, "maxX": newFrame.maxX,
                                "minY": newFrame.minY, "maxY": newFrame.maxY
                            ])
                        }
                }
            )
            .overlay(dragOverlay)
            .onDisappear {
                // Unregister panel boundary frame upon close
                blood.update("system.areaFrames.\(areaId)", (nil as [String: CGFloat]?) as Any)
            }
            // Listens for cross-window drops from popped native windows
            .onDrop(of: ["com.dnote.area"], delegate: AreaDropDelegate(areaId: areaId, blood: blood, geometry: geo))
        }
    }
    
    /// Calculate panel subdivisions based on mouse coordinate distance to the four borders (closest-edge split)
    public static func calculateSplitRegion(location: CGPoint, frame: [String: CGFloat]) -> (direction: SplitDirection, insertFirst: Bool) {
        guard let minX = frame["minX"], let maxX = frame["maxX"],
              let minY = frame["minY"], let maxY = frame["maxY"] else {
            return (.horizontal, false)
        }
        
        let w = maxX - minX
        let h = maxY - minY
        let rx = location.x - minX
        let ry = location.y - minY
        
        // Clamp local coordinate to panel bounds
        let clampedX = max(0, min(w, rx))
        let clampedY = max(0, min(h, ry))
        
        let dLeft = clampedX
        let dRight = w - clampedX
        let dTop = clampedY
        let dBottom = h - clampedY
        
        let minDistance = min(dLeft, dRight, dTop, dBottom)
        
        if minDistance == dLeft {
            return (.horizontal, true)
        } else if minDistance == dRight {
            return (.horizontal, false)
        } else if minDistance == dTop {
            return (.vertical, true)
        } else {
            return (.vertical, false)
        }
    }
}

/// Dynamic toolbar that checks if other components injected buttons for this panel type
struct AreaInjectedToolbar: View {
    let areaId: UUID
    let componentType: String
    let blood: Blood
    @ObservedObject var bloodObserved: Blood
    
    init(areaId: UUID, componentType: String, blood: Blood) {
        self.areaId = areaId
        self.componentType = componentType
        self.blood = blood
        self._bloodObserved = ObservedObject(wrappedValue: blood)
    }
    
    private var injectedActions: [String] {
        bloodObserved.getValue("injections.\(componentType).toolbar", default: [] as [String])
    }
    
    var body: some View {
        HStack(spacing: 8) {
            ForEach(injectedActions, id: \.self) { actionId in
                Button(action: {
                    triggerAction(actionId)
                }) {
                    Image(systemName: getIcon(actionId))
                        .font(.system(size: 11))
                }
                .buttonStyle(.plain)
                .help(getLabel(actionId))
            }
        }
    }
    
    private func triggerAction(_ actionId: String) {
        let context = ActionContext(
            blood: blood,
            focusedAreaId: blood.getValue("system.focusedAreaId", default: nil as UUID?),
            sourceAreaId: areaId
        )
        if let action = ActionRegistry.shared.getAction(actionId) {
            action.run(context)
        }
    }
    
    private func getIcon(_ actionId: String) -> String {
        return ActionRegistry.shared.getAction(actionId)?.iconName ?? "play"
    }
    
    private func getLabel(_ actionId: String) -> String {
        return ActionRegistry.shared.getAction(actionId)?.label ?? actionId
    }
}

/// Registry specifically storing independent action buttons
public class ActionRegistry: ObservableObject {
    public static let shared = ActionRegistry()
    private var actions: [String: ActionButton] = [:]
    
    public func register(_ action: ActionButton) {
        actions[action.id] = action
    }
    
    public func getAction(_ id: String) -> ActionButton? {
        return actions[id]
    }
}

/// **AreaDropDelegate**: Dynamic drop handler for Blender-like grid merges.
/// It splits the target panel by checking where the dragged header is hovered relative to the panel.
struct AreaDropDelegate: DropDelegate {
    let areaId: UUID
    let blood: Blood
    let geometry: GeometryProxy
    
    func dropEntered(info: DropInfo) {
        updateDragState(info: info)
    }
    
    func dropUpdated(info: DropInfo) -> DropProposal? {
        updateDragState(info: info)
        return DropProposal(operation: .move)
    }
    
    func dropExited(info: DropInfo) {
        blood.update("system.dragState", [:] as [String: Any])
    }
    
    private func updateDragState(info: DropInfo) {
        let frames = blood.getValue("system.areaFrames", default: [:] as [String: [String: CGFloat]])
        guard let myFrame = frames[areaId.uuidString] else { return }
        guard let minX = myFrame["minX"], let minY = myFrame["minY"] else { return }
        
        let localLoc = info.location
        let globalX = minX + localLoc.x
        let globalY = minY + localLoc.y
        
        var draggedIdStr = blood.getValue("system.dragState.draggedId", default: "" as String)
        if draggedIdStr.isEmpty {
            draggedIdStr = blood.getValue("system.activeDraggedId", default: "" as String)
        }
        
        if !draggedIdStr.isEmpty {
            blood.update("system.dragState", [
                "draggedId": draggedIdStr,
                "location": ["x": globalX, "y": globalY]
            ])
        }
    }
    
    func performDrop(info: DropInfo) -> Bool {
        DispatchQueue.main.async {
            blood.update("system.dragState", [:] as [String: Any])
            blood.update("system.activeDraggedId", "")
        }
        
        guard let provider = info.itemProviders(for: ["com.dnote.area"]).first else { return false }
        provider.loadItem(forTypeIdentifier: "com.dnote.area", options: nil) { item, error in
            var uuidStr: String? = nil
            if let data = item as? Data {
                uuidStr = String(data: data, encoding: .utf8)
            } else if let str = item as? String {
                uuidStr = str
            } else if let nsStr = item as? NSString {
                uuidStr = nsStr as String
            }
            
            guard let resolvedUuidStr = uuidStr,
                  let draggedId = UUID(uuidString: resolvedUuidStr) else { return }
            
            // Cannot drop on itself
            guard draggedId != areaId else { return }
            
            let frames = blood.getValue("system.areaFrames", default: [:] as [String: [String: CGFloat]])
            guard let targetFrame = frames[areaId.uuidString] else { return }
            guard let minX = targetFrame["minX"], let minY = targetFrame["minY"] else { return }
            
            let localLoc = info.location
            let globalLoc = CGPoint(x: minX + localLoc.x, y: minY + localLoc.y)
            
            let splitRes = AreaShell.calculateSplitRegion(location: globalLoc, frame: targetFrame)
            
            DispatchQueue.main.async {
                withAnimation(.easeInOut(duration: 0.25)) {
                    // Mutate the layout engine
                    blood.update("layout.dragMerge", [
                        "targetId": areaId.uuidString,
                        "draggedId": draggedId.uuidString,
                        "direction": splitRes.direction.rawValue,
                        "insertFirst": splitRes.insertFirst
                    ])
                }
            }
        }
        return true
    }
}

// SwiftUI View Extension to conditionally load onDrag only if the panel is popped
extension View {
    @ViewBuilder
    func condDrag(isPopped: Bool, blood: Blood, areaId: UUID, data: @escaping () -> NSString, typeIdentifier: String) -> some View {
        if isPopped {
            self.onDrag {
                blood.update("system.activeDraggedId", areaId.uuidString)
                blood.update("system.dragState", [
                    "draggedId": areaId.uuidString,
                    "location": [:] as [String: Any]
                ])
                return NSItemProvider(item: data(), typeIdentifier: typeIdentifier)
            }
        } else {
            self
        }
    }
}
