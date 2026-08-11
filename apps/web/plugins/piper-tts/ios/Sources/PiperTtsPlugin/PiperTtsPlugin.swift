import Foundation
import Capacitor
import AVFoundation

/**
 * On-device Piper TTS via Sherpa-ONNX (iOS).
 * Capacitor name: PiperTts — mirrors the Android plugin surface.
 */
@objc(PiperTtsPlugin)
public class PiperTtsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PiperTtsPlugin"
    public let jsName = "PiperTts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isReady", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private struct VoicePack {
        let id: String
        let dirName: String
        let onnxName: String
    }

    private let voices: [VoicePack] = [
        VoicePack(id: "amy", dirName: "vits-piper-en_US-amy-low-int8", onnxName: "en_US-amy-low.onnx"),
        VoicePack(id: "danny", dirName: "vits-piper-en_US-danny-low", onnxName: "en_US-danny-low.onnx"),
    ]
    private let defaultVoice = "amy"
    private let resourceRoot = "piper-tts"

    private let queue = DispatchQueue(label: "com.aienglish.pipertts", qos: .userInitiated)
    private var engine: PiperSherpaBridge?
    private var loadedVoiceId: String?
    private var stopRequested = false

    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var timePitch: AVAudioUnitTimePitch?
    private let playLock = NSLock()

    @objc func isReady(_ call: CAPPluginCall) {
        let anyOnDisk = voices.contains { modelReadyInBundle($0) }
        var ret: [String: Any] = [
            "ready": anyOnDisk,
            "voiceId": loadedVoiceId ?? defaultVoice,
        ]
        if !anyOnDisk {
            ret["ready"] = false
            ret["detail"] = "缺少 Piper 模型，请运行 npm run fetch-piper-tts 后重新同步 iOS"
        } else if engine == nil {
            ret["detail"] = "模型已在 Bundle，首次朗读时初始化引擎"
        }
        call.resolve(ret)
    }

    @objc func prepareModel(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }
            let packaged = self.voices.filter { self.modelReadyInBundle($0) }
            if packaged.isEmpty {
                call.reject(
                    "Bundle 未打包 Piper 模型。请执行 npm run fetch-piper-tts 后 cap sync ios",
                    "model_not_ready"
                )
                return
            }
            let ok = self.ensureEngineLocked(self.defaultVoice)
            var ret: [String: Any] = [
                "ready": ok || self.modelReadyInBundle(self.voices[0]),
                "voiceId": self.loadedVoiceId ?? self.defaultVoice,
            ]
            if !ok {
                ret["detail"] = "Sherpa OfflineTts 初始化失败（将在 speak 时重试）"
            }
            call.resolve(ret)
        }
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = (call.getString("text") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            call.reject("文本为空", "invalid_text")
            return
        }
        let voiceId = normalizeVoiceId(call.getString("voiceId"))
        let rate = call.getFloat("rate") ?? 1.0
        let pitch = call.getFloat("pitch") ?? 1.0
        let speed = max(0.55, min(1.45, rate))
        let playPitch = max(0.7, min(1.85, pitch))

        queue.async { [weak self] in
            guard let self else { return }
            self.stopPlaybackLocked()
            self.stopRequested = false

            var useVoice = voiceId
            if !self.ensureEngineLocked(useVoice) {
                if useVoice != self.defaultVoice, self.ensureEngineLocked(self.defaultVoice) {
                    useVoice = self.defaultVoice
                } else {
                    call.reject("Piper 引擎未就绪: \(voiceId)", "model_not_ready")
                    return
                }
            }

            guard let engine = self.engine else {
                call.reject("Piper 引擎未就绪", "model_not_ready")
                return
            }

            var sampleRate: Int32 = 0
            guard let pcm = engine.synthesizeText(text, speed: speed, sampleRate: &sampleRate),
                  sampleRate > 0
            else {
                call.reject("合成结果为空", "speak_failed")
                return
            }

            if self.stopRequested {
                call.resolve(["status": "stopped", "voiceId": useVoice])
                return
            }

            self.playFloat32PCM(pcm, sampleRate: Double(sampleRate), pitch: playPitch)
            call.resolve([
                "status": self.stopRequested ? "stopped" : "ok",
                "voiceId": useVoice,
            ])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopRequested = true
        stopPlaybackLocked()
        call.resolve([
            "status": "stopped",
            "voiceId": loadedVoiceId ?? defaultVoice,
        ])
    }

    private func normalizeVoiceId(_ raw: String?) -> String {
        guard let raw else { return defaultVoice }
        let id = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if voices.contains(where: { $0.id == id }) { return id }
        if id.contains("danny") || id.contains("boy") || id.contains("male") || id == "man" {
            return "danny"
        }
        return defaultVoice
    }

    private func pack(for id: String) -> VoicePack? {
        voices.first { $0.id == id }
    }

    private func modelReadyInBundle(_ pack: VoicePack) -> Bool {
        guard let onnx = bundleURL(pack.dirName, pack.onnxName),
              let tokens = bundleURL(pack.dirName, "tokens.txt"),
              let dataDir = bundleDirectory(pack.dirName, "espeak-ng-data")
        else { return false }
        let onnxSize = (try? onnx.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        return onnxSize > 1024 && FileManager.default.fileExists(atPath: tokens.path)
            && FileManager.default.fileExists(atPath: dataDir.path)
    }

    private func bundleURL(_ dir: String, _ file: String) -> URL? {
        let relative = "\(resourceRoot)/\(dir)/\(file)"
        if let url = Bundle.main.url(forResource: file, withExtension: nil, subdirectory: "\(resourceRoot)/\(dir)") {
            return url
        }
        // Resource bundles (CocoaPods resource_bundles)
        if let bundleUrl = Bundle.main.url(forResource: "PiperTts", withExtension: "bundle"),
           let rb = Bundle(url: bundleUrl),
           let url = rb.url(forResource: file, withExtension: nil, subdirectory: "\(resourceRoot)/\(dir)")
            ?? rb.url(forResource: file, withExtension: nil, subdirectory: dir)
        {
            return url
        }
        let candidates = [
            Bundle.main.bundleURL.appendingPathComponent(relative),
            Bundle.main.resourceURL?.appendingPathComponent(relative),
        ].compactMap { $0 }
        return candidates.first { FileManager.default.fileExists(atPath: $0.path) }
    }

    private func bundleDirectory(_ dir: String, _ name: String) -> URL? {
        let relative = "\(resourceRoot)/\(dir)/\(name)"
        if let url = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: "\(resourceRoot)/\(dir)") {
            return url
        }
        if let bundleUrl = Bundle.main.url(forResource: "PiperTts", withExtension: "bundle"),
           let rb = Bundle(url: bundleUrl)
        {
            let u1 = rb.bundleURL.appendingPathComponent("\(resourceRoot)/\(dir)/\(name)")
            let u2 = rb.bundleURL.appendingPathComponent("\(dir)/\(name)")
            if FileManager.default.fileExists(atPath: u1.path) { return u1 }
            if FileManager.default.fileExists(atPath: u2.path) { return u2 }
        }
        let candidates = [
            Bundle.main.bundleURL.appendingPathComponent(relative),
            Bundle.main.resourceURL?.appendingPathComponent(relative),
        ].compactMap { $0 }
        return candidates.first {
            var isDir: ObjCBool = false
            return FileManager.default.fileExists(atPath: $0.path, isDirectory: &isDir) && isDir.boolValue
        }
    }

    @discardableResult
    private func ensureEngineLocked(_ voiceId: String) -> Bool {
        if let engine, engine.isReady, loadedVoiceId == voiceId {
            return true
        }
        engine = nil
        loadedVoiceId = nil

        guard let pack = pack(for: voiceId),
              let onnx = bundleURL(pack.dirName, pack.onnxName),
              let tokens = bundleURL(pack.dirName, "tokens.txt"),
              let dataDir = bundleDirectory(pack.dirName, "espeak-ng-data")
        else {
            return false
        }

        guard let next = PiperSherpaBridge(
            modelPath: onnx.path,
            tokensPath: tokens.path,
            dataDir: dataDir.path
        ), next.isReady else {
            return false
        }
        engine = next
        loadedVoiceId = voiceId
        return true
    }

    private func playFloat32PCM(_ data: NSData, sampleRate: Double, pitch: Float) {
        playLock.lock()
        defer { playLock.unlock() }

        stopPlaybackEngineOnly()

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
        } catch {
            CAPLog.print("PiperTts AVAudioSession: \(error)")
        }

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let pitchUnit = AVAudioUnitTimePitch()
        pitchUnit.pitch = 1200 * log2(max(0.7, min(1.85, pitch)))
        pitchUnit.rate = 1.0

        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: false
        ) else { return }

        engine.attach(player)
        engine.attach(pitchUnit)
        engine.connect(player, to: pitchUnit, format: format)
        engine.connect(pitchUnit, to: engine.mainMixerNode, format: format)

        let frameCount = data.length / MemoryLayout<Float>.size
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount))
        else { return }
        buffer.frameLength = AVAudioFrameCount(frameCount)
        data.getBytes(buffer.floatChannelData![0], length: data.length)

        do {
            try engine.start()
        } catch {
            CAPLog.print("PiperTts engine start: \(error)")
            return
        }

        audioEngine = engine
        playerNode = player
        timePitch = pitchUnit

        let done = DispatchSemaphore(value: 0)
        player.scheduleBuffer(buffer) { [weak self] in
            done.signal()
            _ = self
        }
        player.play()

        while !stopRequested {
            if done.wait(timeout: .now() + 0.05) == .success {
                break
            }
        }
        if stopRequested {
            player.stop()
        } else {
            // brief tail for pitch node
            Thread.sleep(forTimeInterval: 0.05)
        }
        stopPlaybackEngineOnly()
    }

    private func stopPlaybackLocked() {
        playLock.lock()
        defer { playLock.unlock() }
        stopPlaybackEngineOnly()
    }

    private func stopPlaybackEngineOnly() {
        playerNode?.stop()
        audioEngine?.stop()
        playerNode = nil
        timePitch = nil
        audioEngine = nil
    }
}
