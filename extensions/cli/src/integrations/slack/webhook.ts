import crypto from "crypto";
import { Request, Response } from "express";

import { logger } from "../../util/logger.js";
import { formatError } from "../../util/formatError.js";

/**
 * Verify Slack request signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  signingSecret: string,
  requestSignature: string,
  timestamp: string,
  body: string,
): boolean {
  const time = Math.floor(Date.now() / 1000);
  const timestampNum = parseInt(timestamp, 10);

  // Reject old requests (older than 5 minutes)
  if (Math.abs(time - timestampNum) > 300) {
    return false;
  }

  // Create signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(sigBasestring, "utf8")
    .digest("hex")}`;

  // Compare signatures
  return crypto.timingSafeEqual(
    Buffer.from(mySignature, "utf8"),
    Buffer.from(requestSignature, "utf8"),
  );
}

export interface SlackEvent {
  type: string;
  event_ts: string;
  user: string;
  text: string;
  channel: string;
  channel_type?: string;
}

export interface SlackWebhookPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: string;
  event_id: string;
  event_time: number;
  challenge?: string;
}

/**
 * Handle Slack webhook events
 */
export async function handleSlackWebhook(
  req: Request,
  res: Response,
  signingSecret: string,
  onMessage: (payload: SlackWebhookPayload) => Promise<void>,
): Promise<void> {
  try {
    // Verify request signature
    const signature = req.headers["x-slack-signature"] as string;
    const timestamp = req.headers["x-slack-request-timestamp"] as string;
    const rawBody = JSON.stringify(req.body);

    if (!signature || !timestamp) {
      logger.error("Missing Slack signature or timestamp");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
      logger.error("Invalid Slack signature");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = req.body as SlackWebhookPayload;

    // Handle URL verification challenge
    if (payload.type === "url_verification" && payload.challenge) {
      res.json({ challenge: payload.challenge });
      return;
    }

    // Handle event callbacks
    if (payload.type === "event_callback") {
      // Acknowledge receipt immediately
      res.status(200).send();

      // Process the event asynchronously
      try {
        await onMessage(payload);
      } catch (error) {
        logger.error(`Error processing Slack event: ${formatError(error)}`);
      }
      return;
    }

    // Unknown event type
    logger.warn(`Unknown Slack event type: ${payload.type}`);
    res.status(400).json({ error: "Unknown event type" });
  } catch (error) {
    logger.error(`Error handling Slack webhook: ${formatError(error)}`);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Check if a message is a DM (direct message)
 */
export function isDirectMessage(event: SlackEvent): boolean {
  return event.channel_type === "im";
}

/**
 * Check if the bot is mentioned in the message
 */
export function isBotMentioned(text: string, botUserId: string): boolean {
  return text.includes(`<@${botUserId}>`);
}

/**
 * Extract the message text without bot mention
 */
export function extractMessageText(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
}
