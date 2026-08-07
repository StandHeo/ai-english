## Purpose

在 Capacitor 原生环境用免费端侧 Whisper 将家庭日记录音转写为文本，与关卡口语 ASR（如 Vosk）隔离，避免日记默认走云端付费 Whisper。

## ADDED Requirements

### Requirement: 日记转写使用端侧 Whisper
在 Capacitor 原生运行且模型可用时，系统 MUST 使用设备上的 Whisper（或等价端侧 Whisper 运行时）转写家庭日记语音消息。日记主路径 MUST NOT 默认调用云端 OpenAI Whisper。

#### Scenario: 原生环境转写成功
- **WHEN** 家长在已集成端侧 Whisper 的 Capacitor 包中发送一段清晰的日记录音
- **THEN** 系统返回转写文本并写入该条消息，且请求未发往云端 OpenAI ASR

### Requirement: 与关卡口语引擎隔离
家庭日记 ASR MUST 独立于关卡拍练习所用的口语识别路径（如 Vosk）。本能力 MUST NOT 要求关卡口语改用 Whisper，也 MUST NOT 禁止关卡继续使用 Vosk。

#### Scenario: 日记与关卡引擎并存
- **WHEN** 应用同时具备日记 Whisper 与关卡 Vosk（或预留）配置
- **THEN** 家庭日记转写走 Whisper 路径，关卡口语识别不因本能力被强制改为 Whisper

### Requirement: 无原生 Whisper 时的明确降级
当运行环境无法使用端侧 Whisper（例如纯浏览器预览）时，系统 MUST 向家长展示明确说明，并 MUST 仍允许纯文字录入日记。系统 MUST NOT 在无用户明确开启的情况下把日记默认切到云端 OpenAI Whisper。

#### Scenario: 浏览器预览无端侧模型
- **WHEN** 家长在非 Capacitor 原生环境尝试语音日记
- **THEN** 系统提示需在 App/APK 使用端侧语音或改用打字，且不自动上传到云端 OpenAI ASR

### Requirement: 模型体积与可用性可感知
系统 MUST 在模型首次准备（下载或解包）失败或耗时过长时给出可理解的状态或错误提示，避免家长误以为麦克风损坏。

#### Scenario: 模型未就绪提示
- **WHEN** 端侧 Whisper 模型尚未就绪且家长发起语音转写
- **THEN** 系统展示模型准备中/失败类提示，并可保留已录音频供稍后重试或手改文本
