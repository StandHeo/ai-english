import Foundation
import Capacitor
import whisper

/**
 * On-device Whisper ASR for family diary (iOS).
 * Capacitor name: DiaryWhisper — mirrors the Android plugin surface.
 */
@objc(DiaryWhisperPlugin)
public class DiaryWhisperPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DiaryWhisperPlugin"
    public let jsName = "DiaryWhisper"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listModels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isReady", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transcribe", returnType: CAPPluginReturnPromise),
    ]

    private let defaultModelId = "tiny"
    private let resourceRoot = "diary-whisper"
    private let modelFiles: [String: [String]] = [
        "tiny": ["ggml-tiny-q5_1.bin", "ggml-tiny.bin", "ggml-tiny-int8.bin"],
        "base": ["ggml-base-q5_1.bin", "ggml-base.bin"],
        "small": ["ggml-small-q5_1.bin", "ggml-small.bin"],
    ]

    private let queue = DispatchQueue(label: "com.aienglish.diarywhisper", qos: .userInitiated)
    private var context: OpaquePointer?
    private var loadedModelId: String?

    deinit {
        if let context {
            whisper_free(context)
        }
    }

    @objc func listModels(_ call: CAPPluginCall) {
        var models: [[String: Any]] = []
        for (id, names) in modelFiles.sorted(by: { $0.key < $1.key }) {
            let file = findModelURL(id: id)
            let packaged = names.contains { bundleModelURL($0) != nil }
            let ready = file != nil
            models.append([
                "id": id,
                "label": modelLabel(id),
                "fileName": names.first ?? "",
                "ready": ready,
                "packaged": packaged || ready,
            ])
        }
        call.resolve([
            "models": models,
            "defaultId": defaultModelId,
        ])
    }

    @objc func isReady(_ call: CAPPluginCall) {
        let modelId = resolveModelId(call.getString("modelId"))
        let file = findModelURL(id: modelId)
        let ready = file != nil
        var ret: [String: Any] = [
            "ready": ready,
            "modelId": modelId,
        ]
        if !ready {
            ret["detail"] = describeMissing(modelId: modelId)
        }
        call.resolve(ret)
    }

    @objc func prepareModel(_ call: CAPPluginCall) {
        let modelId = resolveModelId(call.getString("modelId"))
        queue.async { [weak self] in
            guard let self else { return }
            let ok = self.ensureContext(modelId: modelId)
            var ret: [String: Any] = [
                "ready": ok,
                "modelId": modelId,
            ]
            if !ok {
                ret["detail"] = self.describeMissing(modelId: modelId)
            }
            call.resolve(ret)
        }
    }

    @objc func transcribe(_ call: CAPPluginCall) {
        let wavBase64 = call.getString("wavBase64") ?? ""
        let language = call.getString("language") ?? "zh"
        let modelId = resolveModelId(call.getString("modelId"))
        if wavBase64.isEmpty {
            call.reject("缺少音频", "invalid_audio")
            return
        }

        queue.async { [weak self] in
            guard let self else { return }
            if !self.ensureContext(modelId: modelId) {
                call.reject(self.describeMissing(modelId: modelId), "model_not_ready")
                return
            }
            guard let context = self.context else {
                call.reject(self.describeMissing(modelId: modelId), "model_not_ready")
                return
            }

            guard let wavData = Data(base64Encoded: wavBase64), wavData.count > 44 else {
                call.reject("WAV 太短", "invalid_audio")
                return
            }

            let samples: [Float]
            do {
                samples = try Self.decodeWavePCM16(wavData)
            } catch {
                call.reject(error.localizedDescription, "invalid_audio")
                return
            }
            if samples.isEmpty {
                call.reject("WAV 无有效采样", "invalid_audio")
                return
            }

            let prompt = "以下是简体中文普通话的家庭日记。"
            let maxThreads = max(1, min(8, ProcessInfo.processInfo.processorCount - 2))
            var params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY)
            params.print_realtime = false
            params.print_progress = false
            params.print_timestamps = false
            params.print_special = false
            params.translate = false
            params.no_timestamps = true
            params.no_context = true
            params.n_threads = Int32(maxThreads)
            params.offset_ms = 0

            let text: String = prompt.withCString { promptPtr in
                language.withCString { langPtr in
                    params.language = langPtr
                    params.initial_prompt = promptPtr

                    let code = samples.withUnsafeBufferPointer { buf in
                        whisper_full(context, params, buf.baseAddress, Int32(buf.count))
                    }
                    if code != 0 {
                        return ""
                    }
                    var out = ""
                    let n = whisper_full_n_segments(context)
                    for i in 0..<n {
                        if let cstr = whisper_full_get_segment_text(context, i) {
                            out += String(cString: cstr)
                        }
                    }
                    return out.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }

            if text.isEmpty {
                // still resolve empty transcript rather than fail — matches soft CLI behavior
                call.resolve(["text": "", "modelId": modelId])
                return
            }
            call.resolve(["text": text, "modelId": modelId])
        }
    }

    private func resolveModelId(_ raw: String?) -> String {
        guard let raw, modelFiles[raw] != nil else { return defaultModelId }
        return raw
    }

    private func modelLabel(_ id: String) -> String {
        switch id {
        case "small": return "Small（更准，较慢）"
        case "base": return "Base（更准，稍慢）"
        default: return "Tiny（更快）"
        }
    }

    private func describeMissing(modelId: String) -> String {
        "缺少 Whisper \(modelId) 模型（ios/Resources/diary-whisper/*.bin）。详见 docs/family-diary-whisper.md"
    }

    private func findModelURL(id: String) -> URL? {
        guard let names = modelFiles[id] else { return nil }
        for name in names {
            if let url = bundleModelURL(name) {
                let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if size > 1024 { return url }
            }
        }
        return nil
    }

    private func bundleModelURL(_ fileName: String) -> URL? {
        if let url = Bundle.main.url(forResource: fileName, withExtension: nil, subdirectory: resourceRoot) {
            return url
        }
        if let bundleUrl = Bundle.main.url(forResource: "DiaryWhisper", withExtension: "bundle"),
           let rb = Bundle(url: bundleUrl)
        {
            if let url = rb.url(forResource: fileName, withExtension: nil, subdirectory: resourceRoot)
                ?? rb.url(forResource: fileName, withExtension: nil)
            {
                return url
            }
            let direct = rb.bundleURL.appendingPathComponent("\(resourceRoot)/\(fileName)")
            if FileManager.default.fileExists(atPath: direct.path) { return direct }
        }
        let candidates = [
            Bundle.main.bundleURL.appendingPathComponent("\(resourceRoot)/\(fileName)"),
            Bundle.main.resourceURL?.appendingPathComponent("\(resourceRoot)/\(fileName)"),
        ].compactMap { $0 }
        return candidates.first { FileManager.default.fileExists(atPath: $0.path) }
    }

    @discardableResult
    private func ensureContext(modelId: String) -> Bool {
        if context != nil, loadedModelId == modelId {
            return true
        }
        if let context {
            whisper_free(context)
            self.context = nil
            loadedModelId = nil
        }
        guard let url = findModelURL(id: modelId) else { return false }

        var params = whisper_context_default_params()
        #if targetEnvironment(simulator)
        params.use_gpu = false
        #else
        params.flash_attn = true
        #endif
        guard let ctx = whisper_init_from_file_with_params(url.path, params) else {
            return false
        }
        context = ctx
        loadedModelId = modelId
        return true
    }

    /// Decode 16-bit PCM WAV (mono or stereo → mono float). Assumes standard 44-byte header.
    private static func decodeWavePCM16(_ data: Data) throws -> [Float] {
        guard data.count > 44 else {
            throw NSError(domain: "DiaryWhisper", code: 1, userInfo: [NSLocalizedDescriptionKey: "WAV 太短"])
        }
        // Prefer RIFF fmt parsing; fall back to skip 44.
        var offset = 12
        var dataOffset = 44
        var bitsPerSample = 16
        var channels = 1
        let bytes = [UInt8](data)
        while offset + 8 <= bytes.count {
            let id = String(bytes: bytes[offset..<offset + 4], encoding: .ascii) ?? ""
            let size = Int(bytes[offset + 4])
                | (Int(bytes[offset + 5]) << 8)
                | (Int(bytes[offset + 6]) << 16)
                | (Int(bytes[offset + 7]) << 24)
            let next = offset + 8 + size
            if id == "fmt ", size >= 16 {
                channels = Int(bytes[offset + 8 + 2]) | (Int(bytes[offset + 8 + 3]) << 8)
                bitsPerSample = Int(bytes[offset + 8 + 14]) | (Int(bytes[offset + 8 + 15]) << 8)
            } else if id == "data" {
                dataOffset = offset + 8
                break
            }
            offset = next + (size % 2) // word align
        }
        guard bitsPerSample == 16 else {
            throw NSError(domain: "DiaryWhisper", code: 2, userInfo: [NSLocalizedDescriptionKey: "仅支持 16-bit PCM WAV"])
        }
        let ch = max(1, channels)
        let frameBytes = 2 * ch
        guard dataOffset < data.count else { return [] }
        var samples: [Float] = []
        samples.reserveCapacity((data.count - dataOffset) / frameBytes)
        var i = dataOffset
        while i + frameBytes <= data.count {
            var acc: Float = 0
            for c in 0..<ch {
                let lo = Int(data[i + c * 2])
                let hi = Int(data[i + c * 2 + 1])
                let sample = Int16(bitPattern: UInt16(lo | (hi << 8)))
                acc += Float(sample) / 32767.0
            }
            samples.append(max(-1, min(1, acc / Float(ch))))
            i += frameBytes
        }
        return samples
    }
}
