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
        .target(
            name: "PiperTtsPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "sherpa_onnx",
                "onnxruntime",
            ],
            path: "ios/Sources/PiperTtsPlugin",
            resources: [
                .copy("../../Resources/piper-tts")
            ],
            linkerSettings: [
                .linkedLibrary("c++"),
                .linkedFramework("AVFoundation"),
            ]
        ),
    ]
)
