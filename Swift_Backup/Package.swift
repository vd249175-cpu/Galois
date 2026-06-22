// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DNOTE",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "DNOTE", targets: ["DNOTE"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "DNOTE",
            dependencies: [],
            path: ".",
            exclude: [
                "Agents.md",
                "dnote_shortcuts.json"
            ],
            sources: [
                "CORE",
                "APP"
            ]
        )
    ]
)
