import SwiftUI

@main
struct DNOTEApp: App {
    @StateObject private var blood = Blood.shared
    
    var body: some Scene {
        WindowGroup("DNOTE Workspace", id: "main") {
            MainCanvasView()
                .environmentObject(blood)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unifiedCompact)
        
        // Secondary window group specifically for native popped-out components
        WindowGroup("Workspace Pane", id: "native-window", for: UUID.self) { $areaId in
            if let areaId = areaId {
                PoppedWindowShell(areaId: areaId, blood: blood)
                    .environmentObject(blood)
            }
        }
        .windowStyle(.titleBar)
    }
}
