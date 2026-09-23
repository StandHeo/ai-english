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
        CAPPluginMethod(name: "downloadModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transcribe", returnType: CAPPluginReturnPromise),
    ]

    private let defaultModelId = "tiny"
    private let resourceRoot = "diary-whisper"
    private let downloadEvent = "diaryWhisperDownload"
    private let modelFiles: [String: [String]] = [
        "tiny": ["ggml-tiny-q5_1.bin", "ggml-tiny.bin", "ggml-tiny-int8.bin"],
        "base": ["ggml-base-q5_1.bin", "ggml-base.bin"],
        "small": ["ggml-small-q5_1.bin", "ggml-small.bin"],
    ]
    private let modelMinBytes: [String: Int64] = [
        "tiny": 1_000_000,
        "base": 10_000_000,
        "small": 50_000_000,
    ]
    private let modelApproxBytes: [String: Int64] = [
        "tiny": 31_000_000,
        "base": 57_000_000,
        "small": 181_000_000,
    ]
    private let modelUrls: [String: [String]] = [
        "tiny": [
            "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
        ],
        "base": [
            "http://118.24.164.40/models/ggml-base-q5_1.bin",
            "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
        ],
        "small": [
            "http://118.24.164.40/models/ggml-small-q5_1.bin",
            "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
        ],
    ]

    private let queue = DispatchQueue(label: "com.aienglish.diarywhisper", qos: .userInitiated)
    private var context: OpaquePointer?
    private var loadedModelId: String?
    private var downloading = false

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
                "packaged": packaged,
                "needsDownload": !ready && !packaged,
                "downloadBytes": modelApproxBytes[id] ?? 0,
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
        let packaged = (modelFiles[modelId] ?? []).contains { bundleModelURL($0) != nil }
        let ready = file != nil
        var ret: [String: Any] = [
            "ready": ready,
            "modelId": modelId,
            "packaged": packaged,
            "needsDownload": !ready && !packaged,
            "downloadBytes": modelApproxBytes[modelId] ?? 0,
        ]
        if !ready {
            ret["detail"] = describeMissing(modelId: modelId, packaged: packaged)
        }
        call.resolve(ret)
    }

    @objc func prepareModel(_ call: CAPPluginCall) {
        let modelId = resolveModelId(call.getString("modelId"))
        queue.async { [weak self] in
            guard let self else { return }
            // Copy packaged tiny (or others) into Documents if needed so downloads share one dir.
            self.copyPackagedIfNeeded(modelId: modelId)
            let ok = self.ensureContext(modelId: modelId)
            let packaged = (self.modelFiles[modelId] ?? []).contains { self.bundleModelURL($0) != nil }
            var ret: [String: Any] = [
                "ready": ok,
                "modelId": modelId,
                "packaged": packaged,
                "needsDownload": !ok && !packaged,
                "downloadBytes": self.modelApproxBytes[modelId] ?? 0,
            ]
            if !ok {
                ret["detail"] = self.describeMissing(modelId: modelId, packaged: packaged)
            }
            call.resolve(ret)
        }
    }

    @objc func downloadModel(_ call: CAPPluginCall) {
        let modelId = resolveModelId(call.getString("modelId"))
        guard modelFiles[modelId] != nil else {
            call.reject("未知模型：\(modelId)", "model_not_ready")
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            if self.downloading {
                call.reject("已有模型正在下载，请稍候", "download_busy")
                return
            }
            self.downloading = true
            defer { self.downloading = false }

            self.copyPackagedIfNeeded(modelId: modelId)
            if let existing = self.findModelURL(id: modelId) {
                let size = (try? existing.resourceValues(forKeys: [.fileSizeKey]).fileSize).map { Int64($0) } ?? 0
                self.emitProgress(modelId: modelId, received: size, total: size, fraction: 1, phase: "done")
                call.resolve([
                    "ready": true,
                    "modelId": modelId,
                    "packaged": (self.modelFiles[modelId] ?? []).contains { self.bundleModelURL($0) != nil },
                    "needsDownload": false,
                    "downloadBytes": self.modelApproxBytes[modelId] ?? 0,
                ])
                return
            }

            let fileName = self.modelFiles[modelId]?.first ?? "ggml-\(modelId).bin"
            let dest = self.downloadedModelsDir().appendingPathComponent(fileName)
            let partial = dest.appendingPathExtension("partial")
            let urls = self.modelUrls[modelId] ?? []
            let minBytes = self.modelMinBytes[modelId] ?? 1_000_000
            let approx = self.modelApproxBytes[modelId] ?? minBytes
            var lastError: Error?
            var ok = false
            for urlString in urls {
                do {
                    self.emitProgress(modelId: modelId, received: 0, total: approx, fraction: 0, phase: "start")
                    try self.download(urlString: urlString, to: partial, modelId: modelId, approxTotal: approx)
                    let size = (try? FileManager.default.attributesOfItem(atPath: partial.path)[.size] as? NSNumber)?.int64Value ?? 0
                    guard size >= minBytes else {
                        throw NSError(domain: "DiaryWhisper", code: 3, userInfo: [NSLocalizedDescriptionKey: "下载文件过小：\(size)"])
                    }
                    try? FileManager.default.removeItem(at: dest)
                    try FileManager.default.moveItem(at: partial, to: dest)
                    ok = true
                    break
                } catch {
                    lastError = error
                    try? FileManager.default.removeItem(at: partial)
                }
            }
            if !ok {
                self.emitProgress(modelId: modelId, received: 0, total: approx, fraction: 0, phase: "error")
                call.reject(lastError?.localizedDescription ?? "模型下载失败", "download_failed")
                return
            }
            let ready = self.findModelURL(id: modelId) != nil
            let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.int64Value ?? approx
            self.emitProgress(modelId: modelId, received: size, total: approx, fraction: 1, phase: "done")
            call.resolve([
                "ready": ready,
                "modelId": modelId,
                "packaged": false,
                "needsDownload": !ready,
                "downloadBytes": approx,
            ])
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
                let packaged = (self.modelFiles[modelId] ?? []).contains { self.bundleModelURL($0) != nil }
                call.reject(self.describeMissing(modelId: modelId, packaged: packaged), "model_not_ready")
                return
            }
            guard let context = self.context else {
                let packaged = (self.modelFiles[modelId] ?? []).contains { self.bundleModelURL($0) != nil }
                call.reject(self.describeMissing(modelId: modelId, packaged: packaged), "model_not_ready")
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

    private func describeMissing(modelId: String, packaged: Bool) -> String {
        if packaged {
            return "缺少 Whisper \(modelId) 模型（需先 prepare 解包）。详见 docs/family-diary-whisper.md"
        }
        return "缺少 Whisper \(modelId) 模型，请先下载（设置 → 语音转写模型）。详见 docs/family-diary-whisper.md"
    }

    private func downloadedModelsDir() -> URL {
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dir = base.appendingPathComponent(resourceRoot, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func findModelURL(id: String) -> URL? {
        guard let names = modelFiles[id] else { return nil }
        // Prefer downloaded / copied files in Documents
        for name in names {
            let local = downloadedModelsDir().appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: local.path) {
                let size = (try? local.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if size > 1024 { return local }
            }
        }
        for name in names {
            if let url = bundleModelURL(name) {
                let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if size > 1024 { return url }
            }
        }
        return nil
    }

    @discardableResult
    private func copyPackagedIfNeeded(modelId: String) -> Bool {
        guard let names = modelFiles[modelId] else { return false }
        if findModelURL(id: modelId) != nil {
            // already have downloaded or will resolve from bundle
            if downloadedModelsDir().path.contains(resourceRoot) {
                for name in names {
                    let local = downloadedModelsDir().appendingPathComponent(name)
                    if FileManager.default.fileExists(atPath: local.path) { return true }
                }
            }
        }
        for name in names {
            guard let src = bundleModelURL(name) else { continue }
            let dest = downloadedModelsDir().appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: dest.path) { return true }
            do {
                try FileManager.default.copyItem(at: src, to: dest)
                return true
            } catch {
                continue
            }
        }
        return false
    }

    private func emitProgress(modelId: String, received: Int64, total: Int64, fraction: Double, phase: String) {
        notifyListeners(downloadEvent, data: [
            "modelId": modelId,
            "received": received,
            "total": total,
            "fraction": fraction,
            "phase": phase,
        ])
    }

    private func download(urlString: String, to dest: URL, modelId: String, approxTotal: Int64) throws {
        guard let url = URL(string: urlString) else {
            throw NSError(domain: "DiaryWhisper", code: 4, userInfo: [NSLocalizedDescriptionKey: "无效下载地址"])
        }
        let semaphore = DispatchSemaphore(value: 0)
        var resultError: Error?
        let task = URLSession.shared.downloadTask(with: url) { tempURL, response, error in
            defer { semaphore.signal() }
            if let error {
                resultError = error
                return
            }
            if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                resultError = NSError(
                    domain: "DiaryWhisper",
                    code: http.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode)"]
                )
                return
            }
            guard let tempURL else {
                resultError = NSError(domain: "DiaryWhisper", code: 5, userInfo: [NSLocalizedDescriptionKey: "空下载结果"])
                return
            }
            do {
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.moveItem(at: tempURL, to: dest)
                let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.int64Value ?? approxTotal
                self.emitProgress(modelId: modelId, received: size, total: max(approxTotal, size), fraction: 1, phase: "progress")
            } catch {
                resultError = error
            }
        }
        // Coarse progress: start + done (URLSession downloadTask has limited hooks without delegate)
        emitProgress(modelId: modelId, received: 0, total: approxTotal, fraction: 0.05, phase: "progress")
        task.resume()
        _ = semaphore.wait(timeout: .now() + 1200)
        if let resultError { throw resultError }
        if !FileManager.default.fileExists(atPath: dest.path) {
            throw NSError(domain: "DiaryWhisper", code: 6, userInfo: [NSLocalizedDescriptionKey: "下载未完成"])
        }
    }

    /// SPM 资源在 `Bundle.module`（如 DiaryWhisper_DiaryWhisperPlugin.bundle）；CocoaPods 可能在主 Bundle。
    private func resourceBundles() -> [Bundle] {
        var bundles: [Bundle] = []
        #if SWIFT_PACKAGE
        bundles.append(Bundle.module)
        #endif
        let names = [
            "DiaryWhisper_DiaryWhisperPlugin",
            "DiaryWhisperPlugin",
            "DiaryWhisper",
        ]
        for name in names {
            if let url = Bundle.main.url(forResource: name, withExtension: "bundle"),
               let b = Bundle(url: url)
            {
                bundles.append(b)
            }
        }
        bundles.append(.main)
        var seen = Set<String>()
        return bundles.filter { seen.insert($0.bundlePath).inserted }
    }

    private func bundleModelURL(_ fileName: String) -> URL? {
        let relative = "\(resourceRoot)/\(fileName)"
        for bundle in resourceBundles() {
            if let url = bundle.url(forResource: fileName, withExtension: nil, subdirectory: resourceRoot)
                ?? bundle.url(forResource: fileName, withExtension: nil)
            {
                let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if size > 1024 { return url }
            }
            let candidates = [
                bundle.bundleURL.appendingPathComponent(relative),
                bundle.resourceURL?.appendingPathComponent(relative),
            ].compactMap { $0 }
            if let hit = candidates.first(where: {
                guard FileManager.default.fileExists(atPath: $0.path) else { return false }
                let size = (try? $0.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                return size > 1024
            }) {
                return hit
            }
        }
        return nil
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
