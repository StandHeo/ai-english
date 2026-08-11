require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'PiperTts'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/StandHeo/ai-english'
  s.author = 'ai-english'
  s.source = { :git => 'https://github.com/StandHeo/ai-english.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,mm,c,cc,cpp}'
  s.public_header_files = 'ios/Sources/**/*.h'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
  s.libraries = 'c++'
  s.frameworks = 'AVFoundation', 'AudioToolbox'
  s.vendored_frameworks = [
    'ios/Frameworks/sherpa-onnx.xcframework',
    'ios/Frameworks/onnxruntime.xcframework'
  ]
  s.resources = ['ios/Resources/piper-tts']
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'OTHER_LDFLAGS' => '$(inherited) -lc++',
    'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/ios/Frameworks/sherpa-onnx.xcframework/ios-arm64/Headers"',
  }
  s.user_target_xcconfig = {
    'OTHER_LDFLAGS' => '$(inherited) -lc++',
  }
end
