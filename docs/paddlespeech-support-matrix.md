# PaddleSpeech 官方支持矩阵（调研备忘）

> **范围**：仅依据 [PaddlePaddle/PaddleSpeech](https://github.com/PaddlePaddle/PaddleSpeech) 公开仓库材料整理，**不引用**第三方博客/评测站。  
> **对照快照**：
>
> - 最新正式版标签：[r1.5.0](https://github.com/PaddlePaddle/PaddleSpeech/releases/tag/r1.5.0)（发布于 2025-03-05）
> - 文档/demos 清单：仓库默认分支 `develop`（调研时读取）
> - 许可证：[Apache License 2.0](https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/LICENSE)
>
> **非目标**：百度智能云等商业语音 API；本文件不评价计费云服务。

与本仓库现有语音栈的对照结论见文末；产品技术方案总览见 [`tech-architecture.md`](./tech-architecture.md)。

---

## 1. 版本与文档入口

| 项 | 官方链接 |
|----|----------|
| 仓库 | https://github.com/PaddlePaddle/PaddleSpeech |
| 中文 README | https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/README_cn.md |
| 英文 README | https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/README.md |
| 在线文档站点 | https://paddlespeech.readthedocs.io |
| 最新 Release | https://github.com/PaddlePaddle/PaddleSpeech/releases/tag/r1.5.0 |
| 安装说明 | https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/docs/source/install.md |

### r1.5.0 官方 Highlight（摘要）

依据 [Release Note](https://github.com/PaddlePaddle/PaddleSpeech/releases/tag/r1.5.0)：

- 适配 **PaddlePaddle 3.0.0-beta**（自 2.5.1 升级）。
- 新增 AudioTools（DAC 相关）等；大量模型/demo 兼容性修复。
- **未**宣布新增官方 Android ASR App Demo，也**未**宣布替代 Capacitor/移动端一等公民 SDK。

### develop 相对更新的 changelog 条目（摘自 README_cn）

依据 [README_cn.md](https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/README_cn.md) 近期条目（可能新于 r1.5.0 标签）：

- 2025.09.01：新增 [Whisper large v3 与 turbo](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/whisper)
- 2025.08.11：新增流式中英混合相关（tal_cs）说明
- 2022.11.30：新增 [TTS Android 部署示例](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/TTSAndroid)（此后 README 未再宣布「ASR Android App」对等 Demo）

---

## 2. 部署形态总表（官方主推）

| 形态 | 官方入口 | ASR | TTS | 说明（据官方 README/demo） |
|------|----------|-----|-----|---------------------------|
| CLI / Python API | README Quick Start | ✅ | ✅ | `paddlespeech asr` / `tts` / `whisper` 等；推荐 Linux + Python |
| 离线 Server | [`demos/speech_server`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/speech_server) | ✅ | ✅ | REST；还可含 cls / vector / text |
| 流式 ASR Server | [`demos/streaming_asr_server`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/streaming_asr_server) | ✅ | — | **仅 WebSocket**，不支持 HTTP |
| 流式 TTS Server | [`demos/streaming_tts_server`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/streaming_tts_server) | — | ✅ | HTTP 与 WebSocket；AM/Voc 组合见该 README |
| C++ / SpeechX ASR 部署 | [`demos/asr_deployment`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/asr_deployment) | ✅ | — | U2/U2++/DeepSpeech2 等；面向 SpeechX/服务器式部署，**不是** Android App 工程 |
| Android TTS（Paddle Lite） | [`demos/TTSAndroid`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/TTSAndroid) | — | ✅ | 官方 Android Java Demo |
| ARM Linux TTS | [`demos/TTSArmLinux`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/TTSArmLinux) | — | ✅ | 由 TTSAndroid 改；同模型族 |
| Whisper（Paddle 封装） | [`demos/whisper`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/whisper) | ✅ | — | CLI：`paddlespeech whisper`；模型来自 OpenAI Whisper 训练脉络 |

---

## 3. `demos/` 目录清单（develop）

调研时 `develop` 下 demos 目录（官方仓库）：

| Demo 目录 | 粗分类 |
|-----------|--------|
| `speech_recognition` | ASR CLI/文件识别 |
| `streaming_asr_server` | 流式 ASR 服务 |
| `custom_streaming_asr` | 定制流式 ASR |
| `asr_deployment` | SpeechX C++ ASR 部署 |
| `whisper` | Whisper 识别/翻译 CLI |
| `speech_ssl` | SSL / Wav2vec 等 |
| `text_to_speech` | TTS |
| `streaming_tts_server` | 流式 TTS 服务 |
| `streaming_tts_serving_fastdeploy` | FastDeploy 流式 TTS |
| `TTSAndroid` | **Android** TTS |
| `TTSArmLinux` | ARM Linux TTS |
| `TTSCppFrontend` | TTS C++ 前端相关 |
| `style_fs2` | TTS 风格相关 |
| `speech_server` | 综合离线服务 |
| `speech_web` | Web Demo |
| `punctuation_restoration` | 标点 |
| `speaker_verification` / `audio_searching` / `audio_content_search` / `audio_tagging` | 声纹/检索/分类 |
| `speech_translation` | 语音翻译 |
| `keyword_spotting` | 唤醒/关键词 |
| `automatic_video_subtitiles` | 字幕 |
| `story_talker` / `metaverse` | 综合 demo |

**Android 路径核查**：对 `develop` 树检索含 `Android`/`android` 的路径时，命中集中在 `demos/TTSAndroid/**`（TTS），**未发现**对等的官方 `ASRAndroid` 工程目录。

---

## 4. ASR 能力矩阵（官方表述）

| 能力 | 官方依据 | 状态 |
|------|----------|------|
| 中文 ASR | README / [`speech_recognition`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/speech_recognition)（如 conformer_wenetspeech 等） | ✅ CLI/Server |
| 英文 ASR | 同上（如 `transformer_librispeech`、`--lang en`） | ✅ CLI/Server |
| 中英混合 / code-switch | README changelog；`speech_server` 指出混合识别用专用 yaml | ✅（配置/模型有专门路径） |
| 流式 ASR | [`streaming_asr_server`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/streaming_asr_server) | ✅ WebSocket |
| Whisper 多语识别/翻译 | [`demos/whisper`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/whisper) | ✅ CLI（Paddle 侧封装） |
| C++ 高性能部署 | [`asr_deployment`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/asr_deployment) + SpeechX | ✅ 服务端/嵌入式 Linux 向 |
| **官方 Android ASR App Demo** | demos 清单 + 树检索 | ❌ **未提供与 TTSAndroid 对等的官方工程** |

预训练模型表以各 demo README 与文档站点为准（会随版本增减），调研时 `speech_recognition` README 列出的命令可用模型包括但不限于：`conformer_wenetspeech`、`transformer_librispeech`、`conformer_talcs`（中英）、DeepSpeech2 系列等。

---

## 5. TTS 能力矩阵（官方表述）

| 能力 | 官方依据 | 状态 |
|------|----------|------|
| CLI / Python TTS | README Quick Start | ✅ |
| 离线 Server TTS | [`speech_server`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/speech_server) | ✅ |
| 流式 TTS | [`streaming_tts_server`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/streaming_tts_server) | ✅ HTTP / WebSocket |
| Android 端侧（Paddle Lite） | [`TTSAndroid`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/TTSAndroid) | ✅ Demo |
| ARM Linux 端侧 | [`TTSArmLinux`](https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/TTSArmLinux) | ✅ Demo |
| 中文规则文本前端（研究/服务端） | 文档树 `docs/source/tts/`（README 有入口） | ✅ 文档完备度高 |
| **TTSAndroid 内置完整任意文本前端** | [TTSAndroid README](https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/demos/TTSAndroid/README.md) 明确写道 Demo **不包含文本前端模块**，预置句子映射 phone id；需自接前端 | ⚠️ Demo 限制 |

TTSAndroid 官方说明的模型示例（同 README）：

- 声学：`fastspeech2_csmsc_arm.nb`（来自 released fastspeech2 pdlite 包）
- 声码：`mb_melgan_csmsc_arm.nb`
- 推理：Paddle Lite Java API

官方指向的自备前端参考（仍属官方 README 外链到社区仓，仅作「官方文档提及」记录）：

- 中文 C++ 前端、英文 g2p 等链接见 TTSAndroid README「更新输入」一节。

---

## 6. 与本仓库（ai-english）对照（工程判断）

> 以下不是 Paddle 官方结论，而是对照本仓库 [`tech-architecture.md`](./tech-architecture.md) 的落地判断。

| 本仓库场景 | 当前方案 | PaddleSpeech 官方矩阵中的对应位 | 贴合度 |
|------------|----------|----------------------------------|--------|
| 关卡英文短词 ASR | 浏览器 SpeechRecognition；规划 Vosk | CLI/Server 英文 ASR；无官方 Android ASR App | PC 服务可行；**手机端侧不如 Vosk/现有路径省事** |
| 家庭日记中文 ASR | Capacitor 端侧 Whisper 桥 | `paddlespeech whisper` / 中文 ASR Server；无官方日记式 Android ASR | **能力重叠**（Paddle 也接 Whisper）；端侧仍要自研 |
| 儿童英文 TTS | 系统 TTS + persona | TTSAndroid 偏 CSMSC 中文链路；缺完整文本前端 | **现状更贴英文关卡** |
| 家长中文旁白（若要） | 系统中文 | Server/TTSAndroid 中文更强 | **可选补强** |
| 许可证/费用 | 开源/系统免费 | Apache-2.0 自托管 | 打平 |

**简表结论（可归档）：**

1. PaddleSpeech **确实提供免费开源 ASR + TTS**（Apache-2.0），主战场是 **Linux CLI + Server（含流式）**。  
2. **手机官方一等公民**目前主要是 **TTS Android Demo**；ASR 官方是 Server/SpeechX/CLI，**不是**现成 Capacitor ASR 插件。  
3. develop 已带 **Whisper demo**，与本仓库日记 Whisper 路线重叠，不构成「必须换栈」的差异化。  
4. 若采用 Paddle，更合理的形态是：**家用 PC 跑 speech/streaming server**，或 **仅评估中文 TTS**；不宜假设「官方已提供可直接替换双轨的 Android ASR+TTS SDK」。

---

## 7. 复核清单（以后升级版本时重跑）

1. 打开 https://github.com/PaddlePaddle/PaddleSpeech/releases 核对是否有新于 r1.5.0 的正式版。  
2. 打开 `develop` 的 `demos/` 是否新增 `*Android*` ASR 工程。  
3. 读 README_cn changelog 顶部 10 条，更新第 1、4、5 节表格。  
4. 若官方新增 Capacitor/Flutter/正式 Mobile SDK，再重评第 6 节贴合度。

---

## 8. 主要引用（官方）

- https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/README_cn.md  
- https://github.com/PaddlePaddle/PaddleSpeech/releases/tag/r1.5.0  
- https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/LICENSE  
- https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/TTSAndroid  
- https://github.com/PaddlePaddle/PaddleSpeech/blob/develop/demos/TTSAndroid/README.md  
- https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/streaming_asr_server  
- https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/streaming_tts_server  
- https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/speech_server  
- https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/asr_deployment  
- https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/whisper  
- https://github.com/PaddlePaddle/PaddleSpeech/tree/develop/demos/speech_recognition  
