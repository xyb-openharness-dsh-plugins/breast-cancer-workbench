/* 面板布局参数（D21 → D34 定 A「标准分栏 0.65」；2026-10-18 用户定：业务左、原生 Agent 右）。
 *
 * 这里是 DSH 面板合同的唯一入参来源：M5 的客户端 register 与界面判定都读它，
 * 不在别处再写一份 0.65。依据与实测见 docs/UI-DESIGN.md §5.6、docs/RELEASE.md §2.3。
 *
 * businessSide='left'：原生会话面板固定出现在业务区**右侧**（宿主把它放在业务区对侧），
 * 与门店选址（dsh-site-selection）的 `layout:{businessSide:'left',businessWidth:0.65}` 同款。
 * 面板的开合与拖宽是宿主原生能力，工作台不自建 splitter。
 *
 * 为什么不用 customFrame（B）：B 要自己实现首次进入与无会话态，还要避让窗口按钮；
 * 实测 34 个视图在 65% 分栏等效宽度下没有页面级横向溢出，只余一处「六列表卡」需要整行，
 * 用一个 CSS 规则就能解决，不值得为它换整页框架。
 */

/** 宿主面板参数（写进客户端 register / dsh 清单时逐字使用） */
export const PANEL = Object.freeze({
  businessSide: 'left',
  businessWidth: 0.65,
  customFrame: false,
});

/** 宿主允许的 businessWidth 区间（超出即被宿主拒或触发警告） */
export const HOST_LIMITS = Object.freeze({ min: 0.25, max: 0.7 });

/** 六列测量表（日期 / 腕横纹 / 前臂中段 / 肘上 10cm / 腋下 10cm / 最大差）的 min-content 宽度。
 *  936 视口（1440 的 65%）实测 417px；卡宽小于此值时表格只能横向滚动，必须改为整行跨列。 */
export const MEASURE_TABLE_MIN_PX = 417;

/** 业务区像素宽度：宿主给的比例 × 窗口宽度 */
export function businessPanePx(windowWidth, width = PANEL.businessWidth) {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) throw new TypeError('windowWidth 必须是正数');
  return Math.round(windowWidth * width);
}

/** 该卡宽是否放不下六列表（放不下 → 走整行跨列，不允许默认横向滚动） */
export function needsFullRowCard(cardPx) {
  if (!Number.isFinite(cardPx)) throw new TypeError('cardPx 必须是数字');
  return cardPx < MEASURE_TABLE_MIN_PX;
}

/** 自检：返回问题清单，空数组表示合法。参数可注入，便于单测覆盖越界情形。 */
export function assertPanelConfig(config = PANEL) {
  const problems = [];
  if (!['left', 'right'].includes(config.businessSide)) problems.push(`businessSide 只能是 left/right，当前 ${config.businessSide}`);
  if (config.customFrame !== false) problems.push('D21 已定 A：customFrame 必须为 false');
  const w = config.businessWidth;
  if (!(typeof w === 'number' && w >= HOST_LIMITS.min && w <= HOST_LIMITS.max)) {
    problems.push(`businessWidth 必须在 ${HOST_LIMITS.min}–${HOST_LIMITS.max} 之间，当前 ${w}`);
  }
  if (w === HOST_LIMITS.max) problems.push('businessWidth 取上限 0.7 属于"把报表塞进分栏"，本项目不这么做');
  return problems;
}
