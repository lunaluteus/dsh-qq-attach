/** Media: outbound dispatch by extension, inbound download to the media dir. */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { MEDIA_ROOT, safeName } from './util.js'

const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])
const VIDEO = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm'])
const VOICE = new Set(['.mp3', '.wav', '.ogg', '.aac', '.silk', '.amr'])

/** Send one local file through the SDK's image/video/voice/file channel. */
export async function sendMediaFile(bot, target, filePath, fileName = basename(filePath)) {
  let info
  try { info = await stat(filePath) } catch { return { outcome: 'missing' } }
  if (!info.isFile()) return { outcome: 'missing' }
  const source = { localPath: filePath }
  const ext = extname(filePath).toLowerCase()
  try {
    const result = IMAGE.has(ext) || ext === '.gif'
      ? await bot.sendImage(target, source)
      : VIDEO.has(ext)
        ? await bot.sendVideo(target, source)
        : VOICE.has(ext)
          ? await bot.sendVoice(target, source)
          : await bot.sendFile(target, source, { fileName })
    return {
      outcome: 'sent',
      size: info.size,
      fileUuid: result?.upload?.file_uuid,
      messageId: result?.message?.id,
    }
  } catch (error) {
    return { outcome: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

/** Download one inbound attachment into the media dir (bounded by maxBytes). */
export async function downloadAttachment(url, name, maxBytes, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') || 0)
  if (length > maxBytes) throw new Error(`attachment exceeds ${maxBytes} bytes`)
  const data = Buffer.from(await response.arrayBuffer())
  if (data.byteLength > maxBytes) throw new Error(`attachment exceeds ${maxBytes} bytes`)
  await mkdir(MEDIA_ROOT, { recursive: true })
  const filePath = join(MEDIA_ROOT, `${Date.now()}-${safeName(name)}`)
  await writeFile(filePath, data)
  return { data, filePath, name: safeName(name) }
}
