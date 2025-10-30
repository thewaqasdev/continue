import express, { Express } from "express";
import chalk from "chalk";

import { logger } from "../../util/logger.js";
import { formatError } from "../../util/formatError.js";
import {
  handleSlackWebhook,
  isDirectMessage,
  isBotMentioned,
  extractMessageText,
  SlackWebhookPayload,
} from "./webhook.js";
import { SlackClient } from "./client.js";

export interface SlackIntegrationConfig {
  signingSecret: string;
  botToken: string;
  botUserId: string;
  continueApiUrl: string;
}

export class SlackIntegration {
  private config: SlackIntegrationConfig;
  private client: SlackClient;
  private processingMessages = new Set<string>();

  constructor(config: SlackIntegrationConfig) {
    this.config = config;
    this.client = new SlackClient(config.botToken);
  }

  /**
   * Setup Slack webhook endpoint
   */
  setupWebhook(app: Express): void {
    app.post("/slack/events", async (req, res) => {
      await handleSlackWebhook(
        req,
        res,
        this.config.signingSecret,
        this.handleEvent.bind(this),
      );
    });

    console.log(chalk.green("Slack webhook endpoint: POST /slack/events"));
  }

  /**
   * Handle incoming Slack events
   */
  private async handleEvent(payload: SlackWebhookPayload): Promise<void> {
    const { event } = payload;

    // Only process message events
    if (event.type !== "message") {
      return;
    }

    // Ignore bot messages and messages we've already processed
    if (event.user === this.config.botUserId) {
      return;
    }

    // Create unique message ID
    const messageId = `${event.channel}:${event.event_ts}`;
    if (this.processingMessages.has(messageId)) {
      return;
    }

    try {
      this.processingMessages.add(messageId);

      // Check if this is a DM
      const isDM = isDirectMessage(event);

      // For DMs, process any message. For channels, only process mentions
      if (!isDM && !isBotMentioned(event.text, this.config.botUserId)) {
        return;
      }

      logger.info(
        `Received ${isDM ? "DM" : "mention"} from user ${event.user} in channel ${event.channel}`,
      );

      // Extract the actual message text
      const messageText = extractMessageText(event.text, this.config.botUserId);

      if (!messageText) {
        await this.client.postMessage({
          channel: event.channel,
          text: "Please provide a message for me to process.",
        });
        return;
      }

      // Send initial acknowledgment
      const ackResponse = await this.client.postMessage({
        channel: event.channel,
        text: "🤖 Processing your request...",
      });

      if (!ackResponse.ok || !ackResponse.ts) {
        logger.error("Failed to send acknowledgment message");
        return;
      }

      // Send message to Continue API
      try {
        const response = await fetch(`${this.config.continueApiUrl}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: messageText,
          }),
        });

        if (!response.ok) {
          throw new Error(`Continue API returned ${response.status}`);
        }

        // Update the acknowledgment message
        await this.client.updateMessage(
          event.channel,
          ackResponse.ts,
          "✅ Your request has been queued. I'll send you the results when complete.",
        );

        // Poll for results and send them back
        this.pollAndSendResults(event.channel, event.user, ackResponse.ts);
      } catch (error) {
        logger.error(`Error sending to Continue API: ${formatError(error)}`);

        await this.client.updateMessage(
          event.channel,
          ackResponse.ts,
          `❌ Error processing your request: ${formatError(error)}`,
        );
      }
    } finally {
      this.processingMessages.delete(messageId);
    }
  }

  /**
   * Poll Continue API for results and send them to Slack
   */
  private async pollAndSendResults(
    channel: string,
    user: string,
    messageTs: string,
  ): Promise<void> {
    const maxPolls = 300; // 5 minutes with 1 second intervals
    let polls = 0;
    let lastMessageCount = 0;

    const pollInterval = setInterval(async () => {
      polls++;

      if (polls > maxPolls) {
        clearInterval(pollInterval);
        await this.client.updateMessage(
          channel,
          messageTs,
          "⏱️ Request timed out. The agent may still be processing in the background.",
        );
        return;
      }

      try {
        // Get current state from Continue API
        const response = await fetch(`${this.config.continueApiUrl}/state`);

        if (!response.ok) {
          throw new Error(`Continue API returned ${response.status}`);
        }

        const state = await response.json();

        // Check if there are new messages
        if (state.history && state.history.length > lastMessageCount) {
          lastMessageCount = state.history.length;

          // Get the latest assistant message
          const lastMessage = state.history[state.history.length - 1];
          if (lastMessage?.message?.role === "assistant") {
            const content = lastMessage.message.content;

            if (content && content.trim()) {
              // Send the assistant's response
              await this.client.updateMessage(
                channel,
                messageTs,
                `✅ Complete!\n\n${content}`,
              );
            }
          }
        }

        // Check if processing is complete
        if (!state.isProcessing && state.queueLength === 0) {
          clearInterval(pollInterval);

          // If we have a final message, we've already sent it
          // Otherwise, indicate completion without new content
          if (lastMessageCount === 0) {
            await this.client.updateMessage(
              channel,
              messageTs,
              "✅ Processing complete.",
            );
          }
        }
      } catch (error) {
        logger.error(`Error polling Continue API: ${formatError(error)}`);
        clearInterval(pollInterval);
        await this.client.updateMessage(
          channel,
          messageTs,
          `❌ Error getting results: ${formatError(error)}`,
        );
      }
    }, 1000);
  }
}

/**
 * Create and setup Slack integration
 */
export function setupSlackIntegration(
  app: Express,
  config: SlackIntegrationConfig,
): SlackIntegration {
  const integration = new SlackIntegration(config);
  integration.setupWebhook(app);
  return integration;
}
