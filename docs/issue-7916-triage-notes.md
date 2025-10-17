# Triage Notes for Issue #7916: CLI Context Pollution Between Sessions

## Summary

The Continue CLI experiences context pollution between sessions due to persistent global state in singleton services and improper session cleanup. This causes previous session context to "bleed" into new sessions.

## Root Cause Analysis

### 1. Global Singleton Pattern Issues

The CLI uses multiple singleton patterns that maintain state across CLI invocations:

#### SessionManager Singleton

**File:** [`extensions/cli/src/session.ts`](../extensions/cli/src/session.ts#L79-L120)

```typescript
class SessionManager {
  private static instance: SessionManager;
  private currentSession: Session | null = null;

  getCurrentSession(): Session {
    if (!this.currentSession) {
      // Problem: Reuses test session ID if set
      const sessionId = process.env.CONTINUE_CLI_TEST_SESSION_ID
        ? process.env.CONTINUE_CLI_TEST_SESSION_ID // Can cause unintended reuse
        : uuidv4();

      this.currentSession = {
        sessionId,
        title: DEFAULT_SESSION_TITLE,
        workspaceDirectory: process.cwd(),
        history: [],
      };
    }
    return this.currentSession;
  }
}
```

**Issue:** The SessionManager singleton persists across CLI runs and doesn't properly reset between non-resume sessions.

#### ServiceContainer Singleton

**File:** [`extensions/cli/src/services/ServiceContainer.ts`](../extensions/cli/src/services/ServiceContainer.ts#L293)

```typescript
// Global singleton instance
export const serviceContainer = new ServiceContainer();
```

**Issue:** The global `serviceContainer` maintains references to all services, which retain their state between sessions.

### 2. Service State Persistence

#### ChatHistoryService

**File:** [`extensions/cli/src/services/ChatHistoryService.ts`](../extensions/cli/src/services/ChatHistoryService.ts#L26-L43)

The `ChatHistoryService` maintains chat history state that isn't properly cleared when starting new sessions:

```typescript
export class ChatHistoryService extends BaseService<ChatHistoryState> {
  private past: ChatHistoryItem[][] = []; // Undo stack persists
  private future: ChatHistoryItem[][] = []; // Redo stack persists

  constructor() {
    super("ChatHistoryService", {
      history: [],
      compactionIndex: null,
      sessionId: "",
      isRemoteMode: false,
    });
  }
}
```

### 3. Session Initialization Flow

#### Chat Command Entry Point

**File:** [`extensions/cli/src/commands/chat.ts`](../extensions/cli/src/commands/chat.ts#L87-L115)

The `initializeChatHistory` function only handles `--resume` and `--fork` flags but doesn't explicitly clear state for new sessions:

```typescript
export async function initializeChatHistory(
  options: ChatOptions,
): Promise<ChatHistoryItem[]> {
  // Fork from existing session
  if (options.fork) {
    // Creates new session from fork
  }

  // Resume previous session
  if (options.resume) {
    // Loads existing session
  }

  // DEFAULT: Returns empty array but doesn't clear SessionManager!
  return [];
}
```

#### Service Initialization

**File:** [`extensions/cli/src/services/index.ts`](../extensions/cli/src/services/index.ts#L32-L43)

Services are instantiated as module-level singletons:

```typescript
// Service instances - GLOBAL SINGLETONS
const authService = new AuthService();
const configService = new ConfigService();
const modelService = new ModelService();
const chatHistoryService = new ChatHistoryService();
// ... more services
```

### 4. Missing Cleanup Between Sessions

The CLI lacks proper cleanup mechanisms when starting new sessions:

1. **No Session Reset:** When running `cn` without `--resume`, the previous `SessionManager` state isn't cleared
2. **Service State Persists:** Service instances maintain their internal state across CLI invocations
3. **No Lifecycle Management:** There's no centralized lifecycle manager to ensure clean session transitions

## Affected Code Paths

### Primary Flow

1. **CLI Entry:** `extensions/cli/src/index.ts` → `chat()` command
2. **Chat Initialization:** `extensions/cli/src/commands/chat.ts` → `initializeChatHistory()`
3. **Session Management:** `extensions/cli/src/session.ts` → `SessionManager.getCurrentSession()`
4. **Service Usage:** `extensions/cli/src/services/ChatHistoryService.ts` → maintains history

### TUI Flow

1. **TUI Start:** `extensions/cli/src/ui/index.ts` → `startTUIChat()`
2. **Hook Usage:** `extensions/cli/src/ui/hooks/useChat.ts` → uses services
3. **Session Handling:** `extensions/cli/src/ui/hooks/useChat.helpers.ts` → `startNewSession()`

## Reproduction Steps

1. Start a CLI session: `cn "Tell me about context pollution"`
2. Have a conversation with specific context
3. Exit the session
4. Start a new session: `cn "What were we discussing?"`
5. The new session may reference the previous conversation

## Proposed Solution

### Short-term Fix

Add explicit session cleanup when starting new sessions:

```typescript
// In chat.ts initializeChatHistory()
if (!options.resume && !options.fork) {
  // Clear existing session state
  SessionManager.getInstance().clear();
  services.chatHistory.clear();
}
```

### Long-term Solution

Implement a `ServiceLifecycleManager` (see [`ServiceLifecycleManager.ts`](../extensions/cli/src/services/ServiceLifecycleManager.ts)) to:

1. **Reset services** when starting new sessions
2. **Cleanup resources** before process exit
3. **Ensure isolation** between CLI invocations
4. **Manage lifecycle** of singleton services

### Implementation Checklist

- [ ] Add session reset logic to `initializeChatHistory()` in `chat.ts`
- [ ] Implement `clear()` method in `SessionManager` class
- [ ] Add cleanup to `ChatHistoryService` for proper state reset
- [ ] Integrate `ServiceLifecycleManager` into session initialization
- [ ] Add tests for session isolation
- [ ] Update `gracefulExit()` to call cleanup methods

## Testing Recommendations

1. **Unit Tests:** Test session isolation in `session.test.ts`
2. **Integration Tests:** Test multiple CLI invocations in `e2e/session-isolation.test.ts`
3. **Memory Tests:** Check for memory leaks with retained references

## Environment Variables to Check

- `CONTINUE_CLI_TEST_SESSION_ID` - Can cause session reuse in tests
- `CONTINUE_GLOBAL_DIR` - Affects session storage location

## Related Files for Investigation

- [`extensions/cli/src/session.ts`](../extensions/cli/src/session.ts) - Session management
- [`extensions/cli/src/services/ChatHistoryService.ts`](../extensions/cli/src/services/ChatHistoryService.ts) - History state management
- [`extensions/cli/src/services/ServiceContainer.ts`](../extensions/cli/src/services/ServiceContainer.ts) - Service lifecycle
- [`extensions/cli/src/commands/chat.ts`](../extensions/cli/src/commands/chat.ts) - Chat command initialization
- [`extensions/cli/src/util/exit.ts`](../extensions/cli/src/util/exit.ts) - Process cleanup
- [`extensions/cli/src/ui/hooks/useChat.helpers.ts`](../extensions/cli/src/ui/hooks/useChat.helpers.ts) - TUI session handling

## Quick Debugging Commands

```bash
# Check for persisted session files
ls -la ~/.continue/sessions/

# Monitor session IDs during multiple runs
CONTINUE_CLI_TEST_SESSION_ID="" cn --verbose 2>&1 | grep -i session

# Test session isolation
cn "First session context" && cn "Should not see first session"
```

## Additional Notes

- The issue is more prominent when using environment variables that affect session IDs
- The problem may be intermittent depending on Node.js process caching
- TUI mode (`cn` without `-p`) and headless mode (`cn -p`) may exhibit different behaviors
- The issue affects both local and remote sessions
