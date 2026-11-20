# QQ attach

Attach one open DSH session to one QQ chat.

- From the conversation's **Attach** tab, pick a chat the bot has seen or paste a `c2c:<openid>` / `group:<openid>` target.
- QQ messages enter the session (private chats: all text; groups: only messages that mention the bot).
- Assistant text is forwarded when automatic reply is on; presented files follow the same switch.
- The agent gets `qq_send` and `qq_send_file`, only while the session is attached.
- Settings keeps the QR credential binding and the list of every attachment.
