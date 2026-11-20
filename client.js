/**
 * dsh-qq-attach client half: the conversation's Attach tab and the settings list.
 */
window.__ModuleLoader__.load({
  id: 'dsh-qq-attach',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState, useCallback } = React

    // Dictionaries registered through the host locale service, so every string
    // resolves through DSH i18n instead of a private switch. English is the
    // fallback; the injected agent prompt stays English on purpose.
    const en = {
      tab: 'QQ attach',
      nav: 'QQ attach',
      chat: 'Chat',
      select: 'Select a chat',
      manual: 'Manual openid',
      bind: 'Attach',
      detach: 'Detach',
      attachedTo: 'Attached to another session',
      attachedToActive: 'attached to an active session',
      attachedToArchived: 'attached to an archived session',
      attachBusy: 'is already attached to an active session. Attaching it here detaches that session.',
      attachAnyway: 'Attach anyway',
      cancel: 'Cancel',
      autoReply: 'Forward replies',
      streaming: 'Streaming (direct chat only)',
      toolResults: 'Forward tool results',
      errors: 'Forward errors',
      steer: 'Steer while running',
      queue: 'Queue until the next turn',
      bound: 'Attached to',
      none: 'No QQ chat attached',
      account: 'QQ bot',
      appId: 'AppID',
      appSecret: 'AppSecret',
      save: 'Save',
      logout: 'Unbind',
      scan: 'Scan to bind',
      refresh: 'Refresh QR code',
      waiting: 'Scan with mobile QQ',
      expired: 'QR code expired',
      boundAs: 'Bound AppID',
      noAttaches: 'No conversation is attached to QQ yet',
      open: 'Open conversation',
      error: 'Action failed',
      rootOnly: 'Only a root session can attach to QQ; subagent sessions cannot.',
      prompt: 'Prompt',
      promptHint: 'Injected while automatic replies are off, telling the agent what must be sent with qq_send. Save an empty value to restore the default.',
      resetDefault: 'Reset to default',
      log: 'QQ log',
      logClear: 'Clear',
      logEmpty: 'No QQ traffic yet',
      settingsNote: 'Set these before the conversation starts. Changing them mid-conversation swaps the agent tools and instructions underneath a running turn, which can leave the agent contradicting itself.',
      promptSaved: 'Saved',
      promptRestored: 'Restored the default prompt',
      promptCustom: 'Custom for this session',
      promptDefault: 'Using the default prompt',
    }

    const zh = {
      tab: 'QQ 绑定',
      nav: 'QQ 绑定',
      chat: '聊天',
      select: '选择聊天',
      manual: '手动填写 openid',
      bind: '绑定',
      detach: '解绑',
      attachedTo: '已绑定到其他会话',
      attachedToActive: '已挂载到活跃会话',
      attachedToArchived: '已挂载到已归档会话',
      attachBusy: '已挂载到一个活跃会话。在此挂载会将该会话解挂。',
      attachAnyway: '仍要挂载',
      cancel: '取消',
      autoReply: '自动转发回复',
      streaming: '流式输出（仅私聊）',
      toolResults: '转发工具结果',
      errors: '转发错误',
      steer: '运行中收到消息时插话',
      queue: '排队到下一轮',
      bound: '当前绑定',
      none: '尚未绑定 QQ 聊天',
      account: 'QQ 机器人',
      appId: 'AppID',
      appSecret: 'AppSecret',
      save: '保存',
      logout: '解除绑定',
      scan: '扫码绑定',
      refresh: '刷新二维码',
      waiting: '用手机 QQ 扫码',
      expired: '二维码已过期',
      boundAs: '已绑定 AppID',
      noAttaches: '还没有任何会话绑定到 QQ',
      open: '打开会话',
      error: '操作失败',
      rootOnly: '只有根会话可以绑定 QQ；子代理会话不能绑定。',
      prompt: '提示词',
      promptHint: '自动转发关闭时注入给会话的提示词，用来告诉 agent 哪些内容必须通过 qq_send 发出。留空并保存即恢复默认。',
      resetDefault: '恢复默认',
      log: 'QQ 日志',
      logClear: '清空',
      logEmpty: '还没有 QQ 收发记录',
      settingsNote: '建议在开始对话前设定好这些开关。对话中途更改会在运行中的回合里替换 agent 的工具与提示词，容易让它前后矛盾。',
      promptSaved: '已保存',
      promptRestored: '已恢复默认提示词',
      promptCustom: '本会话使用自定义',
      promptDefault: '当前使用默认提示词',
    }

    const styles = {
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '18px',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
        lineHeight: '20px',
      },
      row: { display: 'flex', alignItems: 'center', gap: '10px' },
      label: { flex: '1', minWidth: '0' },
      input: {
        flex: '1',
        minWidth: '0',
        padding: '6px 10px',
        borderRadius: '6px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-module-platform)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
      },
      button: {
        padding: '6px 12px',
        borderRadius: '6px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-module-platform)',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        font: 'inherit',
      },
      primary: { background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)', border: 'none' },
      muted: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' },
      error: { color: 'var(--dsw-alias-state-error-primary, #d33)', fontSize: '12px' },
      divider: { height: '0.5px', background: 'var(--dsw-alias-border-l2)' },
      listRow: {
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        padding: '10px 0',
        cursor: 'pointer',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
      },
    }

    /**
     * Render failures inside a slot would otherwise blank the whole panel, which is
     * indistinguishable from "no content". Surface the message instead.
     */
    class SectionBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        try { console.error('qq-attach: slot render failed', error) } catch {}
      }

      render() {
        if (this.state.error) {
          return h('div', { style: { padding: '8px 0', color: '#d33', fontSize: '12px' } },
            `QQ attach failed to render: ${this.state.error.message ?? String(this.state.error)}`)
        }
        return this.props.children
      }
    }

    /**
     * `sessionQuery.readTitle` returns the title record, not its text; rendering the
     * record itself throws React #31 (objects are not valid children).
     */
    function titleText(item) {
      const title = item?.title
      if (typeof title === 'string') return title
      if (typeof title?.title === 'string' && title.title) return title.title
      return item?.sessionId ?? ''
    }

    /** One inline option: no flex fill, so several can share a wrapping row. */
    function checkbox(label, checked, onChange) {
      return h('label', {
        style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' },
      },
        h('input', { type: 'checkbox', checked: Boolean(checked), onChange: event => onChange(event.target.checked) }),
        h('span', null, label))
    }

    function AttachTab(injected) {
      const { sessionId, call, t, useSession } = injected
      const session = useSession ? useSession(snapshot => snapshot) : undefined
      const [state, setState] = useState({ loading: true, attach: null })
      const [chats, setChats] = useState([])
      const [manual, setManual] = useState('')
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [draft, setDraft] = useState(undefined)
      const [feedback, setFeedback] = useState(null)
      const [focused, setFocused] = useState(false)
      const [logLines, setLogLines] = useState([])
      const [pendingSteal, setPendingSteal] = useState(null)

      const notify = (message) => setFeedback({ message, at: Date.now() })

      // A draft belongs to one session; switching conversations must not carry it over.
      useEffect(() => {
        setDraft(undefined)
        setFeedback(null)
        setFocused(false)
        setPendingSteal(null)
      }, [sessionId])

      const refresh = useCallback(async () => {
        const [attach, list] = await Promise.all([
          call('attach.get', { sessionId }),
          call('chats.list'),
        ])
        setState({ loading: false, attach })
        setChats(list)
      }, [sessionId])

      useEffect(() => { refresh().catch(err => setError(err.message)) }, [refresh])

      const mutate = async (endpoint, payload) => {
        setBusy(true)
        setError(null)
        try { await call(endpoint, payload); await refresh(); return true }
        catch (err) { setError(err.message); return false }
        finally { setBusy(false) }
      }

      const savePrompt = async (defaultPrompt) => {
        const next = String(draft ?? '').trim()
        const fallback = String(defaultPrompt ?? '').trim()
        // An emptied editor means "go back to the default" rather than a silent no-op.
        if (!next) { await resetPrompt(); return }
        // Storing the default verbatim is the same as having no override, and keeps
        // the session following later changes to the default text.
        const stored = next === fallback ? '' : next
        if (!await mutate('attach.update', { sessionId, patch: { prompt: stored } })) return
        setDraft(undefined)
        notify(t(stored ? 'promptSaved' : 'promptRestored'))
      }

      const resetPrompt = async () => {
        if (!await mutate('attach.update', { sessionId, patch: { prompt: '' } })) return
        setDraft(undefined)
        notify(t('promptRestored'))
      }

      // Poll the host's QQ traffic log while this session is attached.
      const attachedTarget = state.attach?.target
      useEffect(() => {
        if (attachedTarget === undefined) { setLogLines([]); return }
        let cancelled = false
        const load = () => {
          call('log.list', { sessionId })
            .then(lines => { if (!cancelled) setLogLines(lines) })
            .catch(() => {})
        }
        load()
        const timer = setInterval(load, 2000)
        return () => { cancelled = true; clearInterval(timer) }
      }, [sessionId, attachedTarget])

      const clearLog = async () => {
        try { await call('log.clear', { sessionId }); setLogLines([]) } catch {}
      }

      useEffect(() => {
        if (feedback === null) return
        const timer = setTimeout(() => setFeedback(null), 2500)
        return () => clearTimeout(timer)
      }, [feedback?.at])

      if (state.loading) return h('div', { style: styles.card }, '…')
      if (session?.subagent) return h('div', { style: styles.card }, t('rootOnly'))

      const attach = state.attach
      if (!attach) {
        const options = chats.map(chat => h('option', {
          key: chat.target,
          value: chat.target,
        }, `${chat.target}${chat.attachedTo && chat.attachedTo !== sessionId
            ? ` — ${chat.archived ? t('attachedToArchived') : t('attachedToActive')}`
            : ''}`))

        const bind = async () => {
          const target = manual.trim()
          if (!target) return
          const holder = chats.find(chat => chat.target === target && chat.attachedTo && chat.attachedTo !== sessionId)
          // Only an active holder needs a second confirmation; an archived one is inert.
          if (holder && !holder.archived) { setPendingSteal(holder); return }
          await mutate('attach.set', { sessionId, target, steal: Boolean(holder) })
        }
        return h('div', { style: styles.card },
          h('div', { style: { fontWeight: 600 } }, t('none')),
          h('div', { style: styles.row },
            h('select', {
              style: styles.input,
              defaultValue: '',
              onChange: event => { if (event.target.value) { setManual(event.target.value); setPendingSteal(null) } },
            }, h('option', { value: '' }, t('select')), ...options)),
          h('div', { style: styles.row },
            h('input', {
              style: styles.input,
              placeholder: 'c2c:<openid> / group:<openid>',
              value: manual,
              onChange: event => { setManual(event.target.value); setPendingSteal(null) },
            }),
            h('button', {
              style: { ...styles.button, ...styles.primary },
              disabled: busy || !manual.trim() || pendingSteal !== null,
              onClick: bind,
            }, t('bind'))),
          pendingSteal === null
            ? null
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                h('div', { style: styles.muted }, `${pendingSteal.target} ${t('attachBusy')}`),
                h('div', { style: styles.row },
                  h('button', {
                    style: { ...styles.button, ...styles.primary },
                    disabled: busy,
                    onClick: async () => {
                      const target = pendingSteal.target
                      setPendingSteal(null)
                      await mutate('attach.set', { sessionId, target, steal: true })
                    },
                  }, t('attachAnyway')),
                  h('button', { style: styles.button, onClick: () => setPendingSteal(null) }, t('cancel')))),
          error ? h('div', { style: styles.error }, error) : null)
      }

      const effective = attach.prompt || String(attach.defaultPrompt ?? '')
      const dirty = draft !== undefined && draft.trim() !== String(effective).trim()

      const settingsCard = h('div', { style: { ...styles.card, flex: '1 1 320px', minWidth: 0 } },
        h('div', { style: styles.row },
          h('span', { style: styles.muted }, t('bound')),
          h('strong', { style: styles.label }, attach.target),
          h('button', {
            style: styles.button,
            disabled: busy,
            onClick: () => mutate('attach.remove', { sessionId }),
          }, t('detach'))),
        h('div', { style: styles.divider }),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '18px', rowGap: '8px' } },
          checkbox(t('autoReply'), attach.autoReply, value => mutate('attach.update', { sessionId, patch: { autoReply: value } })),
          checkbox(t('streaming'), attach.streaming, value => mutate('attach.update', { sessionId, patch: { streaming: value } })),
          checkbox(t('toolResults'), attach.toolResults, value => mutate('attach.update', { sessionId, patch: { toolResults: value } })),
          checkbox(t('errors'), attach.errors, value => mutate('attach.update', { sessionId, patch: { errors: value } })),
          checkbox(attach.steer ? t('steer') : t('queue'), attach.steer, value => mutate('attach.update', { sessionId, patch: { steer: value } }))),
        h('div', { style: styles.muted }, t('settingsNote')),
        h('div', { style: styles.divider }),
        h('div', { style: styles.row },
          h('span', { style: { fontWeight: 600 } }, t('prompt')),
          h('span', { style: styles.muted }, attach.prompt ? t('promptCustom') : t('promptDefault'))),
        h('div', { style: styles.muted }, t('promptHint')),
        h('textarea', {
          style: { ...styles.input, minHeight: '110px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
          value: draft === undefined ? (attach.prompt || attach.defaultPrompt) : draft,
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
          onChange: event => { setDraft(event.target.value); setFeedback(null) },
        }),
        // Keep the editor quiet: actions appear while editing, while unsaved changes
        // exist, or while a result is still being reported.
        focused || dirty || feedback
          ? h('div', {
              style: styles.row,
              // Without this the textarea blurs first, the row unmounts, and the
              // click never lands — reset looked dead in its most common state.
              onMouseDown: event => event.preventDefault(),
            },
              h('button', {
                style: { ...styles.button, ...styles.primary },
                disabled: busy || !dirty,
                onClick: () => savePrompt(attach.defaultPrompt),
              }, t('save')),
              h('button', {
                style: styles.button,
                disabled: busy,
                onClick: resetPrompt,
              }, t('resetDefault')),
              feedback ? h('span', { style: { ...styles.muted, fontWeight: 600 } }, `✓ ${feedback.message}`) : null)
          : null,
        error ? h('div', { style: styles.error }, error) : null)

      const logCard = h('div', { style: { ...styles.card, flex: '1 1 380px', minWidth: 0 } },
        h('div', { style: styles.row },
          h('span', { style: { fontWeight: 600 } }, t('log')),
          h('span', { style: styles.label }),
          h('button', { style: styles.button, disabled: busy, onClick: clearLog }, t('logClear'))),
        h('div', {
          style: {
            maxHeight: '420px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11px',
            lineHeight: 1.45,
          },
        },
          logLines.length === 0
            ? h('div', { style: styles.muted }, t('logEmpty'))
            : logLines.map((line, index) => h('div', {
                key: `${line.at}-${index}`,
                title: line.detail === undefined
                  ? line.text
                  : `${line.text}\n\n${JSON.stringify(line.detail, null, 2)}`.slice(0, 2000),
                style: { display: 'flex', gap: '6px', alignItems: 'baseline' },
              },
                h('span', { style: { color: 'var(--dsw-alias-label-tertiary)', flex: 'none' } },
                  new Date(line.at).toLocaleTimeString()),
                h('span', { style: { flex: 'none', width: '10px', color: 'var(--dsw-alias-label-secondary)' } },
                  line.dir === 'in' ? '←' : line.dir === 'out' ? '→' : '·'),
                h('span', { style: { wordBreak: 'break-word' } }, `${line.event}: ${line.text}`)))))

      return h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' } },
        settingsCard,
        logCard)
    }

    function SettingsSection(injected) {
      const { call, t, openAttach, close } = injected
      const [status, setStatus] = useState(null)
      const [bind, setBind] = useState(/** @type {BindState} */ ({ phase: 'idle' }))
      const [list, setList] = useState([])
      const [appId, setAppId] = useState('')
      const [appSecret, setAppSecret] = useState('')
      const [error, setError] = useState(null)

      const refresh = useCallback(async () => {
        const [nextStatus, attaches] = await Promise.all([call('status'), call('attach.list')])
        setStatus(nextStatus)
        setList(attaches)
      }, [])

      useEffect(() => { refresh().catch(err => setError(err.message)) }, [refresh])

      useEffect(() => {
        call('bind.state').then(next => { if (next && next.phase !== 'idle') setBind(next) }).catch(() => {})
      }, [])

      useEffect(() => {
        if (bind.phase !== 'waiting' && bind.phase !== 'saving' && bind.phase !== 'starting') return
        const timer = setInterval(() => {
          call('bind.state').then(next => {
            setBind(next)
            if (next.phase === 'done') refresh()
          }).catch(() => {})
        }, 1500)
        return () => clearInterval(timer)
      }, [bind.phase, refresh])

      const startBind = async () => {
        setError(null)
        try {
          const next = await call('bind.start')
          setBind(next)
        } catch (err) { setError(err.message) }
      }

      const saveManual = async () => {
        setError(null)
        try {
          await call('account.set', { appId: appId.trim(), appSecret: appSecret.trim() })
          setAppSecret('')
          await refresh()
        } catch (err) { setError(err.message) }
      }

      const unbind = async () => {
        setError(null)
        try { await call('account.clear'); await refresh() }
        catch (err) { setError(err.message) }
      }

      const account = h('div', { style: styles.card },
        h('div', { style: { fontWeight: 600 } }, t('account')),
        status?.bound
          ? h('div', { style: styles.row },
              h('span', { style: styles.muted }, t('boundAs')),
              h('span', { style: styles.label }, status.appId ?? ''),
              h('button', { style: styles.button, onClick: unbind }, t('logout')))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
              bind.phase === 'waiting'
                ? h('div', { style: { ...styles.row, alignItems: 'flex-start' } },
                    bind.qrSvg ? h('img', { src: bind.qrSvg, width: 240, height: 240, alt: 'QR', style: { background: '#fff', borderRadius: '8px' } }) : null,
                    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', flex: '1' } },
                      h('span', { style: styles.muted }, t('waiting')),
                      bind.url ? h('a', { href: bind.url, target: '_blank', rel: 'noreferrer', style: { fontSize: '12px', overflowWrap: 'anywhere' } }, bind.url) : null,
                      h('button', { style: styles.button, onClick: startBind }, t('refresh'))))
                : h('button', { style: { ...styles.button, alignSelf: 'flex-start' }, onClick: startBind },
                    bind.phase === 'failed' ? `${t('expired')} — ${bind.reason ?? ''}` : t('scan')),
              h('div', { style: styles.row },
                h('input', { style: styles.input, placeholder: t('appId'), value: appId, onChange: event => setAppId(event.target.value) }),
                h('input', { style: styles.input, placeholder: t('appSecret'), type: 'password', value: appSecret, onChange: event => setAppSecret(event.target.value) }),
                h('button', {
                  style: { ...styles.button, ...styles.primary },
                  disabled: !appId.trim() || !appSecret.trim(),
                  onClick: saveManual,
                }, t('save'))),
              bind.phase === 'saving' ? h('div', { style: styles.muted }, '…') : null),
        error ? h('div', { style: styles.error }, error) : null)

      const attaches = h('div', { style: styles.card },
        h('div', { style: { fontWeight: 600 } }, t('nav')),
        list.length === 0
          ? h('div', { style: styles.muted }, t('noAttaches'))
          : list.map(item => h('div', {
              key: item.target,
              style: styles.listRow,
              onClick: () => { openAttach(item.sessionId); try { close?.() } catch {} },
            },
              h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1', minWidth: 0 } },
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  titleText(item)),
                h('span', { style: styles.muted }, item.target)),
              h('span', { style: styles.muted }, t('open')))))

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' } }, account, attaches)
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('qq-attach', { en, zh }), 'qq-attach: dictionaries')
        const t = ctx.locale.bind('qq-attach')
        const call = async (endpoint, payload) => {
          const response = await fetch(`/qq-attach/${endpoint}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload ?? {}),
          })
          const body = await response.json()
          if (!body?.ok) throw new Error(body?.error?.message ?? 'request failed')
          return body.value
        }
        const openAttach = (sessionId) => {
          try { ctx.uiWorkspace.openSession(sessionId) } catch {}
          let attempts = 0
          const activate = () => {
            try {
              const binding = ctx.uiConversation?.binding?.(sessionId)
              if (binding) { binding.activate('qq-attach'); return }
            } catch {}
            if (attempts++ < 20) setTimeout(activate, 150)
          }
          setTimeout(activate, 50)
        }

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'qq-attach',
          order: 30,
          label: () => t('tab'),
          locale: 'qq-attach',
          inject: (sessionId) => ({ sessionId, call, t }),
        }, props => h(SectionBoundary, null, h(AttachTab, props))))

        // Render inside this bundle's own page under Settings > Plugins, the same
        // slot the ACP adapter uses for its connection settings. `key` is the
        // bundle's package name.
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: 'dsh-qq-attach',
          locale: 'qq-attach',
          inject: () => ({ call, t, openAttach }),
        }, props => h(SectionBoundary, null, h(SettingsSection, props))))
      },
    }
  },
})
