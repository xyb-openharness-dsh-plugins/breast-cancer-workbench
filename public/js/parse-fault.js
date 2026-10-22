/**
 * 解析失败的「人话」映射。
 *
 * 服务端把失败原因写进 `parse_job.error_code` / `error_text`（原始报文），
 * 界面不该把 `NO_TOKEN：没有 MinerU Token：设置环境变量…` 直接甩给用户——
 * 那一串是给排查用的，用户需要的是「哪里不对 + 下一步能做什么」。
 *
 * 三条硬边界：
 * 1. 只描述**发生了什么**和**可以做什么**，不写处置意见、不猜病情；
 * 2. 每条都提醒「原件保留、没有产生候选」，因为这是用户最担心的（失败会不会丢资料）；
 * 3. 未知错误码不猜原因，老实说"没有记录到具体原因"，并给原件位置与重试入口。
 */

export const PARSE_FAULTS = {
  NO_TOKEN: {
    label: '未配置 Token',
    title: '还没有可用的 MinerU Token',
    hint: 'PDF、图片和 Office 文件需要云端解析。到「设置 → MinerU」填好 Token 后再点重试；原件没上传也没被动过，不想配 Token 也可以手工录入这次的关键数值。',
    settings: true,
    retry: false,
  },
  UNAUTHORIZED: {
    label: 'Token 无效',
    title: 'MinerU Token 无效或已过期',
    hint: '到 MinerU 控制台确认当前 Token，重新填写后重试。原件没有被动过。',
    settings: true,
    retry: false,
  },
  CONSENT_REQUIRED: {
    label: '未获同意',
    title: '还没有勾选「允许上传到 MinerU 云端解析」',
    hint: '在上面的导入框里勾选同意后重试；原件存在你的资料目录里，没有被上传。上传的只有这份文件本身，不含档案、看法与问题；TXT / MD / CSV 始终在本机抽取。',
    settings: false,
    retry: true,
  },
  TIMEOUT: {
    label: '等待超时',
    title: '等云端结果超时了',
    hint: '网络慢或云端排队时会超时。原件仍在资料目录里，直接重试即可；连续几次都不行，先把这次的关键数值手工录入，不影响后面核对。',
    settings: false,
    retry: true,
  },
  TASK_FAILED: {
    label: '云端未解析',
    title: '云端没能解析这份文件',
    hint: '模糊扫描件、双栏排版、加密 PDF 都可能失败。换更清晰的版本（或先导出成文本）再试；原件与已录入的内容都不会丢。',
    settings: false,
    retry: true,
  },
  API_ERROR: {
    label: '接口报错',
    title: 'MinerU 接口返回了错误',
    hint: '多半是网络或账号侧的问题。稍后重试；一直失败时核对 Token 与额度。原件保留，可以随时再来。',
    settings: true,
    retry: true,
  },
  EMPTY_FILE: {
    label: '文件是空的',
    title: '这份文件没有内容',
    hint: '0 字节的文件解析不出东西。重新选一份原件导入，或换一份导出的 PDF。',
    settings: false,
    retry: false,
  },
  local_parse_error: {
    label: '本机抽取失败',
    title: '这份文本在本机没能抽出来',
    hint: 'TXT / MD / CSV 走本机抽取，格式乱（比如表格被拷成一段）时会读不出指标。原件还在；按「化验项 值 单位」整理成一行一条再试，或手工录入。',
    settings: false,
    retry: true,
  },
}

const FALLBACK = {
  label: '解析失败',
  title: '这次解析没有成功',
  hint: '没有记录到具体原因。原件仍保留在资料目录里，可以直接重试或手工录入关键数值。',
  settings: false,
  retry: true,
}

/** 错误码 → { code, label, title, hint, settings, retry }；未知码不猜原因。 */
export function parseFault(code, text = '') {
  const key = String(code ?? '').trim()
  const hit = PARSE_FAULTS[key]
  if (hit) return { code: key, ...hit }
  const fallback = { code: key || 'parse_error', ...FALLBACK }
  // 没登记的错误码也可能自带一句可读的原始说明：只在不是纯英文/代码味时用它当提示
  const raw = String(text ?? '').trim()
  if (raw && !/^[A-Z_]+$/.test(raw) && /[\u4e00-\u9fa5]/.test(raw)) fallback.hint = `${raw}（原件保留，可重试或手工录入。）`
  return fallback
}

/** 表格里只有一格位置：只给一个短标签，细节留在失败卡片里。 */
export function faultLabel(code, text = '') {
  return parseFault(code, text).label
}
