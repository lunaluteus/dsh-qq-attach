# dsh-qq-attach

Attach one open Deepseek Harness session to one QQ chat, so an agent you are already working
with could also talk to you on QQ.

> Vibed with Deepseek V4.1 Flash. Not polished yet. Use at your own risk.

## How this differs from the official QQ bot

The [official DSH QQ bot](https://github.com/tencent-connect/dsh-qqbot) hands you a bot:
it manages its own sessions, and controls the session lifecycle.

This plugin does the reverse — it binds a **DSH session** to a QQ chat.

- **Existing sessions can be attached.** So that you can continue working with the same agent on QQ.

- **Two reply modes.**

  - *Automatic replies* (default): everything the agent says is forwarded. 
    The agent does not know it is on QQ.
  - *Proactive only* (`autoReply` off): normal output is not forwarded and
    stays in the session. The agent must call `qq_send` / `qq_send_file` to send
    QQ messages. Ideal for a long-running, autonomous agent that only
    occasionally needs to reach you on QQ.

## Install & Setup

TODO

### Getting a chat into the picker

The picker only lists chats the bot has already received something from. Send
one message from that QQ chat to the bot first; it then appears in the dropdown.

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
Images already used in a session are stored in the DSH attachment store and is
not within the scope of this setting.

## Development

```sh
pnpm install
pnpm typecheck
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>)?: <subject>`.
