/* 客户端入口源码。
 *
 * **不要直接改 lib/client.js**：那是 `npm run build:client` 从本文件生成的产物。
 * 官方要求客户端必须是「已构建好的单文件」，Desktop 不会替我们打包（workbench-standard §3.5），
 * 所以这里用一个零依赖的字符串替换把下面的常量注入进去：
 * 包名与仓库取自 package.json，面板参数取自 lib/layout.js，接口前缀取自 lib/identity.js。
 * 参数仍然只有一份来源，换成生成而不是手抄，是为了避免两边漂移。
 *
 * 会话集成（2026-10-18，对齐 Desktop 1.2.2 与 dsh-site-selection 的官方写法）：
 * - `desktopWorkbenches.ensureSession({ folder })` 请求 Desktop 建立并打开原生会话；
 *   按钮只负责"调起"，关闭与拖宽用宿主原生面板自带的能力，不自建 splitter。
 * - 开场白走 `sessions.scope(id).get('conversation').input` 填进**原生草稿**，
 *   不自动发送；composer 没就绪就轮询重试，草稿请求在 localStorage 里持久化。
 * - 拿不到宿主服务时全部降级为提示，不猜第二个入口。
 */

;(function () {
  // 没有模块加载器就静静退出：这个文件也可能被静态检查脚本扫到，不该在那时抛错。
  if (typeof window === 'undefined' || typeof window.__ModuleLoader__?.load !== 'function') return

  window.__ModuleLoader__.load({
    id: '__PKG_NAME__',
    factory: (require) => {
      const React = require('react')
      const h = React.createElement

      const REPOSITORY = '__REPOSITORY__'
      const UI_ENTRY = '__UI_ENTRY__'
      const VERSION = '__VERSION__'
      const TITLE = '小粉宝'
      const PANEL_TITLE = '小粉宝工作台'
      const SUBTITLE = '本机数据 · 记录不是诊断'
      const DESCRIPTION = '把散落的检查、用药与康复记录整理成可核对、可回溯的资料，并整理成就诊时能带着走的问题清单。'
      const API_PREFIX = UI_ENTRY.replace(/\/ui\/?$/, '')

      const rootStyle = {
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        background: '#fdf7f8', fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      }
      const barStyle = {
        display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto',
        padding: '6px 12px', borderBottom: '1px solid #f0dde3', background: '#fbf1f4', fontSize: 12,
      }
      const frameStyle = { flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, display: 'block' }
      const fallbackStyle = { padding: 24, color: '#4a3b41', fontSize: 14, lineHeight: 1.7 }
      const buttonStyle = {
        border: 0, borderRadius: 999, padding: '5px 14px',
        background: '#d9698a', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer',
      }
      const ghostStyle = { ...buttonStyle, background: 'transparent', color: '#a4506b', border: '1px solid #e8c4d0' }

      function Fallback({ onRetry }) {
        return h('div', { style: fallbackStyle },
          h('p', null, `页面没能加载（v${VERSION} · ${UI_ENTRY}）。常见原因是 Harness 刚重启、插件还没加载完。`),
          h('p', null, '本工作台的数据只存在你选择的本机目录里，不会因为这个提示丢失。'),
          h('button', { type: 'button', style: buttonStyle, onClick: onRetry }, '重新加载'),
        )
      }

      /* ---------------- 会话判定（官方 dsh-site-selection 同款） ---------------- */

      let bridge = null
      function currentSession() {
        const service = bridge?.desktopWorkbenches
        if (typeof service?.currentSession === 'function') return service.currentSession() || null
        const snapshot = bridge?.sessions?.list?.getSnapshot?.()
        return snapshot?.current || Object.keys(snapshot?.byId || {}).find((id) =>
          (snapshot.byId[id]?.retainedBy?.mainView ?? 0) > 0) || null
      }
      function workbenchIsActive() {
        const service = bridge?.desktopWorkbenches
        if (typeof service?.isActive === 'function') return service.isActive()
        return false // 拿不到服务就不假装激活
      }
      function workbenchOwnsSession(sessionId) {
        if (!sessionId) return false
        const service = bridge?.desktopWorkbenches
        if (typeof service?.ownsSession === 'function') return service.ownsSession(sessionId)
        return false
      }
      function ownedSession() {
        const id = currentSession()
        return workbenchOwnsSession(id) ? id : null
      }

      /* ---------------- 原生草稿：只填入，不发送 ---------------- */

      function fillDraft(sessionId, prompt) {
        if (!sessionId || ownedSession() !== sessionId) throw new Error('会话已切换，请回到本工作台再操作')
        const actx = bridge.sessions.scope?.(sessionId)
        const conversation = actx?.get?.('conversation')
        if (!conversation) throw new Error('对话输入不可用')
        const input = conversation.input.for(actx)
        const snapshot = input.state.getSnapshot()
        if (snapshot.occurrences?.length || (snapshot.phase && snapshot.phase !== 'plain')) {
          throw new Error('当前草稿含引用或特殊输入，请先在原生会话里处理，再交给小粉宝')
        }
        const current = snapshot.draft || ''
        input.setDraft(current.trim() ? `${current}\n\n${prompt}` : prompt)
      }

      const DRAFT_QUEUE_KEY = 'pinkypal.breast.initial-drafts.v1'
      let pendingDraft = null // { sessionId, prompt }
      try {
        const saved = JSON.parse(localStorage.getItem(DRAFT_QUEUE_KEY) || 'null')
        if (saved?.sessionId && saved?.prompt) pendingDraft = saved
      } catch { /* 隐私模式忽略 */ }
      function rememberDraft(entry) {
        pendingDraft = entry
        try {
          if (entry) localStorage.setItem(DRAFT_QUEUE_KEY, JSON.stringify(entry))
          else localStorage.removeItem(DRAFT_QUEUE_KEY)
        } catch { /* 隐私模式忽略 */ }
      }
      function flushDraft() {
        if (!pendingDraft) return false
        try {
          fillDraft(pendingDraft.sessionId, pendingDraft.prompt)
          rememberDraft(null)
          return true
        } catch { return false // composer 未就绪就留给下一轮
        }
      }

      function onboardingPrompt(dir) {
        return [
          '你正在协助我使用「小粉宝乳腺癌工作台」。它只做本机资料整理，不提供诊疗建议。',
          `资料目录：${dir || '（首次打开时在面板里选择）'}`,
          '里面是我的检查报告、四点位臂围记录、治疗安排与就诊问题清单。',
          '分工：你帮我汇总、找缺漏、把报告里的指标和日期整理成对照表；判断和决定由我和治疗团队做。',
          '我标记的"看法"是我自己的担心或判断，不是医生结论；2cm 只是参考关注线。',
        ].join('\n')
      }

      /* ---------------- 面板 ---------------- */

      function Panel() {
        const [generation, setGeneration] = React.useState(0)
        const [broken, setBroken] = React.useState(false)
        const [note, setNote] = React.useState('')
        const brokenTimer = React.useRef(null)

        // 8 秒内没有 onLoad 就当作没起来：宁可给一个能重试的提示，也不留一块白板。
        // onLoad 成功后必须清掉这个定时器——否则页面加载完 8 秒后整个面板被换成
        // 兜底页，正在用的弹窗会凭空消失（0.5.1 真机实测踩过）。
        React.useEffect(() => {
          setBroken(false)
          brokenTimer.current = setTimeout(() => setBroken(true), 8000)
          return () => clearTimeout(brokenTimer.current)
        }, [generation])

        // 挂载后开始消化未送达的开场白（composer 就绪一轮一次），并订阅会话变化。
        React.useEffect(() => {
          const timer = setInterval(() => { if (flushDraft()) setNote('开场白已填入会话草稿，按回车发送') }, 500)
          const unsubscribe = bridge?.desktopWorkbenches?.subscribe?.(() => setNote(''))
          return () => { clearInterval(timer); unsubscribe?.() }
        }, [])

        async function openAgent() {
          setNote('')
          try {
            const service = bridge?.desktopWorkbenches
            if (typeof service?.ensureSession !== 'function') {
              setNote('当前 Desktop 版本不支持从面板调起会话；请在右侧会话区直接开始对话')
              return
            }
            let dir = null
            try {
              const res = await fetch(`${API_PREFIX}/api/health`)
              dir = (await res.json())?.dir || null
            } catch { /* 拿不到目录也照样调起 */ }
            const id = await service.ensureSession({ folder: dir })
            if (!ownedSession()) { setNote('会话已创建，等面板就绪后填入开场白') }
            rememberDraft({ sessionId: id, prompt: onboardingPrompt(dir) })
            flushDraft()
            setNote('开场白已填入会话草稿，按回车发送')
          } catch (error) {
            setNote(`没能调起会话：${error?.message ?? error}`)
          }
        }

        if (broken) return h(Fallback, { onRetry: () => setGeneration((n) => n + 1) })

        return h('div', { style: rootStyle },
          h('div', { style: barStyle },
            h('button', { type: 'button', style: buttonStyle, onClick: openAgent }, 'AI 协助'),
            h('span', { style: { color: '#8a6b76' } },
              '调起右侧原生会话并把开场白填进草稿（不自动发送）。'),
            note && h('span', { style: { color: '#a4506b', fontWeight: 600 } }, note),
          ),
          h('iframe', {
            key: generation,
            src: UI_ENTRY,
            title: `${TITLE} · ${SUBTITLE}`,
            style: frameStyle,
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
            onLoad: () => { setBroken(false); clearTimeout(brokenTimer.current) },
          }),
        )
      }

      function apply(ctx) {
        bridge = ctx
        ctx.effect(() => ctx.desktopWorkbenches.register({
          title: TITLE,
          panelTitle: PANEL_TITLE,
          icon: '🎀',
          repository: REPOSITORY,
          description: DESCRIPTION,
          audience: '乳腺癌术后恢复期的患者与照护者',
          requirements: '本机数据整理；不做诊断与处置建议，判断由用户与治疗团队做出。',
          initialization: 'empty',
          embedded: true,
          version: VERSION,
          author: 'PinkyPal 社区贡献者',
          // 下面三个值由 scripts/build-client.mjs 从 lib/layout.js 注入，不在这里手写第二份
          layout: { businessSide: '__BUSINESS_SIDE__', businessWidth: __BUSINESS_WIDTH__ },
          customFrame: __CUSTOM_FRAME__,
        }, Panel))
      }

      return { apply, inject: ['desktopWorkbenches', 'sessions'] }
    },
  })
})()
