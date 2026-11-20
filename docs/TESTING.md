# Test coverage

`pnpm typecheck` runs before every commit. This file tracks what has been
verified against a real QQ account, and what still needs a manual pass.

## Verified

| Area | How it was checked |
| --- | --- |
| Inbound C2C and group messages | Session transcript shows `user/message` with `role: user` |
| Automatic replies | Reply arrives in QQ, and the log shows `out reply` |
| `qq_send` / `qq_send_file` | Message and file arrive in QQ |
| Automatic replies off | Only `qq_send` output reaches QQ, normal replies are suppressed |
| `errors` switch | A failing tool produces the `⚠️ tool … failed` notice |
| `toolResults` switch | A tool call produces the `🔧 … finished` notice |
| Mention rendering | Group text arrives as `@you` / `@nickname`, not raw openids |
| Quoted attachments | A quoted image is downloaded and the model describes it |
| Skipped attachments | Un-addressed group images stay placeholders and are never downloaded |
| Per-session prompt | Set, read back and reset through the panel and the API |
| QQ log panel | Records inbound, outbound, attachments and gateway events |
| Attach persistence | Survives repeated plugin reloads without re-binding |
| Gateway state | `link.connected` follows the SDK's ready/disconnected events |

## Not yet verified

| Area | How to test |
| --- | --- |
| Streaming replies | Enable streaming in a direct chat and confirm one message updates in place |
| `deliverables/presented` | With automatic replies on, have the agent present a file; it should send at turn end |
| Long message chunking | Produce a reply over 4500 characters; QQ should receive several parts |
| Passive reply budget | Reply more than four times to one message; later replies must fall back to active messages |
| Media TTL cleanup | Set `media.ttlHours` low and confirm old files disappear under `~/.dsh-qqbot/media` |
| `sendFile.maxFiles` | Present more files than the cap; only the configured number should send |
| QR binding | Unbind, then bind again by scanning the QR code |
| Manual credentials | Bind with AppID and AppSecret instead of the QR flow |
| Interface language | Switch the UI language and confirm the panel follows `locale/zh.json` |
| Subagent guard | Open the QQ tab in a subagent session; it must refuse to attach |
| Session jump | Click an attached session in the plugin page and confirm navigation |
| Plugin detail page | Check the icon and description on the plugin's detail page |
