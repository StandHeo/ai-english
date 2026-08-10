## Purpose

统一应用内英文朗读入口：原生优先 Sherpa-ONNX + Piper，不可用时降级系统 TTS；浏览器保持现有 Web/系统朗读，避免儿童路径因神经引擎失败而静音。

## ADDED Requirements

### Requirement: 统一朗读入口优先神经引擎
面向关卡与家长试听的朗读入口（如现有 `requestTts` 语义）在 Capacitor 原生且 Piper 就绪时 MUST 优先使用 Piper；在 Piper 不可用时 MUST 降级到现有系统 TTS（Capacitor Text-to-Speech 或等价），MUST NOT 因 Piper 失败而完全不朗读。

#### Scenario: Piper 可用走神经声
- **WHEN** 原生 Piper 就绪且用户触发朗读
- **THEN** 实际播放来自 Piper，而非系统默认声（在可观测的引擎选择意义上）

#### Scenario: Piper 失败仍有声音
- **WHEN** Piper 合成抛错或未就绪
- **THEN** 系统改用系统 TTS 朗读同一文本

### Requirement: 浏览器预览不强制 Piper
在非 Capacitor 原生环境（普通浏览器）下，系统 MUST 继续使用现有 Web `speechSynthesis`（或既有浏览器路径），MUST NOT 把「必须安装 APK」作为浏览器联调的硬阻塞。

#### Scenario: 电脑浏览器联调
- **WHEN** 开发者在桌面浏览器打开关卡并触发朗读
- **THEN** 仍可听到系统/浏览器 TTS，页面不因缺少 Piper 原生桥而报错中断

### Requirement: 与家长音色偏好兼容
当 Piper 可用时，系统 MUST 将既有 persona / 语速音调偏好应用到 Piper 路径（至少映射 rate；若打包多说话人则可映射说话人）。若当前打包仅含单一音色，系统 MUST 仍应用可支持的 rate（或文档说明的近似），且 MUST NOT 丢弃家长已保存的偏好数据。

#### Scenario: 保留已存偏好
- **WHEN** 家长此前保存了 persona 偏好并升级到 Piper 版本
- **THEN** 偏好数据仍可读；朗读使用映射后的 Piper 参数或单一默认音色 + rate

### Requirement: 取消朗读覆盖两路引擎
取消朗读 MUST 同时停止 Piper 与系统 TTS 路径中正在进行的播放（在各自可用时）。

#### Scenario: 取消后静音
- **WHEN** 用户或关卡逻辑触发取消朗读
- **THEN** 当前听不到上一句继续播放（Piper 与系统 TTS 均已 stop）
