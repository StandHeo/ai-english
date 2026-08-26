/**
 * 识别 CapacitorHttp / OkHttp / fetch 的瞬时网络失败文案。
 * 含读超时，以及 Clash/切后台常见的 connection abort。
 */
export function isCloudTimeoutMessage(msg: string): boolean {
  return /timeout|timed\s*out|llm_timeout|abort|AbortError|SocketTimeout|Socket closed|SocketException|ETIMEDOUT|ECONNRESET|ECONNABORTED|connection reset/i.test(
    msg,
  )
}
