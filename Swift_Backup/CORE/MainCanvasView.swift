import SwiftUI

/// **MainCanvasView**: The default IDE window viewport.
/// Renders the layout grid containing a File Tree on the left, and an Editor/Terminal split on the right.
public struct MainCanvasView: View {
    @StateObject private var blood = Blood.shared
    @StateObject private var shortcuts = ShortcutsConfig.shared
    
    private let initialLayout: AreaLayout
    
    public init() {
        // Define initial layout tree
        self.initialLayout = .split(
            direction: .horizontal,
            ratio: 0.25,
            first: .area(id: UUID(), componentType: "fileTree"),
            second: .split(
                direction: .vertical,
                ratio: 0.6,
                first: .area(id: UUID(), componentType: "editor"),
                second: .area(id: UUID(), componentType: "terminal")
            )
        )
        
        // Run bootstrap to register components and inject buttons
        bootstrapDnote()
        
        // Run delayed trigger simulation to capture real frames and sync ratios
        triggerDelayedSimulation()
    }
    
    private func findId(in node: AreaLayout, type: String) -> UUID? {
        switch node {
        case .area(let id, let componentType):
            return componentType == type ? id : nil
        case .split(_, _, let first, let second):
            return findId(in: first, type: type) ?? findId(in: second, type: type)
        }
    }
    
    private func triggerDelayedSimulation() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) {
            print("[DELAYED SIM] Triggering popout of editor...")
            let blood = Blood.shared
            
            // Print registered frames before popout
            let frames = blood.getValue("system.areaFrames", default: [:] as [String: [String: CGFloat]])
            print("[DELAYED SIM] Registered Frames before popout: \(frames)")
            
            guard let editorId = findId(in: initialLayout, type: "editor") else {
                print("[DELAYED SIM] Editor ID not found!")
                return
            }
            
            // Trigger popout
            blood.update("layout.poppedAreas.\(editorId)", "editor")
            blood.update("layout.removeArea.\(editorId)", true)
            print("[DELAYED SIM] Popout triggered for \(editorId)")
        }
    }
    
    public var body: some View {
        GeometryReader { geo in
            LayoutEngineView(blood: blood, initialLayout: initialLayout)
                .onChange(of: geo.size) { newSize in
                    blood.update("system.mainWindowSize", [
                        "width": newSize.width,
                        "height": newSize.height
                    ])
                }
                .onAppear {
                    blood.update("system.mainWindowSize", [
                        "width": geo.size.width,
                        "height": geo.size.height
                    ])
                }
        }
        .environmentObject(blood)
        .environmentObject(shortcuts)
        .frame(minWidth: 800, minHeight: 600)
    }
}
