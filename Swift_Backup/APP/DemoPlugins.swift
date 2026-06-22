import SwiftUI

/// **EditorComponent**: A mock code editor panel view.
public struct EditorComponent: AreaComponent {
    public let typeId = "editor"
    public let displayName = "Code Editor"
    public let iconName = "doc.text.fill"
    
    public init() {}
    
    public func makeView(areaId: UUID, blood: Blood) -> AnyView {
        AnyView(EditorView(areaId: areaId, blood: blood))
    }
}

struct EditorView: View {
    let areaId: UUID
    @ObservedObject var blood: Blood
    
    @State private var text: String = "// Write Swift code here...\nclass App: ObservableObject {}"
    
    init(areaId: UUID, blood: Blood) {
        self.areaId = areaId
        self._blood = ObservedObject(wrappedValue: blood)
    }
    
    private var saveMessage: String {
        if let saveTime = blood.getValue("events.saveFinished.\(areaId.uuidString)", default: nil as Date?) {
            return "Saved at \(saveTime.formatted(date: .omitted, time: .standard))"
        }
        return "Unsaved changes"
    }
    
    var body: some View {
        VStack(spacing: 0) {
            TextEditor(text: $text)
                .font(.system(.body, design: .monospaced))
                .padding(4)
            
            Divider()
            
            HStack {
                Text(saveMessage)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
                Spacer()
                Text("Lines: 2  UTF-8")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 8)
            .frame(height: 20)
            .background(Color(NSColor.windowBackgroundColor))
        }
    }
}

/// **TerminalComponent**: A mock terminal logs panel view.
public struct TerminalComponent: AreaComponent {
    public let typeId = "terminal"
    public let displayName = "Terminal Console"
    public let iconName = "terminal.fill"
    
    public init() {}
    
    public func makeView(areaId: UUID, blood: Blood) -> AnyView {
        AnyView(TerminalView(areaId: areaId, blood: blood))
    }
}

struct TerminalView: View {
    let areaId: UUID
    @ObservedObject var blood: Blood
    
    init(areaId: UUID, blood: Blood) {
        self.areaId = areaId
        self._blood = ObservedObject(wrappedValue: blood)
    }
    
    private var consoleLogs: String {
        blood.getValue("terminal.\(areaId.uuidString).logs", default: "dnote-macOS ~ % npm run dev\n[info] Server listening on port 3000\n[ready] Sandbox compiler active.")
    }
    
    var body: some View {
        ScrollView {
            Text(consoleLogs.isEmpty ? "Console cleared..." : consoleLogs)
                .font(.system(.footnote, design: .monospaced))
                .foregroundColor(.green)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
        }
        .background(Color.black)
    }
}

/// **FileListComponent**: A mock file explorer panel view.
public struct FileListComponent: AreaComponent {
    public let typeId = "fileTree"
    public let displayName = "File Explorer"
    public let iconName = "folder.fill"
    
    public init() {}
    
    public func makeView(areaId: UUID, blood: Blood) -> AnyView {
        AnyView(FileListView(areaId: areaId, blood: blood))
    }
}

struct FileListView: View {
    let areaId: UUID
    @ObservedObject var blood: Blood
    
    init(areaId: UUID, blood: Blood) {
        self.areaId = areaId
        self._blood = ObservedObject(wrappedValue: blood)
    }
    
    var body: some View {
        List {
            Section(header: Text("DNOTE PROJECT").font(.system(size: 10, weight: .bold))) {
                Label("CORE/", systemImage: "folder.fill")
                Label("Blood.swift", systemImage: "doc.text")
                    .padding(.leading, 12)
                Label("AreaLayout.swift", systemImage: "doc.text")
                    .padding(.leading, 12)
                Label("APP/", systemImage: "folder.fill")
                Label("demo——plugging/", systemImage: "folder.fill")
                    .padding(.leading, 12)
                Label("DemoPlugins.swift", systemImage: "doc.text")
                    .padding(.leading, 24)
            }
        }
        .listStyle(.sidebar)
    }
}

private var didBootstrap = false

/// **Bootstrap**: Initialize DNOTE registry configurations and setup button injections
public func bootstrapDnote() {
    guard !didBootstrap else { return }
    didBootstrap = true
    
    // 1. Register Blender panel view types
    ComponentRegistry.shared.register(EditorComponent())
    ComponentRegistry.shared.register(TerminalComponent())
    ComponentRegistry.shared.register(FileListComponent())
    
    // 2. Register independent action buttons
    ActionRegistry.shared.register(ActionButton(
        id: "editor.save",
        label: "Save File",
        iconName: "square.and.arrow.down"
    ) { context in
        let targetId = context.targetAreaId
        print("Save action executed for Area: \(String(describing: targetId))")
        // Broadcast save completion time
        context.blood.update("events.saveFinished.\(targetId?.uuidString ?? "global")", Date())
    })
    
    ActionRegistry.shared.register(ActionButton(
        id: "terminal.clear",
        label: "Clear Console",
        iconName: "trash"
    ) { context in
        let targetId = context.targetAreaId
        print("Clear Terminal logs for Area: \(String(describing: targetId))")
        context.blood.update("terminal.\(targetId?.uuidString ?? "global").logs", "")
    })
    
    // 3. Dynamic Button Injection (Injecting independent buttons into slots)
    // Inject "Save File" button into Editor component toolbar slot
    Blood.shared.update("injections.editor.toolbar", ["editor.save"])
    // Inject "Clear Console" button into Terminal component toolbar slot
    Blood.shared.update("injections.terminal.toolbar", ["terminal.clear"])
}
