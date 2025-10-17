## Investigation Results: CLI Context Pollution Between Sessions

I've investigated this issue and identified the root cause of context pollution between CLI sessions. Here's what I found:

### Root Cause

The CLI uses persistent singleton services that maintain state across sessions, causing context from previous sessions to "bleed" into new ones. The main culprits are:

1. **SessionManager Singleton** ([`session.ts#L79-L120`](https://github.com/continuedev/continue/blob/main/extensions/cli/src/session.ts#L79-L120))

   - Maintains `currentSession` that doesn't get cleared between non-resume sessions
   - Reuses test session IDs when `CONTINUE_CLI_TEST_SESSION_ID` is set

2. **Global Service Container** ([`ServiceContainer.ts#L293`](https://github.com/continuedev/continue/blob/main/extensions/cli/src/services/ServiceContainer.ts#L293))

   - Services like `ChatHistoryService` retain their state across CLI invocations
   - No cleanup mechanism when starting fresh sessions

3. **Missing Session Reset Logic** ([`chat.ts#L87-L115`](https://github.com/continuedev/continue/blob/main/extensions/cli/src/commands/chat.ts#L87-L115))
   - The `initializeChatHistory()` function handles `--resume` and `--fork` but doesn't explicitly clear state for new sessions

### Quick Workaround

Until a fix is merged, you can work around this by:

1. Using `--fork` with a new UUID each time: `cn --fork $(uuidv4) "your prompt"`
2. Clearing session files manually: `rm ~/.continue/sessions/*.json`

### Proposed Fix

**Short-term:** Add explicit cleanup when starting new sessions:

```typescript
// In chat.ts initializeChatHistory()
if (!options.resume && !options.fork) {
  SessionManager.getInstance().clear();
  services.chatHistory.clear();
}
```

**Long-term:** Implement a `ServiceLifecycleManager` to properly manage service state between sessions.

### Files to Review

Key files involved in this issue:

- [`extensions/cli/src/session.ts`](https://github.com/continuedev/continue/blob/main/extensions/cli/src/session.ts) - Session management singleton
- [`extensions/cli/src/services/ChatHistoryService.ts`](https://github.com/continuedev/continue/blob/main/extensions/cli/src/services/ChatHistoryService.ts) - Chat history state
- [`extensions/cli/src/commands/chat.ts`](https://github.com/continuedev/continue/blob/main/extensions/cli/src/commands/chat.ts) - Session initialization logic
- [`extensions/cli/src/services/index.ts`](https://github.com/continuedev/continue/blob/main/extensions/cli/src/services/index.ts) - Service instantiation

### How to Reproduce

1. Run: `cn "Tell me about dogs"`
2. Have a conversation about dogs
3. Exit (Ctrl+C twice)
4. Run: `cn "What were we discussing?"`
5. The CLI may reference the previous conversation about dogs

This happens because the `SessionManager` and service singletons retain state from the previous session.

### Testing the Fix

A proper fix should ensure:

- New sessions start with clean state (no `--resume` flag)
- `--resume` correctly loads previous session
- `--fork` creates isolated session from parent
- Services properly reset between sessions

I've created a draft `ServiceLifecycleManager` that could help manage this lifecycle properly. Would be happy to submit a PR if the team agrees with this approach.
