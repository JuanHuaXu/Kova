# Kova Scenario Hierarchy

Kova measures OpenClaw behavior by runtime path, not by whichever client first
exposed that path.

## Gateway Session

`gateway-session-send-turn` is the shared Gateway session messaging benchmark.
It calls `sessions.create`, `sessions.send`, and `chat.history` directly over
Gateway RPC with mock auth/provider. Use it for the core Control UI, dashboard,
and channel message path.

This scenario owns:

- cold and warm Gateway session turn timing
- pre-provider, provider, and post-provider timing
- Gateway session diagnostics timeline attribution
- Gateway process RSS/CPU as the primary product resource signal
- helper process cost under `gateway-session-client`

## Dashboard

`dashboard-readiness` is dashboard-specific coverage. It verifies the dashboard
command, URL/websocket entry, and post-dashboard Gateway health. It does not own
the shared message-turn benchmark.

## Channels

Channel scenarios should prove adapter behavior: the channel can create or
route a user turn into the shared Gateway session path and recover/report
adapter-specific failures. They should compare against `gateway-session-send-turn`
instead of duplicating the core Gateway session benchmark.

## Agent CLI

Agent CLI scenarios measure CLI client behavior separately:

- `agent-cli-local-turn` covers short-lived local agent CLI turns.
- `agent-gateway-rpc-turn` covers `openclaw agent` as a CLI client crossing the
  Gateway agent RPC path.

CLI process cost should stay on CLI roles. It should not be used as the primary
acceptance signal for Control UI, dashboard, or channel users.
