## Purpose

在 Capacitor 原生环境通过 Sherpa-ONNX 加载 Piper 英文模型，离线合成儿童关卡所需的短句语音，替代生硬的系统 TTS 作为优先听感来源。

## ADDED Requirements

### Requirement: 原生环境使用 Piper 离线合成
在 Capacitor 原生运行且 Piper 模型已就绪时，系统 MUST 使用 Sherpa-ONNX + Piper 将英文文本合成为可播放音频，且 MUST NOT 为此上传文本到云端 TTS 服务。

#### Scenario: 原生就绪时合成成功
- **WHEN** 家长或儿童在已集成 Piper 的 App 中触发一句英文朗读且模型就绪
- **THEN** 设备播放由 Piper 合成的语音，且该次合成未请求云端 TTS API

### Requirement: 模型准备状态可感知
系统 MUST 能区分「引擎不可用 / 模型未就绪 / 合成失败」，并向调用方或家长试听路径提供可理解状态（不必向儿童展示技术细节）。

#### Scenario: 模型未就绪
- **WHEN** 原生环境可调用桥接但 Piper 模型尚未准备完成
- **THEN** 系统报告模型未就绪类状态，调用方可以降级而不崩溃

### Requirement: 支持取消正在播放的合成
系统 MUST 允许取消当前 Piper 播放（或等价停止），以便关卡切换拍时打断上一句。

#### Scenario: 切换拍时停止上一句
- **WHEN** 新的朗读请求到来或显式取消
- **THEN** 上一句 Piper 播放停止，不再与新句叠音（在平台能力范围内）

### Requirement: 默认英文短句场景
Piper 主路径 MUST 以英文（如 `en-US` 音色）服务关卡 `npc_say` / 提示短句；系统 MUST NOT 要求用户联网下载付费音色才能完成首句试听（模型可随包或首次本地解包）。

#### Scenario: 离线首启可听
- **WHEN** 已安装含模型资源的 APK 且无网络
- **THEN** 仍可用 Piper 完成至少一句英文试听或关卡朗读（模型已解包的前提下）
