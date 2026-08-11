#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Thin Objective-C++ wrapper around Sherpa-ONNX Offline TTS (VITS / Piper).
@interface PiperSherpaBridge : NSObject

@property (nonatomic, readonly) int sampleRate;
@property (nonatomic, readonly, getter=isReady) BOOL ready;

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                tokensPath:(NSString *)tokensPath
                                   dataDir:(NSString *)dataDir;

/// Synthesize speech. Returns PCM float32 samples (little-endian) or nil on failure.
- (nullable NSData *)synthesizeText:(NSString *)text
                              speed:(float)speed
                         sampleRate:(int *_Nullable)outSampleRate;

@end

NS_ASSUME_NONNULL_END
