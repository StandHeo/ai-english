require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'DiaryWhisper'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/StandHeo/ai-english'
  s.author = 'ai-english'
  s.source = { :git => 'https://github.com/StandHeo/ai-english.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,mm,c,cc,cpp}'
  # whisper.xcframework MinimumOSVersion is 16.4
  s.ios.deployment_target = '16.4'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
  s.libraries = 'c++'
  s.frameworks = 'Accelerate', 'Metal', 'MetalKit', 'Foundation'
  s.vendored_frameworks = ['ios/Frameworks/whisper.xcframework']
  s.resources = ['ios/Resources/diary-whisper']
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'OTHER_LDFLAGS' => '$(inherited) -lc++',
  }
  s.user_target_xcconfig = {
    'OTHER_LDFLAGS' => '$(inherited) -lc++',
  }
end
