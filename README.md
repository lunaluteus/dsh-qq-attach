# dsh-qq-attach

Attach one open DSH session to one QQ chat.

This bundle replaces the old always-on QQ session bot: there are no QQ-side
commands, menus, approvals, or per-peer sessions. A conversation is attached
explicitly from DSH, and only the attached chat is bridged.

## What it does

- QQ messages enter the attached DSH session as user turns. Private chats take
  all text; group chats take only messages that mention the bot.
- Assistant text is forwarded to QQ while **Forward replies** is on. Presented
  files follow the same switch.
- `qq_send` and `qq_send_file` are registered only on attached sessions, so the
  agent can send proactively even when automatic replies are off.
- Images from QQ are stored through the attachment service and delivered to the
  model as image blocks; other attachments become file blocks. Voice messages
  keep QQ's transcription text when present.
- Media files live in `~/.dsh-qqbot/media` and expire after `media.ttlHours`.

## Use

1. Install the bundle, then open **Settings → QQ attach**.
2. Scan the QR code or enter the AppID and AppSecret.
3. Open any conversation, switch to the **QQ attach** tab, pick a chat the bot
   has seen or paste `c2c:<openid>` / `group:<openid>`, and attach.
4. Send a QQ message; reply in DSH or let the agent call `qq_send`.

The settings page lists every attachment; clicking a row opens its conversation
on the QQ attach tab.

## Per-attachment switches

| Switch | Default | Meaning |
| --- | --- | --- |
| Forward replies | on | Forward assistant text; presented files too |
| Streaming | on | Stream into one message (private chats only) |
| Forward tool results | off | Send a one-line note for each successful tool call |
| Forward errors | on | Send tool failures and the turn failure notice |
| Steer while running | on | Steer a running turn; off queues the next turn |

## Config

```yaml
- id: qq-attach
  name: dsh-qq-attach
  config:
    media:
      enabled: true
      maxMB: 200
      ttlHours: 24
    sendFile:
      maxFiles: 4
```

## Limitations

- One bot; one chat per session; a chat must be detached before it can be
  attached elsewhere.
- Only root sessions attach; subagent sessions are refused.
- No QQ-side commands, approvals, questions, group history, or quoting.
- File sending is limited to the session working directory and the media
  directory.
- The local HTTP route under `/qq-attach` has no additional authentication;
  keep the Web host on a trusted interface.

## Development

Dependencies come from the lockfile: `pnpm install`.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>)?: <subject>`, where type is one of `feat`, `fix`, `docs`,
`style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. The
bundled hook rejects anything else, so enable it once per clone:

```sh
git config core.hooksPath .githooks
```
