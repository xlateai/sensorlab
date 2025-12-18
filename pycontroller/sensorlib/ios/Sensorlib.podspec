require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'Sensorlib'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/verbiiyo/sensorlib' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  
  # Rust library - vendored_libraries automatically links it
  # Path is relative to the podspec location (sensorlib/ios/)
  s.vendored_libraries = "libs/librustcore.a"
  s.preserve_paths = "libs/librustcore.a"
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  
  # Swift/Objective-C compatibility and linker configuration
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # Ensure the library is linked - vendored_libraries should handle this, but be explicit
    'OTHER_LDFLAGS' => '$(inherited)',
  }
  
  # Ensure the library is preserved and available
  s.user_target_xcconfig = {
    'OTHER_LDFLAGS' => '$(inherited)',
  }
end
