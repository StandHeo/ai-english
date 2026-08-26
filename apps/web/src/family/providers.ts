export type FamilyLlmProvider = 'deepseek' | 'agnes'
export type FamilyImageCloudProvider = 'tongyi' | 'agnes'

export const DEFAULT_FAMILY_LLM: FamilyLlmProvider = 'deepseek'
export const DEFAULT_IMAGE_CLOUD: FamilyImageCloudProvider = 'tongyi'

export const AGNES_CHAT_URL = 'https://apihub.agnes-ai.com/v1/chat/completions'
export const AGNES_IMAGE_URL = 'https://apihub.agnes-ai.com/v1/images/generations'
export const AGNES_CHAT_MODEL = 'agnes-2.5-flash'
export const AGNES_IMAGE_MODEL = 'agnes-image-2.1-flash'
/** apihub 对 `1K` + `extra_body` 会挂起；`1024x1024` 返回 URL */
export const AGNES_IMAGE_SIZE = '1024x1024'

export const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions'
export const DEEPSEEK_CHAT_MODEL = 'deepseek-chat'

export const TONGYI_IMAGE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
export const TONGYI_IMAGE_MODEL = 'wan2.6-t2i'

export function isFamilyLlmProvider(v: string): v is FamilyLlmProvider {
  return v === 'deepseek' || v === 'agnes'
}

export function isImageCloudProvider(v: string): v is FamilyImageCloudProvider {
  return v === 'tongyi' || v === 'agnes'
}

export function familyLlmLabel(id: FamilyLlmProvider): string {
  return id === 'agnes' ? 'Agnes 2.5-flash' : 'DeepSeek'
}

export function imageCloudLabel(id: FamilyImageCloudProvider): string {
  return id === 'agnes' ? 'Agnes 图' : '通义万相'
}

/** App：有对应云 Key 可直连 HTTPS；否则才需要电脑局域网 API。 */
export function nativeFamilyCloudReady(hasCloudKey: boolean, apiBase: string): boolean {
  return Boolean(hasCloudKey) || Boolean(apiBase.trim())
}
