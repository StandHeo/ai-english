/** 识别 CapacitorHttp / OkHttp / fetch 的读超时与断连文案 */
export function isCloudTimeoutMessage(msg: string): boolean {
  return /timeout|timed\s*out|llm_timeout|aborted|AbortError|SocketTimeout|Socket closed|SocketException|ETIMEDOUT|ECONNRESET/i.test(
    msg,
  )
}
