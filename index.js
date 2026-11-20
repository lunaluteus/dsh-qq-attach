/**
 * dsh-qq-attach host half.
 *
 * One DSH session attaches to one QQ chat. QQ input becomes user messages in
 * that session; assistant output and presented files go back; the agent gets
 * qq_send / qq_send_file only while attached.
 */
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { QQBot, historyBuffer, quoteRef, mentionGate } from '@tencent-connect/qqbot-nodejs'
import { startQrConnect } from '@tencent-connect/qqbot-connector'
import { z } from 'zod'
import { chunkText, isWithinRoot, mediaTypeOf, stripMentions, MEDIA_ROOT } from './lib/util.js'
import { downloadAttachment, sendMediaFile } from './lib/media.js'

export const name = 'qq-attach'

/** Bumped on every behavioural change; surfaced by the `status` endpoint. */
const BUILD = '0.3.4-ctx-name-fix'
export const inject = [
  'agents', 'sessions', 'sessionController', 'storageDomain', 'credentials',
  'webServer', 'systemPrompt', 'tools', 'sessionQuery', 'attachments',
]

const Attach = z.object({
  sessionId: z.string(),
  autoReply: z.boolean(),
  streaming: z.boolean(),
  toolResults: z.boolean(),
  errors: z.boolean(),
  steer: z.boolean(),
  // Optional so records written before per-session prompts still load.
  prompt: z.string().optional(),
  createdAt: z.number(),
})
const Chat = z.object({ kind: z.string(), lastSeen: z.number() })
const Account = z.object({ appId: z.string(), updatedAt: z.number() })
const Settings = z.object({ prompt: z.string() })

const SPEC = {
  name: 'qq_attach',
  version: 1,
  tables: {
    attaches: { valueSchema: Attach },
    chats: { valueSchema: Chat },
    account: { valueSchema: Account },
    settings: { valueSchema: Settings },
  },
}

/**
 * Local user message constructor: no host package import needed.
 *
 * `role` is mandatory. Session records are replayed verbatim into provider
 * request bodies, so a message stored without `role` makes every later request
 * fail with `422 INVALID_REQUEST: messages[n]: missing field 'role'`.
 */
const createUserMessage = ({ content, source }) => Object.freeze({
  id: randomUUID(),
  role: 'user',
  content: Object.freeze(content),
  source,
})

const C2C_TTL = 30 * 60 * 1000
const GROUP_TTL = 5 * 60 * 1000
const RECENT_CHATS = 10
/**
 * Default prompt injected while automatic replies are off. Overridable from the
 * settings panel, so it states the delivery rule rather than a fixed cadence:
 * anything the user must know has to travel through qq_send, while unprompted
 * work should only report occasionally.
 */
const DEFAULT_PROMPT = 'This DSH session is attached to one QQ chat, and automatic replies are OFF for it. '
  + 'Nothing you write as a normal assistant reply is delivered to the user; only the qq_send tool reaches them. '
  + 'So anything the user needs to know has to be sent with qq_send yourself. When the user asked a question or '
  + 'requested an action, always answer them there, including refusals and failures. While you work on your own, '
  + 'do not interrupt them for every step: send an occasional short progress note instead. Use qq_send_file for '
  + 'files inside the session working directory.'

export async function apply(ctx, config = {}) {
  const log = ctx.logger ?? console
  const domain = await ctx.storageDomain.open(SPEC)
  ctx.effect(() => () => { void domain.close() }, 'qq-attach: close domain')

  const attaches = domain.table('attaches')
  const chats = domain.table('chats')
  const account = domain.table('account')

  /** Prompt injected for one attached session: its own override, else the default. */
  const promptFor = (sessionId) => {
    const custom = bySession.get(sessionId)?.prompt?.trim()
    return custom ? custom : DEFAULT_PROMPT
  }

  const mediaEnabled = config.media?.enabled !== false
  const maxBytes = Math.max(1, Number(config.media?.maxMB ?? 200)) * 1024 * 1024
  const ttlHours = Math.max(0, Number(config.media?.ttlHours ?? 24))
  const maxFiles = Math.max(1, Number(config.sendFile?.maxFiles ?? 4))
  // How many buffered group messages are handed to the agent as context.
  const historyLimit = Math.max(0, Number(config.group?.historyLimit ?? 8))

  /** One entry per session id, derived from the attach table. */
  const bySession = new Map()
  const rebuild = () => {
    bySession.clear()
    for (const [target, value] of attaches.entries()) bySession.set(value.sessionId, { ...value, target })
  }
  rebuild()

  /**
   * Inbound diagnostics: whether the platform delivered a message, whether the
   * gate treated it as addressed, and whether it reached a session. Exposed by
   * the status endpoint because a dropped message leaves no other trace.
   */
  const inbound = { total: 0, group: 0, groupSkipped: 0, delivered: 0, failed: 0, last: null }

  /** Gateway state from the SDK's own ready/disconnected events. */
  const link = { connected: false, readyAt: 0, disconnectedAt: 0, reason: null }

  /** Last inbound message id per target, for the passive reply window. */
  const lastMsg = new Map()
  const toolNames = new Map()
  const streams = new Map()
  const presented = new Map()
  const runtimes = new Map()

  await mkdir(MEDIA_ROOT, { recursive: true }).catch(() => {})

  let bot
  let botTask
  let botError
  let bindState = { phase: 'idle' }
  let stopBind
  const requireQr = createRequire(import.meta.url)
  let qrLib

  const targetOf = (msg) => msg.kind === 'group'
    ? (msg.groupOpenid ? `group:${msg.groupOpenid}` : undefined)
    : `c2c:${msg.senderId}`
  const parseTarget = (target) => {
    const at = String(target || '').indexOf(':')
    if (at <= 0) return undefined
    const scope = target.slice(0, at)
    const id = target.slice(at + 1)
    if ((scope !== 'c2c' && scope !== 'group') || !id) return undefined
    return { scope, targetId: id }
  }

  const passive = (target) => {
    const parts = parseTarget(target)
    const m = lastMsg.get(target)
    if (!m) return { ...parts }
    const ttl = parts.scope === 'c2c' ? C2C_TTL : GROUP_TTL
    if (Date.now() - m.at > ttl || m.count >= 4) return { ...parts }
    m.count += 1
    return { ...parts, msgId: m.msgId }
  }
  const active = (target) => ({ ...parseTarget(target) })

  async function sendText(target, text) {
    const b = await botInstance()
    if (!b) throw new Error('QQ bot is not configured')
    for (const chunk of chunkText(text)) await b.sendMarkdown(passive(target), chunk)
  }

  // ---- credentials and bot lifecycle -------------------------------------

  async function readSecret() {
    try {
      const record = await ctx.credentials.readRecord('qq-attach')
      return record && record.kind === 'api-key' ? record.key : undefined
    } catch { return undefined }
  }

  async function botInstance() {
    if (bot) return bot
    if (botTask) return botTask
    botTask = (async () => {
      const saved = account.get('main')
      if (!saved?.appId) return undefined
      const secret = await readSecret()
      if (!secret) return undefined
      const created = new QQBot({ appId: saved.appId, appSecret: secret, logger: log })
      // Buffer first so skipped messages are still recorded, then resolve quotes,
      // then let the SDK decide whether this message addresses the bot. passthrough
      // keeps the chain alive for messages the gate rejects.
      created.use(historyBuffer({ limit: 50 }))
      created.use(quoteRef())
      created.use(mentionGate({ passthrough: true, requireMentionInGroup: true }))
      created.on('ready', () => { link.connected = true; link.readyAt = Date.now(); link.reason = null })
      created.on('disconnected', (event) => {
        link.connected = false
        link.disconnectedAt = Date.now()
        link.reason = event?.reason ?? event?.code ?? 'disconnected'
      })
      created.on('message', (messageCtx, message) => { void onInbound(messageCtx, message) })
      // SDK start() is a long-lived promise: it never resolves while connected and
      // rejects only when the gateway gives up. Do not await it.
      created.start().catch((error) => {
        botError = error instanceof Error ? error.message : String(error)
        log.warn(`qq-attach: bot stopped: ${botError}`)
        if (bot === created) bot = undefined
      })
      botError = undefined
      bot = created
      return bot
    })()
    try { return await botTask } finally { botTask = undefined }
  }

  async function restartBot() {
    const previous = bot
    bot = undefined
    cancelAllStreams()
    if (previous) { try { await previous.stop() } catch {} }
    await botInstance()
  }

  async function rememberChat(target, kind) {
    await chats.put(target, { kind, lastSeen: Date.now() })
    const rows = [...chats.entries()].sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    for (const [key] of rows.slice(RECENT_CHATS)) await chats.delete(key)
  }

  // ---- runtime: tools and prompt per attached agent ----------------------

  const qqSend = {
    name: 'qq_send',
    description: 'Send a text message to the QQ chat attached to this session. Use it when automatic replies are off or when you want to send something proactively.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Plain text to send to QQ.' } },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { sent: { type: 'boolean' }, target: { type: 'string' } },
        required: ['sent', 'target'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: `sent to ${value.target}` }],
    },
    async execute(args, exec) {
      const att = bySession.get(exec.agent?.id)
      if (!att) throw new Error('this session is not attached to a QQ chat')
      const text = String(args?.text ?? '')
      if (!text.trim()) throw new Error('text must not be empty')
      await sendText(att.target, text)
      return { sent: true, target: att.target }
    },
  }

  const qqSendFile = {
    name: 'qq_send_file',
    description: 'Send a local file to the QQ chat attached to this session. The path must be inside the session working directory or the QQ media directory.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to an existing file.' } },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { sent: { type: 'boolean' }, target: { type: 'string' }, file: { type: 'string' } },
        required: ['sent', 'target', 'file'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: `sent ${value.file} to ${value.target}` }],
    },
    async execute(args, exec) {
      const att = bySession.get(exec.agent?.id)
      if (!att) throw new Error('this session is not attached to a QQ chat')
      const path = String(args?.path ?? '')
      if (!path) throw new Error('path must not be empty')
      const agent = exec.agent
      const cwd = agent?.session?.header?.cwd
      const allowed = (cwd && isWithinRoot(path, cwd)) || isWithinRoot(path, MEDIA_ROOT)
      if (!allowed) throw new Error('path is outside the session working directory and the QQ media directory')
      const b = await botInstance()
      if (!b) throw new Error('QQ bot is not configured')
      const result = await sendMediaFile(b, passive(att.target), path)
      if (result.outcome === 'missing') throw new Error('file does not exist')
      if (result.outcome === 'failed') throw new Error(result.error)
      return { sent: true, target: att.target, file: path }
    },
  }

  function syncPrompt(agent, runtime) {
    const att = bySession.get(agent.id)
    const want = att !== undefined && att.autoReply === false
    if (runtime.prompt && !want) { runtime.prompt(); runtime.prompt = undefined }
    if (want && !runtime.prompt) {
      runtime.prompt = agent.ctx.systemPrompt.section({
        name: 'qq_attach', order: 90, text: () => promptFor(agent.id),
      })
    }
  }

  function ensureRuntime(agent) {
    let runtime = runtimes.get(agent.id)
    if (!runtime) {
      runtime = { disposers: [] }
      runtime.disposers.push(agent.ctx.tools.register(qqSend))
      runtime.disposers.push(agent.ctx.tools.register(qqSendFile))
      runtimes.set(agent.id, runtime)
    }
    syncPrompt(agent, runtime)
    return runtime
  }

  function disposeRuntime(sessionId) {
    const runtime = runtimes.get(sessionId)
    if (!runtime) return
    runtimes.delete(sessionId)
    try { runtime.prompt?.() } catch {}
    for (const dispose of runtime.disposers) { try { dispose() } catch {} }
  }

  async function ensureAgent(sessionId) {
    const result = await ctx.sessionController.resolveAgent(sessionId)
    if (!result.agent) {
      log.warn(`qq-attach: cannot resume session ${sessionId}: ${result.error?.message ?? 'unknown'}`)
      return undefined
    }
    ensureRuntime(result.agent)
    return result.agent
  }

  // ---- inbound -----------------------------------------------------------

  async function onInbound(messageCtx, msg) {
    try {
      if (msg.kind !== 'c2c' && msg.kind !== 'group') return
      inbound.total += 1
      if (msg.kind === 'group') inbound.group += 1
      if (msg.senderIsBot) return
      const target = targetOf(msg)
      if (!target) return
      const att = attaches.get(target)
      if (!att) { await rememberChat(target, msg.kind); return }
      // The SDK gate already covers the event type, the structured mention list and
      // the content fallback; the inline check stays only as a safety net.
      const decision = messageCtx?.state?.mention
      const mentioned = decision !== undefined
        ? decision.shouldAnswer
        : msg.rawEventType === 'GROUP_AT_MESSAGE_CREATE'
          || msg.mentions?.some(mention => mention?.is_you === true)
      inbound.last = {
        at: Date.now(),
        kind: msg.kind,
        event: msg.rawEventType ?? null,
        addressed: mentioned,
        text: String(msg.content ?? '').slice(0, 40),
      }
      if (msg.kind === 'group' && !mentioned) { inbound.groupSkipped += 1; return }
      const text = stripMentions(msg.content ?? '')
      const files = Array.isArray(msg.attachments) ? msg.attachments : []
      if (!text && files.length === 0) return
      lastMsg.set(target, { msgId: msg.messageId, at: Date.now(), count: 0 })
      const agent = await ensureAgent(att.sessionId)
      if (!agent) return
      const prefix = contextPrefix(messageCtx, msg)
      const content = await buildContent(prefix ? `${prefix}\n\n${text}` : text, files)
      if (content.length === 0) return
      const message = createUserMessage({ content, source: { kind: 'user' } })
      if (att.steer) agent.steer(message)
      else agent.followup(message)
      inbound.delivered += 1
      try { await ctx.sessions.flush?.(agent.session) } catch {}
    } catch (error) {
      inbound.failed += 1
      inbound.error = String(error instanceof Error ? (error.stack ?? error.message) : error).slice(0, 400)
      log.warn(`qq-attach: inbound failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Truncate one line of context without cutting a surrogate pair. */
  const clip = (text, max) => {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
    return flat.length > max ? `${flat.slice(0, max)}…` : flat
  }

  /**
   * Context the QQ platform attaches to one inbound message: the quoted message
   * when the sender replied to something, plus buffered group chatter. Only the
   * platform-pushed events are available; QQ exposes no history API.
   */
  function contextPrefix(messageCtx, msg) {
    const state = messageCtx?.state ?? {}
    const parts = []

    const quote = state.quote
    const quoteText = clip(stripMentions(quote?.text ?? ''), 300)
    if (quoteText) {
      const who = quote?.entry?.senderName || quote?.entry?.senderId
      parts.push(`<reply_to>${who ? `${who}: ` : ''}${quoteText}</reply_to>`)
    }

    const history = Array.isArray(state.history) ? state.history : []
    if (historyLimit > 0 && history.length > 0) {
      const rows = history.slice(-historyLimit)
        .map(entry => `${entry.senderName || entry.senderId || 'unknown'}: ${clip(stripMentions(entry.content ?? ''), 200)}`)
        .filter(row => row.length > 0)
      if (rows.length > 0) parts.push(`<history>\n${rows.join('\n')}\n</history>`)
    }

    if (parts.length === 0) return ''
    const sender = msg.senderName || msg.senderId || 'unknown'
    return `<qq_context>\nfrom: ${sender}\n${parts.join('\n')}\n</qq_context>`
  }

  async function buildContent(text, attachments) {
    const content = []
    if (text) content.push({ type: 'text', text })
    if (!mediaEnabled || attachments.length === 0) return content
    for (const item of attachments) {
      const name = item.filename || 'file'
      if (item.asr_refer_text) content.push({ type: 'text', text: `[voice] ${item.asr_refer_text}` })
      try {
        const downloaded = await downloadAttachment(item.url, name, maxBytes)
        const mediaType = mediaTypeOf(item.content_type, name)
        if (mediaType && typeof ctx.attachments?.saveImage === 'function') {
          const ref = await ctx.attachments.saveImage({ data: downloaded.data, mediaType, name: downloaded.name })
          content.push({ type: 'image', attachment: ref })
        } else if (typeof ctx.attachments?.saveFile === 'function') {
          const ref = await ctx.attachments.saveFile({ data: downloaded.data, name: downloaded.name })
          content.push({ type: 'file', attachment: ref })
        }
      } catch (error) {
        log.warn(`qq-attach: attachment skipped: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return content
  }

  // ---- outbound ----------------------------------------------------------

  function onStreamFrame(payload) {
    const agentId = payload?.agent?.id
    const frame = payload?.frame
    if (!agentId || !frame?.attemptId) return
    const att = bySession.get(agentId)
    if (!att || !att.autoReply || !att.streaming) return
    if (!att.target.startsWith('c2c:')) return
    const last = lastMsg.get(att.target)
    if (!last || Date.now() - last.at > C2C_TTL || last.count >= 4) return
    if (!bot) return
    if (frame.type === 'start') {
      cancelStream(att.target)
      streams.set(att.target, { text: '', session: undefined, attemptId: frame.attemptId })
      return
    }
    if (frame.type !== 'chunk' || frame.chunk?.type !== 'text-delta' || !frame.chunk.text) return
    let state = streams.get(att.target)
    if (!state) { state = { text: '', attemptId: frame.attemptId }; streams.set(att.target, state) }
    state.text += frame.chunk.text
    if (!state.session) {
      try {
        const parts = parseTarget(att.target)
        state.session = bot.openStream({ target: { ...parts, msgId: last.msgId } })
      } catch { streams.delete(att.target); return }
    }
    void state.session.update(state.text).catch(() => cancelStream(att.target))
  }

  function cancelStream(target) {
    const state = streams.get(target)
    if (!state) return
    streams.delete(target)
    try { state.session?.cancel?.() } catch {}
  }

  function cancelAllStreams() {
    for (const target of [...streams.keys()]) cancelStream(target)
  }

  async function onAssistant(att, event) {
    const blocks = event.data?.message?.content
    const text = Array.isArray(blocks)
      ? blocks.filter(block => block.type === 'text' && block.text).map(block => block.text).join('\n').trim()
      : ''
    const state = streams.get(att.target)
    if (state?.session) {
      streams.delete(att.target)
      try { await state.session.complete() } catch {}
      return
    }
    streams.delete(att.target)
    if (att.autoReply && text) {
      try { await sendText(att.target, text) } catch (error) {
        log.warn(`qq-attach: send failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /** Compact reason for a failed tool result: structured code, else its first text. */
  function failureDetail(data) {
    const code = data.error?.code
    if (typeof code === 'string' && code) return code
    const text = (Array.isArray(data.message?.content) ? data.message.content : [])
      .filter(block => block?.type === 'text' && typeof block.text === 'string' && block.text)
      .map(block => block.text)
      .join(' ')
      .replace(/^Error:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return 'ERROR'
    return text.length > 240 ? `${text.slice(0, 240)}…` : text
  }

  async function onSessionEvent(session, event) {
    const att = bySession.get(session.id)
    if (!att) return
    const data = event.data ?? {}
    if (event.type === 'tool/call' && data.callId && data.name) { toolNames.set(data.callId, data.name); return }
    if (event.type === 'tool/result') {
      const callId = data.message?.source?.callId
      const name = callId ? toolNames.get(callId) : undefined
      if (callId) toolNames.delete(callId)
      // An ordinary tool failure is flagged by `message.isError`; `data.error`
      // only carries aborts and structured failures. Checking `data.error`
      // alone silently disabled the `errors` switch for every tool throw.
      const failed = data.message?.isError === true || (data.error !== undefined && data.error !== null)
      if (att.errors && failed) {
        try { await sendText(att.target, `⚠️ tool ${name ?? 'call'} failed: ${failureDetail(data)}`) } catch {}
      } else if (att.toolResults) {
        try { await sendText(att.target, `🔧 ${name ?? 'tool'} finished`) } catch {}
      }
      return
    }
    if (event.type === 'assistant/message') { await onAssistant(att, event); return }
    if (event.type === 'deliverables/presented') {
      const files = Array.isArray(data.files) ? data.files : []
      const list = presented.get(session.id) ?? []
      for (const file of files) if (typeof file?.path === 'string') list.push(file.path)
      presented.set(session.id, list)
      return
    }
    if (event.type === 'turn/end') {
      const files = presented.get(session.id) ?? []
      presented.delete(session.id)
      const reason = data.reason ?? {}
      if (att.autoReply && files.length > 0) {
        const b = await botInstance().catch(() => undefined)
        if (b) {
          for (const path of files.slice(0, maxFiles)) {
            const result = await sendMediaFile(b, passive(att.target), path)
            if (result.outcome === 'failed') {
              try { await sendText(att.target, `⚠️ file send failed: ${path}`) } catch {}
            }
          }
        }
      }
      if (att.errors && reason.kind === 'error') {
        try { await sendText(att.target, `⚠️ turn failed: ${reason.error?.code ?? 'ERROR'}`) } catch {}
      }
      return
    }
  }

  ctx.on('session/event', (session, event) => { void onSessionEvent(session, event) })
  ctx.on('agent/assistant-stream', payload => onStreamFrame(payload), { global: true })
  ctx.on('agent/disposed', ({ agent }) => { disposeRuntime(agent.id) })
  ctx.on('agent/created', ({ agent }) => {
    const att = bySession.get(agent.id)
    if (att) ensureRuntime(agent)
  })

  // ---- binding -----------------------------------------------------------

  async function qrSvg(url) {
    qrLib ??= requireQr('qrcode')
    const svg = await qrLib.toString(url, { type: 'svg', margin: 1, width: 240 })
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  }

  async function applyCredentials(appId, appSecret) {
    if (!appId || !appSecret) throw new Error('AppID and AppSecret are required')
    await ctx.credentials.modifyRecord('qq-attach', async () => ({ kind: 'api-key', key: appSecret }))
    await account.put('main', { appId, updatedAt: Date.now() })
    await restartBot()
  }

  function startBind() {
    if (bindState.phase === 'waiting' || bindState.phase === 'starting') return bindState
    stopBind?.()
    bindState = { phase: 'starting' }
    stopBind = startQrConnect({
      onQrDisplayed: (url) => {
        bindState = { phase: 'waiting', url }
        void qrSvg(url).then((svg) => {
          if (bindState.phase === 'waiting' && bindState.url === url) bindState = { phase: 'waiting', url, qrSvg: svg }
        }).catch(() => {})
      },
      onQrExpired: () => { bindState = { phase: 'failed', reason: 'QR code expired' } },
      onSuccess: (credentials) => {
        const credential = credentials?.[0]
        if (!credential) { bindState = { phase: 'failed', reason: 'the scan returned no credentials' }; return }
        bindState = { phase: 'saving' }
        void applyCredentials(credential.appId, credential.appSecret)
          .then(() => { bindState = { phase: 'done' } })
          .catch((error) => { bindState = { phase: 'failed', reason: error instanceof Error ? error.message : String(error) } })
      },
      onFailure: (error) => {
        bindState = { phase: 'failed', reason: error instanceof Error ? error.message : String(error) }
      },
    }, { source: 'dsh-qq-attach' })
    return bindState
  }

  // ---- RPC ---------------------------------------------------------------

  const attachOf = (sessionId) => {
    const att = bySession.get(sessionId)
    if (!att) return null
    const { sessionId: _id, target, ...settings } = att
    return { target, ...settings, defaultPrompt: DEFAULT_PROMPT }
  }

  async function listAttaches() {
    const rows = []
    for (const [target, value] of attaches.entries()) {
      let title
      try { title = await ctx.sessionQuery.readTitle(value.sessionId) } catch {}
      rows.push({ target, ...value, title })
    }
    rows.sort((a, b) => b.createdAt - a.createdAt)
    return rows
  }

  async function route(endpoint, payload) {
    switch (endpoint) {
      case 'status': {
        const saved = account.get('main')
        const hasSecret = Boolean(await readSecret())
        return { build: BUILD, bound: Boolean(saved?.appId), appId: saved?.appId, running: Boolean(bot), hasSecret, error: botError ?? null, inbound: { ...inbound }, link: { ...link } }
      }
      case 'bind.start': return startBind()
      case 'bind.state': return bindState
      case 'bind.cancel': stopBind?.(); stopBind = undefined; bindState = { phase: 'idle' }; return bindState
      case 'account.set': {
        await applyCredentials(String(payload.appId ?? ''), String(payload.appSecret ?? ''))
        return { bound: true, appId: payload.appId }
      }
      case 'account.clear': {
        stopBind?.(); stopBind = undefined
        await account.delete('main')
        await ctx.credentials.deleteRecord('qq-attach')
        await restartBot()
        bindState = { phase: 'idle' }
        return { bound: false }
      }
      case 'chats.list': {
        const rows = [...chats.entries()]
          .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
          .map(([target, value]) => ({ target, kind: value.kind, lastSeen: value.lastSeen, attachedTo: attaches.get(target)?.sessionId ?? null }))
        return rows
      }
      case 'attach.get': return attachOf(String(payload.sessionId ?? ''))
      case 'attach.list': return listAttaches()
      case 'attach.set': {
        const sessionId = String(payload.sessionId ?? '')
        const target = String(payload.target ?? '')
        if (!sessionId || !parseTarget(target)) throw new Error('invalid session or target')
        const resolved = await ctx.sessionController.resolveAgent(sessionId)
        if (!resolved.agent) throw new Error(resolved.error?.message ?? 'session is not available')
        if (resolved.agent.session.header.origin === 'subagent') throw new Error('subagent sessions cannot attach')
        const current = bySession.get(sessionId)
        if (current && current.target !== target) throw new Error('detach the current chat first')
        const holder = attaches.get(target)
        if (holder && holder.sessionId !== sessionId) throw new Error('this chat is attached to another session')
        const record = {
          sessionId,
          autoReply: current?.autoReply ?? true,
          streaming: current?.streaming ?? true,
          toolResults: current?.toolResults ?? false,
          errors: current?.errors ?? true,
          steer: current?.steer ?? true,
          prompt: current?.prompt ?? '',
          createdAt: current?.createdAt ?? Date.now(),
        }
        if (current) await attaches.delete(current.target)
        await attaches.put(target, record)
        rebuild()
        await rememberChat(target, target.startsWith('group:') ? 'group' : 'c2c')
        ensureRuntime(resolved.agent)
        return attachOf(sessionId)
      }
      case 'attach.update': {
        const sessionId = String(payload.sessionId ?? '')
        const att = bySession.get(sessionId)
        if (!att) throw new Error('this session is not attached')
        const patch = payload.patch ?? {}
        const next = { ...att, target: undefined, sessionId: undefined }
        for (const key of ['autoReply', 'streaming', 'toolResults', 'errors', 'steer']) {
          if (typeof patch[key] === 'boolean') next[key] = patch[key]
        }
        if (typeof patch.prompt === 'string') next.prompt = patch.prompt.trim()
        const record = {
          sessionId,
          autoReply: next.autoReply,
          streaming: next.streaming,
          toolResults: next.toolResults,
          errors: next.errors,
          steer: next.steer,
          prompt: next.prompt ?? '',
          createdAt: att.createdAt,
        }
        await attaches.put(att.target, record)
        rebuild()
        const live = ctx.agents.get(sessionId)
        if (live) ensureRuntime(live)
        return attachOf(sessionId)
      }
      case 'attach.remove': {
        const sessionId = String(payload.sessionId ?? '')
        const att = bySession.get(sessionId)
        if (!att) return { removed: false }
        await attaches.delete(att.target)
        disposeRuntime(sessionId)
        rebuild()
        return { removed: true }
      }
      default: throw new Error(`unknown endpoint: ${endpoint}`)
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/qq-attach',
    handler: async (req, res) => {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const endpoint = pathname.startsWith('/qq-attach/') ? pathname.slice('/qq-attach/'.length) : ''
      let payload = {}
      try {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const text = Buffer.concat(chunks).toString('utf8')
        payload = text ? JSON.parse(text) : {}
      } catch {}
      try {
        const value = await route(endpoint, payload)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, value }))
      } catch (error) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: { code: 'qq-attach', message: error instanceof Error ? error.message : String(error) } }))
      }
    },
  }), 'qq-attach: route')

  // ---- media cleanup and startup ----------------------------------------

  if (ttlHours > 0) {
    ctx.effect(() => {
      const timer = setInterval(() => {
        void (async () => {
          try {
            await mkdir(MEDIA_ROOT, { recursive: true })
            const cutoff = Date.now() - ttlHours * 3600 * 1000
            for (const name of await readdir(MEDIA_ROOT)) {
              const path = `${MEDIA_ROOT}/${name}`
              try { const info = await stat(path); if (info.isFile() && info.mtimeMs < cutoff) await unlink(path) } catch {}
            }
          } catch {}
        })()
      }, 3600 * 1000)
      return () => clearInterval(timer)
    }, 'qq-attach: media cleanup')
  }

  ctx.effect(() => () => {
    for (const sessionId of [...runtimes.keys()]) disposeRuntime(sessionId)
    stopBind?.()
    cancelAllStreams()
    void bot?.stop()
  }, 'qq-attach: stop bot')

  for (const att of bySession.values()) {
    const live = ctx.agents.get(att.sessionId)
    if (live) ensureRuntime(live)
  }
  if (account.get('main')?.appId) void botInstance().catch(() => {})
}

