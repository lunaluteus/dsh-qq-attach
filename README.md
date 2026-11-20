# dsh-qq-attach

Attach one open DSH session to one QQ chat, so an agent you are already working
with also talks to you on QQ.

## How this differs from the QQ bot SDK

The official SDK hands you a bot: you register a message handler and keep your
own state. This plugin does the reverse — it binds a **DSH session** to a chat.

- **The session is the bot.** A QQ message becomes a user turn in that session,
  so it keeps the agent's context, tools, files and memory. Nothing is mirrored.
- **Two reply modes.**
  - *Automatic replies* (default): everything the agent says is forwarded, and
    files it presents with `present` are sent when the turn ends.
  - *Proactive only* (`autoReply` off): normal output stays in the session and
    the agent must call `qq_send` / `qq_send_file`. This is the mode for long
    jobs where it should only report now and then.
- **Group chats need an @.** Messages that do not mention the bot are kept as
  context only: the last few reach the agent as `<history>`, never as turns, and
  their attachments stay `[image: name]` placeholders. A message that does
  address the bot downloads its own attachments and anything it quotes.
- **Settings belong to the attachment.** Reply mode, streaming, forwarding,
  steering and a prompt override are per session, not global.
- **The panel shows the QQ boundary.** Raw inbound events, mentions,
  attachments, every outbound call and gateway state — none of which the
  session trajectory records.

## Install

TODO

## Getting a chat into the picker

The picker only lists chats the bot has already received something from. Send
one message from that QQ chat to the bot first; it then appears in the dropdown.
Until then, paste the id by hand: `c2c:<openid>` or `group:<openid>`.

## Switches

| Switch | Default | Meaning |
| --- | --- | --- |
| Forward replies | on | Forward assistant text, and presented files at turn end |
| Streaming | on | Stream into one message (private chats only) |
| Forward tool results | off | One line for each successful tool call |
| Forward errors | on | Tool failures and the turn-failure notice |
| Steer while running | on | Steer the running turn; off queues the next one |

The prompt override applies while **Forward replies** is off: it tells the agent
that normal output is not delivered and that it must use `qq_send`.

## Configuration

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
    group:
      historyLimit: 8
```

`media.ttlHours` only clears the download staging area in `~/.dsh-qqbot/media`.
Images already used in a session live in the DSH attachment store, which never
deletes them.

## Limits

- One bot, and one session per chat. Taking over a chat that an active session
  holds asks for confirmation first.
- Only root sessions attach; subagent sessions are refused.
- An archived session is not fed: its messages are dropped with a log line.
- Files can be sent from the session working directory or the media directory.
- The local `/qq-attach` route has no extra authentication; keep the Web host on
  a trusted interface.

## Development

Dependencies come from the lockfile: `pnpm install`.

The sources are plain JavaScript; `tsc` checks them in place with `checkJs`:

```sh
pnpm typecheck
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>)?: <subject>`.
