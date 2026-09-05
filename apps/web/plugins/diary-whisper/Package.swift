// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DiaryWhisper",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "DiaryWhisper",
            targets: ["DiaryWhisperPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .binaryTarget(
            name: "whisper",
            path: "ios/Frameworks/whisper.xcframework"
        ),
        .target(
            name: "DiaryWhisperPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "whisper",
            ],
            // path 设为 ios/，资源必须在 target 路径内，否则会 SWIFT_MODULE_RESOURCE_BUNDLE_UNAVAILABLE
            path: "ios",
            exclude: [
                "Frameworks",
                "Resources/diary-whisper/README.md",
            ],
            sources: ["Sources/DiaryWhisperPlugin"],
            resources: [
                .copy("Resources/diary-whisper")
            ],
            linkerSettings: [
                .linkedLibrary("c++"),
                .linkedFramework("Accelerate"),
                .linkedFramework("Metal"),
            ]
        ),
    ]
)
