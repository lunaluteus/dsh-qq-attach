/** Small shared helpers: text chunking, path containment, media directory. */
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'

export const PLUGIN_HOME = resolve(homedir(), '.dsh-qqbot')
export const MEDIA_ROOT = join(PLUGIN_HOME, 'media')

/** Split markdown at line boundaries, keeping fences and tables intact. */
export function chunkText(text, limit = 4500) {
  if (text.length <= limit) return [text]
  const chunks = []
  let current = ''
  let inFence = false
  let table = []
  const append = (line) => {
    if (!current) { current = line; return }
    const next = `${current}\n${line}`
    if (next.length > limit) { chunks.push(current); current = line } else current = next
  }
  const flushTable = () => {
    if (table.length === 0) return
    const block = table.join('\n')
    table = []
    append(block)
  }
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) { flushTable(); inFence = !inFence; append(line); continue }
    if (inFence) { append(line); continue }
    if (/^\|.+\|$/.test(line)) { table.push(line); continue }
    flushTable()
    append(line)
  }
  flushTable()
  if (current) chunks.push(current)
  const out = []
  for (const chunk of chunks.length > 0 ? chunks : [text]) {
    for (let at = 0; at < chunk.length; at += limit) out.push(chunk.slice(at, at + limit))
  }
  return out
}

/** Real path for an existing prefix, lexical tail for the rest. */
export function realishPath(path) {
  const abs = resolve(path)
  try { return realpathSync(abs) } catch {}
  const parts = abs.split('/').filter(Boolean)
  for (let i = parts.length; i > 0; i -= 1) {
    try { return join(realpathSync(`/${parts.slice(0, i).join('/')}`), ...parts.slice(i)) } catch {}
  }
  return abs
}

/** Whether `file` lies inside `root` after resolving symlinks. */
export function isWithinRoot(file, root) {
  let realRoot
  try { realRoot = realpathSync(root) } catch { return false }
  const rel = relative(realRoot, realishPath(file))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Strip QQ mention markers from inbound text. */
export function stripMentions(text) {
  return text.replace(/<@!?[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** Sanitize one attachment filename. */
export function safeName(name, fallback = 'file') {
  const base = basename(name || fallback).replace(/[^\w.\-]+/g, '_').slice(0, 80)
  return base || fallback
}

export function mediaTypeOf(contentType, name) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase()
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) return type
  const ext = extname(name || '').toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return undefined
}
