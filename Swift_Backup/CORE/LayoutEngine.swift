import SwiftUI

/// **LayoutEngineView**: Recursively compiles and renders the `AreaLayout` layout tree.
/// It uses macOS `HSplitView` and `VSplitView` to support native resizable dividers out of the box.
public struct LayoutEngineView: View {
    @ObservedObject var blood: Blood
    @State private var layout: AreaLayout
    
    public init(blood: Blood, initialLayout: AreaLayout) {
        self._blood = ObservedObject(wrappedValue: blood)
        self._layout = State(initialValue: initialLayout)
    }
    
    public var body: some View {
        renderNode(layout)
            .onReceive(blood.channelPublisher) { changedChannels in
                // Listen for area layout events
                for channel in changedChannels {
                    if channel.hasPrefix("layout.changeAreaType.") {
                        let areaIdStr = channel.replacingOccurrences(of: "layout.changeAreaType.", with: "")
                        if let areaId = UUID(uuidString: areaIdStr) {
                            let newType = blood.getValue(channel, default: "")
                            if !newType.isEmpty {
                                print("[DEBUG] changeAreaType: \(areaId) -> \(newType)")
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    let currentSynced = syncRatios(in: layout)
                                    layout = updateComponentType(in: currentSynced, targetId: areaId, to: newType)
                                }
                                printDebugInfo("After changeAreaType")
                            }
                        }
                    } else if channel.hasPrefix("layout.removeArea.") {
                        let areaIdStr = channel.replacingOccurrences(of: "layout.removeArea.", with: "")
                        if UUID(uuidString: areaIdStr) != nil {
                            print("[DEBUG] removeArea: \(areaIdStr)")
                            withAnimation(.easeInOut(duration: 0.25)) {
                                layout = syncRatios(in: layout)
                            }
                            printDebugInfo("After removeArea")
                        }
                    } else if channel.hasPrefix("layout.splitArea.") {
                        let areaIdStr = channel.replacingOccurrences(of: "layout.splitArea.", with: "")
                        if let areaId = UUID(uuidString: areaIdStr) {
                            let directionStr = blood.getValue(channel, default: "")
                            if !directionStr.isEmpty {
                                print("[DEBUG] splitArea: \(areaId) -> \(directionStr)")
                                let dir = (directionStr == "horizontal") ? SplitDirection.horizontal : SplitDirection.vertical
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    let currentSynced = syncRatios(in: layout)
                                    layout = splitNode(in: currentSynced, targetId: areaId, direction: dir)
                                }
                                // Clear the split trigger
                                blood.update(channel, "")
                                printDebugInfo("After splitArea")
                            }
                        }
                    } else if channel.hasPrefix("layout.mergeBackArea.") {
                        let areaIdStr = channel.replacingOccurrences(of: "layout.mergeBackArea.", with: "")
                        if let areaId = UUID(uuidString: areaIdStr) {
                            if blood.getValue(channel, default: false) {
                                print("[DEBUG] mergeBackArea: \(areaId)")
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    let currentSynced = syncRatios(in: layout)
                                    layout = currentSynced
                                    blood.update("layout.removeArea.\(areaId)", false)
                                    blood.update(channel, false)
                                }
                                printDebugInfo("After mergeBackArea")
                            }
                        }
                    } else if channel == "layout.dragMerge" {
                        let config = blood.getValue(channel, default: [:] as [String: Any])
                        if let targetIdStr = config["targetId"] as? String,
                           let targetId = UUID(uuidString: targetIdStr),
                           let draggedIdStr = config["draggedId"] as? String,
                           let draggedId = UUID(uuidString: draggedIdStr),
                           let directionStr = config["direction"] as? String,
                           let direction = SplitDirection(rawValue: directionStr),
                           let insertFirst = config["insertFirst"] as? Bool {
                            
                            print("[DEBUG] dragMerge: dragged \(draggedId) onto \(targetId) (dir: \(direction), insertFirst: \(insertFirst))")
                            let type = blood.getValue("layout.poppedAreas.\(draggedId)", default: "editor")
                            let draggedNode = AreaLayout.area(id: draggedId, componentType: type)
                            
                            withAnimation(.easeInOut(duration: 0.25)) {
                                let currentSynced = syncRatios(in: layout)
                                let excised = exciseNode(in: currentSynced, targetId: draggedId) ?? currentSynced
                                layout = dragMergeNode(in: excised, targetId: targetId, draggedNode: draggedNode, direction: direction, insertFirst: insertFirst)
                                blood.update("layout.removeArea.\(draggedId)", false)
                            }
                            // Reset trigger
                            blood.update(channel, [:] as [String: Any])
                            printDebugInfo("After dragMerge")
                        }
                    }
                }
            }
    }
    
    private func printDebugInfo(_ label: String) {
        print("--- [Layout DEBUG: \(label)] ---")
        print("Layout Tree: \(layout)")
        let frames = blood.getValue("system.areaFrames", default: [:] as [String: [String: CGFloat]])
        print("Registered Frames: \(frames)")
        print("-------------------------------")
    }
    
    /// Calculate current screen frames to synchronize split node ratios based on real dimensions
    private func getBoundingBox(for node: AreaLayout) -> CGRect? {
        switch node {
        case .area(let id, _):
            if blood.getValue("layout.removeArea.\(id)", default: false) {
                return nil
            }
            let myFrame = blood.getValue("system.areaFrames.\(id)", default: [:] as [String: Any])
            
            let minX: CGFloat
            let maxX: CGFloat
            let minY: CGFloat
            let maxY: CGFloat
            
            if let mx = myFrame["minX"] as? CGFloat { minX = mx }
            else if let mx = myFrame["minX"] as? Double { minX = CGFloat(mx) }
            else if let mx = myFrame["minX"] as? Int { minX = CGFloat(mx) }
            else { return nil }
            
            if let mx = myFrame["maxX"] as? CGFloat { maxX = mx }
            else if let mx = myFrame["maxX"] as? Double { maxX = CGFloat(mx) }
            else if let mx = myFrame["maxX"] as? Int { maxX = CGFloat(mx) }
            else { return nil }
            
            if let my = myFrame["minY"] as? CGFloat { minY = my }
            else if let my = myFrame["minY"] as? Double { minY = CGFloat(my) }
            else if let my = myFrame["minY"] as? Int { minY = CGFloat(my) }
            else { return nil }
            
            if let my = myFrame["maxY"] as? CGFloat { maxY = my }
            else if let my = myFrame["maxY"] as? Double { maxY = CGFloat(my) }
            else if let my = myFrame["maxY"] as? Int { maxY = CGFloat(my) }
            else { return nil }
            
            return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
            
        case .split(_, _, let first, let second):
            let boxFirst = getBoundingBox(for: first)
            let boxSecond = getBoundingBox(for: second)
            
            if let b1 = boxFirst, let b2 = boxSecond {
                return b1.union(b2)
            }
            return boxFirst ?? boxSecond
        }
    }
    
    private func syncRatios(in node: AreaLayout) -> AreaLayout {
        switch node {
        case .area:
            return node
        case .split(let direction, let ratio, let first, let second):
            let syncedFirst = syncRatios(in: first)
            let syncedSecond = syncRatios(in: second)
            
            let boxFirst = getBoundingBox(for: first)
            let boxSecond = getBoundingBox(for: second)
            
            var newRatio = ratio
            if let b1 = boxFirst, let b2 = boxSecond {
                if direction == .horizontal {
                    let w1 = b1.width
                    let w2 = b2.width
                    let total = w1 + w2
                    if total > 0 {
                        newRatio = w1 / total
                    }
                } else {
                    let h1 = b1.height
                    let h2 = b2.height
                    let total = h1 + h2
                    if total > 0 {
                        newRatio = h1 / total
                    }
                }
            }
            return .split(direction: direction, ratio: newRatio, first: syncedFirst, second: syncedSecond)
        }
    }
    
    /// Check if all leaves under this layout node are currently popped out / collapsed
    private func isNodeCollapsed(_ node: AreaLayout) -> Bool {
        switch node {
        case .area(let id, _):
            return blood.getValue("layout.removeArea.\(id)", default: false)
        case .split(_, _, let first, let second):
            return isNodeCollapsed(first) && isNodeCollapsed(second)
        }
    }

    private func renderNode(_ node: AreaLayout) -> AnyView {
        // If the whole subtree is collapsed, render nothing
        if isNodeCollapsed(node) {
            return AnyView(EmptyView().frame(width: 0, height: 0))
        }
        
        switch node {
        case .area(let id, let componentType):
            return AnyView(
                AreaShell(areaId: id, componentType: componentType, blood: blood)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            )
                
        case .split(let direction, let ratio, let first, let second):
            let firstCollapsed = isNodeCollapsed(first)
            let secondCollapsed = isNodeCollapsed(second)
            
            // If one of the children is collapsed, the other takes up 100% of the space natively!
            if firstCollapsed && !secondCollapsed {
                return renderNode(second)
            } else if secondCollapsed && !firstCollapsed {
                return renderNode(first)
            } else if !firstCollapsed && !secondCollapsed {
                if direction == .horizontal {
                    return AnyView(
                        HSplitView {
                            renderNode(first)
                                .frame(minWidth: 100, idealWidth: ratio * 1000, maxWidth: .infinity, maxHeight: .infinity)
                                .layoutPriority(1)
                            renderNode(second)
                                .frame(minWidth: 100, idealWidth: (1.0 - ratio) * 1000, maxWidth: .infinity, maxHeight: .infinity)
                                .layoutPriority(1)
                        }
                        .id(node)
                    )
                } else {
                    return AnyView(
                        VSplitView {
                            renderNode(first)
                                .frame(maxWidth: .infinity, minHeight: 80, idealHeight: ratio * 1000, maxHeight: .infinity)
                                .layoutPriority(1)
                            renderNode(second)
                                .frame(maxWidth: .infinity, minHeight: 80, idealHeight: (1.0 - ratio) * 1000, maxHeight: .infinity)
                                .layoutPriority(1)
                        }
                        .id(node)
                    )
                }
            } else {
                return AnyView(EmptyView().frame(width: 0, height: 0))
            }
        }
    }
    
    /// Recursive function to update the componentType of a leaf node when changed by dropdown selector
    private func updateComponentType(in node: AreaLayout, targetId: UUID, to newType: String) -> AreaLayout {
        switch node {
        case .area(let id, let currentType):
            if id == targetId {
                return .area(id: id, componentType: newType)
            }
            return .area(id: id, componentType: currentType)
            
        case .split(let direction, let ratio, let first, let second):
            return .split(
                direction: direction,
                ratio: ratio,
                first: updateComponentType(in: first, targetId: targetId, to: newType),
                second: updateComponentType(in: second, targetId: targetId, to: newType)
            )
        }
    }
    
    /// Recursive function to excise a popped area from layout tree, collapsing its parent split
    private func exciseNode(in node: AreaLayout, targetId: UUID) -> AreaLayout? {
        switch node {
        case .area(let id, _):
            if id == targetId {
                return nil
            }
            return node
            
        case .split(let direction, let ratio, let first, let second):
            let newFirst = exciseNode(in: first, targetId: targetId)
            let newSecond = exciseNode(in: second, targetId: targetId)
            
            if newFirst == nil {
                return newSecond
            }
            if newSecond == nil {
                return newFirst
            }
            
            return .split(direction: direction, ratio: ratio, first: newFirst!, second: newSecond!)
        }
    }
    
    /// Recursive function to split an area into two
    private func splitNode(in node: AreaLayout, targetId: UUID, direction: SplitDirection) -> AreaLayout {
        switch node {
        case .area(let id, let componentType):
            if id == targetId {
                return .split(
                    direction: direction,
                    ratio: 0.5,
                    first: .area(id: id, componentType: componentType),
                    second: .area(id: UUID(), componentType: componentType)
                )
            }
            return node
            
        case .split(let dir, let ratio, let first, let second):
            return .split(
                direction: dir,
                ratio: ratio,
                first: splitNode(in: first, targetId: targetId, direction: direction),
                second: splitNode(in: second, targetId: targetId, direction: direction)
            )
        }
    }
    
    /// Recursive function to insert a dragged layout node next to targetId as a split
    private func dragMergeNode(in node: AreaLayout, targetId: UUID, draggedNode: AreaLayout, direction: SplitDirection, insertFirst: Bool) -> AreaLayout {
        switch node {
        case .area(let id, _):
            if id == targetId {
                if insertFirst {
                    return .split(direction: direction, ratio: 0.5, first: draggedNode, second: node)
                } else {
                    return .split(direction: direction, ratio: 0.5, first: node, second: draggedNode)
                }
            }
            return node
            
        case .split(let dir, let ratio, let first, let second):
            return .split(
                direction: dir,
                ratio: ratio,
                first: dragMergeNode(in: first, targetId: targetId, draggedNode: draggedNode, direction: direction, insertFirst: insertFirst),
                second: dragMergeNode(in: second, targetId: targetId, draggedNode: draggedNode, direction: direction, insertFirst: insertFirst)
            )
        }
    }
}
