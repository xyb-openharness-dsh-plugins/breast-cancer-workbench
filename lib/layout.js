/* 面板布局参数。
 *
 * 这里是 DSH 面板合同的唯一入参来源：M5 的客户端 register、构建注入与包级检查都读它，
 * 不在别处再写一个 0.65 / 0.35。依据与使用状态见 docs/AGENT-PANE-DESIGN.md。
 *
 * ## 为什么从「标准分栏」改成 customFrame（2026-10-19）
 *
 * 标准分栏（customFrame=false）下，宿主 `packages/dsh-desktop-workbenches/client.js`
 * 只把 `--workbench-business-width` 写成注册时的静态值：
 *
 *   h('div', { className:'dshWbBody', hidden: customFrame,
 *     style: { '--workbench-business-width': `${entry.layout.businessWidth * 100}%` } })
 *
 * 服务本身只暴露 register/isActive/ownsSession/add/open/home/ensureSession/currentSession/
 * subscribe，**没有**拖宽或关闭面板的编程接口——所以「AI 对话面板不能拖、不能关」不是
 * 我们没接，而是那条路上根本不存在这个能力。
 *
 * customFrame=true 时宿主改走另一条分支（同文件第 2000 行）：
 *
 *   h(item.Component, { service, entry, active,
 *     conversation: <原生会话挂载点> })
 *
 * 原生会话节点作为 `conversation` prop 交给我们排版，于是 splitter 拖动、键盘调整、
 * 收起/重开、宽度记忆都由工作台自己实现——这正是用户对「AI 对话框可调」的要求。
 *
 * 代价（官方 §4 / §6 要求，已在实现里逐条处理）：
 * 1. 无会话态要自己引导（宿主不再给 .dshWbInit 引导）；
 * 2. macOS 收起侧栏时窗口按钮占左上角：根节点首个子元素必须是语义 `<header>`，
 *    并用 `--dsh-frame-leading-clearance` 避让；
 * 3. 一切布局、弹层、拖拽都必须留在宿主分配的主内容区内。
 *
 * 业务区宽度不再由宿主分栏决定，而由 AGENT_PANE 反推：默认会话占 35%（业务 65%），
 * 与 starter `docs/20-AGENT-PANE-DESIGN.md` 的"默认 35%、可拖 25%–45%"一致，
 * 也因此沿用 M5 阶段"34 视图在 65% 业务宽度下无横向溢出"的实测结论。
 */

/**
 * 宿主面板参数（写进客户端 register / dsh 清单时逐字使用）。
 * customFrame 下 businessSide/businessWidth 不再驱动宿主分栏，但注册时仍会被宿主
 * 校验（businessSide ∈ left/right，businessWidth ∈ 0.25–0.7），所以保留合法值：
 * businessWidth 记的是**默认业务区宽度**，与 AGENT_PANE.default 互补。
 */
export const PANEL = Object.freeze({
  businessSide: 'left',
  businessWidth: 0.65,
  customFrame: true,
});

/** 宿主允许的 businessWidth 区间（源码 client.js:735 强校验，越界直接抛错） */
export const HOST_LIMITS = Object.freeze({ min: 0.25, max: 0.7 });

/**
 * AI 会话面板宽度（customFrame 下由我们实现拖动，宿主不参与）。
 * 取 starter 20-AGENT-PANE-DESIGN 的基线：默认 35%，可拖 25%–45%；
 * 窄屏（容器 < 760px）改为覆盖式抽屉，不再用这个比例。
 */
export const AGENT_PANE = Object.freeze({
  default: 0.35,
  min: 0.25,
  max: 0.45,
  /** 步进：键盘一次 2%，与拖动精度一致，便于键盘与鼠标得到同一组取值 */
  step: 0.02,
  /** 容器宽度低于此值时，面板改为覆盖式抽屉（合同：620–760 顶栏换行、更窄降级） */
  narrowBelowPx: 760,
  /** 覆盖式抽屉宽度上限（px） */
  drawerMaxPx: 420,
});

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

/** 把任意输入夹到 AGENT_PANE 的允许区间内；非法输入（NaN 等）回落到默认值。 */
export function clampAgentWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return AGENT_PANE.default;
  return Math.min(AGENT_PANE.max, Math.max(AGENT_PANE.min, n));
}

/**
 * 自检：返回问题清单，空数组表示合法。参数可注入，便于单测覆盖越界情形。
 * customFrame 之后宿主仍校验 layout，所以两类参数一起查。
 */
export function assertPanelConfig(config = PANEL, agent = AGENT_PANE) {
  const problems = [];
  if (!['left', 'right'].includes(config.businessSide)) problems.push(`businessSide 只能是 left/right，当前 ${config.businessSide}`);
  if (config.customFrame !== true) problems.push('面板可拖动/可收起依赖 customFrame，必须为 true');
  const w = config.businessWidth;
  if (!(typeof w === 'number' && w >= HOST_LIMITS.min && w <= HOST_LIMITS.max)) {
    problems.push(`businessWidth 必须在 ${HOST_LIMITS.min}–${HOST_LIMITS.max} 之间，当前 ${w}`);
  }
  if (w === HOST_LIMITS.max) problems.push('businessWidth 取上限 0.7 属于"把报表塞进分栏"，本项目不这么做');
  if (!(agent.min >= 0.1 && agent.max <= 0.6 && agent.min < agent.max)) {
    problems.push(`AGENT_PANE 区间不合理：${agent.min}–${agent.max}`);
  }
  if (!(agent.default >= agent.min && agent.default <= agent.max)) {
    problems.push(`AGENT_PANE.default 必须落在 ${agent.min}–${agent.max} 之间，当前 ${agent.default}`);
  }
  if (!(agent.step > 0 && agent.step <= (agent.max - agent.min) / 2)) {
    problems.push(`AGENT_PANE.step 过大或非法：${agent.step}`);
  }
  // 业务区与会话宽度互补：这条松了，默认打开的观感就会偏离 65/35 的实测基线
  if (Math.abs((1 - agent.default) - w) > 1e-9) {
    problems.push(`businessWidth(${w}) 与 AGENT_PANE.default(${agent.default}) 应互补：1 - ${agent.default} = ${1 - agent.default}`);
  }
  return problems;
}
