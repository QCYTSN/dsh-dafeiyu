// swift-tools-version: 5.9
import PackageDescription

/// Repeatable tests for the pure Swift core of the native macOS Helper.
/// The UI layer (PetController/PetView/main) stays out of this package so the
/// state machine and persistence logic can be tested without AppKit.
let package = Package(
    name: "dsh-dafeiyu-core",
    products: [
        .library(name: "BigFishCore", targets: ["BigFishCore"]),
    ],
    targets: [
        .target(
            name: "BigFishCore",
            path: "native/macos/Sources",
            exclude: [
                "Permissions.swift",
                "PetController.swift",
                "PetView.swift",
                "main.swift",
            ],
            sources: ["AnimationModel.swift", "LayoutStore.swift"]
        ),
        .testTarget(
            name: "BigFishCoreTests",
            dependencies: ["BigFishCore"],
            path: "native/macos/Tests"
        ),
    ]
)
