#import "PiperSherpaBridge.h"

#include "sherpa-onnx/c-api/c-api.h"

#include <string.h>

@implementation PiperSherpaBridge {
  const SherpaOnnxOfflineTts *_tts;
  NSString *_modelPath;
  NSString *_tokensPath;
  NSString *_dataDir;
}

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                tokensPath:(NSString *)tokensPath
                                   dataDir:(NSString *)dataDir {
  self = [super init];
  if (!self) return nil;

  _modelPath = [modelPath copy];
  _tokensPath = [tokensPath copy];
  _dataDir = [dataDir copy];
  _tts = nullptr;

  SherpaOnnxOfflineTtsConfig config;
  memset(&config, 0, sizeof(config));

  config.model.vits.model = _modelPath.UTF8String;
  config.model.vits.lexicon = "";
  config.model.vits.tokens = _tokensPath.UTF8String;
  config.model.vits.data_dir = _dataDir.UTF8String;
  config.model.vits.noise_scale = 0.667f;
  config.model.vits.noise_scale_w = 0.8f;
  config.model.vits.length_scale = 1.0f;
  config.model.num_threads = 2;
  config.model.debug = 0;
  config.model.provider = "cpu";
  config.max_num_sentences = 2;
  config.silence_scale = 0.2f;

  _tts = SherpaOnnxCreateOfflineTts(&config);
  if (!_tts) {
    return nil;
  }
  return self;
}

- (void)dealloc {
  if (_tts) {
    SherpaOnnxDestroyOfflineTts(_tts);
    _tts = nullptr;
  }
}

- (BOOL)isReady {
  return _tts != nullptr;
}

- (int)sampleRate {
  if (!_tts) return 0;
  return SherpaOnnxOfflineTtsSampleRate(_tts);
}

- (nullable NSData *)synthesizeText:(NSString *)text
                              speed:(float)speed
                         sampleRate:(int *_Nullable)outSampleRate {
  if (!_tts || text.length == 0) return nil;

  float safeSpeed = speed;
  if (safeSpeed < 0.55f) safeSpeed = 0.55f;
  if (safeSpeed > 1.45f) safeSpeed = 1.45f;

  const SherpaOnnxGeneratedAudio *audio =
      SherpaOnnxOfflineTtsGenerate(_tts, text.UTF8String, 0, safeSpeed);
  if (!audio || !audio->samples || audio->n <= 0) {
    if (audio) {
      SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);
    }
    return nil;
  }

  NSUInteger byteCount = (NSUInteger)audio->n * sizeof(float);
  NSData *data = [NSData dataWithBytes:audio->samples length:byteCount];
  if (outSampleRate) {
    *outSampleRate = audio->sample_rate;
  }
  SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);
  return data;
}

@end
