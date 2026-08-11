// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PiperTts",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "PiperTts",
            targets: ["PiperTtsPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .binaryTarget(
            name: "sherpa_onnx",
            path: "ios/Frameworks/sherpa-onnx.xcframework"
        ),
        .binaryTarget(
            name: "onnxruntime",
            path: "ios/Frameworks/onnxruntime.xcframework"
        ),
        // SPM 不允许同一 target 混编 Swift + ObjC；桥接单独放 Clang target。
        .target(
            name: "PiperSherpaBridge",
            dependencies: [
                "sherpa_onnx",
                "onnxruntime",
            ],
            path: "ios/Sources/PiperSherpaBridge",
            publicHeadersPath: "include",
            cSettings: [
                // Headers are identical across device/simulator slices.
                .headerSearchPath("../../Frameworks/sherpa-onnx.xcframework/ios-arm64/Headers"),
            ],
            linkerSettings: [
                .linkedLibrary("c++"),
            ]
        ),
        .target(
            name: "PiperTtsPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "PiperSherpaBridge",
                "sherpa_onnx",
                "onnxruntime",
            ],
            // path 设为 ios/，资源必须在 target 路径内，否则会 SWIFT_MODULE_RESOURCE_BUNDLE_UNAVAILABLE
            path: "ios",
            exclude: [
                "Frameworks",
                "Sources/PiperSherpaBridge",
                "Resources/piper-tts/README.md",
            ],
            sources: ["Sources/PiperTtsPlugin"],
            resources: [
                .copy("Resources/piper-tts")
            ],
            linkerSettings: [
                .linkedLibrary("c++"),
                .linkedFramework("AVFoundation"),
            ]
        ),
    ]
)
