# Continue Integrations

This directory contains integrations for Continue with external services and platforms.

## Available Integrations

### Slack Integration

Located in `slack/`, this integration enables Continue to respond to mentions in Slack DMs and channels.

**Features:**

- Private DM support for workflow execution
- Public channel mentions
- Real-time progress updates
- Secure webhook verification

**Files:**

- `webhook.ts` - Slack webhook handler and signature verification
- `client.ts` - Slack API client for sending messages
- `slackIntegration.ts` - Main integration logic connecting Slack to Continue
- `index.ts` - Public exports

**Usage:**

```typescript
import { setupSlackIntegration } from "./integrations/slack";

setupSlackIntegration(expressApp, {
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  botToken: process.env.SLACK_BOT_TOKEN!,
  botUserId: process.env.SLACK_BOT_USER_ID!,
  continueApiUrl: "http://localhost:8000",
});
```

**Documentation:**

- [Full Setup Guide](/docs/integrations/slack-dm.mdx)
- [Quick Start](/docs/integrations/slack-dm-quick-start.mdx)

## Adding New Integrations

To add a new integration:

1. Create a new directory under `integrations/` (e.g., `integrations/discord/`)
2. Implement the integration following this pattern:
   - `client.ts` - API client for the external service
   - `webhook.ts` - Webhook handler (if applicable)
   - `integration.ts` - Main integration logic
   - `index.ts` - Public exports
3. Add integration setup in the relevant command (e.g., `serve.ts`)
4. Create documentation in `docs/integrations/`
5. Add tests for the integration

## Integration Guidelines

When building integrations:

- **Security First**: Always verify webhooks and secure tokens
- **Error Handling**: Gracefully handle API failures
- **Logging**: Use the logger utility for debugging
- **Rate Limiting**: Respect external service rate limits
- **Documentation**: Provide clear setup instructions
- **Testing**: Include both unit and integration tests

## Testing Integrations

Each integration should include tests:

```bash
# Run all integration tests
npm test src/integrations/

# Run specific integration tests
npm test src/integrations/slack/
```

## Environment Variables

Integrations typically require environment variables for configuration:

```bash
# Slack
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_BOT_USER_ID=U01234567

# Add more integrations here as they're developed
```

## Architecture

Integrations follow a common pattern:

```
External Service (Slack, etc.)
    ↓
Webhook/Event Handler
    ↓
Integration Logic
    ↓
Continue API
    ↓
Results back to External Service
```

This ensures:

- Clean separation of concerns
- Easy testing and maintenance
- Consistent patterns across integrations
- Reusable components

## Support

For questions or issues with integrations:

- [GitHub Issues](https://github.com/continuedev/continue/issues)
- [Continue Discord](https://discord.gg/continue)
