import { logger } from "../../util/logger.js";
import { formatError } from "../../util/formatError.js";

export interface SlackMessage {
  channel: string;
  text: string;
  thread_ts?: string;
}

export interface SlackMessageResponse {
  ok: boolean;
  channel?: string;
  ts?: string;
  error?: string;
}

/**
 * Simple Slack API client for posting messages
 */
export class SlackClient {
  private botToken: string;
  private apiBase = "https://slack.com/api";

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  /**
   * Post a message to a Slack channel
   */
  async postMessage(message: SlackMessage): Promise<SlackMessageResponse> {
    try {
      const response = await fetch(`${this.apiBase}/chat.postMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify(message),
      });

      const data = (await response.json()) as SlackMessageResponse;

      if (!data.ok) {
        logger.error(`Failed to post Slack message: ${data.error}`);
      }

      return data;
    } catch (error) {
      logger.error(`Error posting Slack message: ${formatError(error)}`);
      return {
        ok: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(
    channel: string,
    ts: string,
    text: string,
  ): Promise<SlackMessageResponse> {
    try {
      const response = await fetch(`${this.apiBase}/chat.update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({
          channel,
          ts,
          text,
        }),
      });

      const data = (await response.json()) as SlackMessageResponse;

      if (!data.ok) {
        logger.error(`Failed to update Slack message: ${data.error}`);
      }

      return data;
    } catch (error) {
      logger.error(`Error updating Slack message: ${formatError(error)}`);
      return {
        ok: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Post an ephemeral message (only visible to specific user)
   */
  async postEphemeral(
    channel: string,
    user: string,
    text: string,
  ): Promise<SlackMessageResponse> {
    try {
      const response = await fetch(`${this.apiBase}/chat.postEphemeral`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({
          channel,
          user,
          text,
        }),
      });

      const data = (await response.json()) as SlackMessageResponse;

      if (!data.ok) {
        logger.error(`Failed to post ephemeral message: ${data.error}`);
      }

      return data;
    } catch (error) {
      logger.error(`Error posting ephemeral message: ${formatError(error)}`);
      return {
        ok: false,
        error: formatError(error),
      };
    }
  }
}
