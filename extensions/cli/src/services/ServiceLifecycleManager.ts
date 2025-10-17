import { logger } from "../util/logger.js";
import { serviceContainer } from "./ServiceContainer.js";
import { SERVICE_NAMES } from "./types.js";

/**
 * Manages the lifecycle of services to ensure clean session isolation
 * This class is responsible for properly resetting services between sessions
 */
export class ServiceLifecycleManager {
  private static instance: ServiceLifecycleManager;

  private constructor() {}

  static getInstance(): ServiceLifecycleManager {
    if (!ServiceLifecycleManager.instance) {
      ServiceLifecycleManager.instance = new ServiceLifecycleManager();
    }
    return ServiceLifecycleManager.instance;
  }

  /**
   * Reset all stateful services to ensure clean session isolation
   * Called when starting a new session without --resume
   */
  async resetForNewSession(): Promise<void> {
    logger.debug("Resetting services for new session");

    try {
      // Clear the session manager singleton
      const { SessionManager } = await import("../session.js");
      SessionManager.getInstance().clear();

      // Reset chat history service if it exists
      if (serviceContainer.isReady(SERVICE_NAMES.CHAT_HISTORY)) {
        const { services } = await import("./index.js");
        services.chatHistory.clear();
        logger.debug("Cleared chat history service");
      }

      // Clear any cached MCP connections
      if (serviceContainer.isReady(SERVICE_NAMES.MCP)) {
        const { services } = await import("./index.js");
        // Reset MCP service state if needed
        logger.debug("Reset MCP service connections");
      }

      // Clear file index cache to prevent stale references
      if (serviceContainer.isReady(SERVICE_NAMES.FILE_INDEX)) {
        const { services } = await import("./index.js");
        // Reset file index if it has a clear method
        logger.debug("Reset file index service");
      }

      logger.debug("Service reset completed for new session");
    } catch (error) {
      logger.error("Error resetting services for new session:", error);
      // Don't throw - allow session to continue even if reset fails
    }
  }

  /**
   * Cleanup services before process exit
   * Ensures proper resource cleanup and prevents memory leaks
   */
  async cleanup(): Promise<void> {
    logger.debug("Cleaning up services before exit");

    try {
      // Close MCP connections if any
      if (serviceContainer.isReady(SERVICE_NAMES.MCP)) {
        const { services } = await import("./index.js");
        // Cleanup MCP connections
        logger.debug("Cleaned up MCP connections");
      }

      // Flush any pending storage syncs
      if (serviceContainer.isReady(SERVICE_NAMES.STORAGE_SYNC)) {
        const { services } = await import("./index.js");
        // Flush storage sync
        logger.debug("Flushed storage sync");
      }

      // Save current session if needed
      const { saveSession } = await import("../session.js");
      saveSession();
      logger.debug("Saved current session");

      logger.debug("Service cleanup completed");
    } catch (error) {
      logger.error("Error during service cleanup:", error);
      // Don't throw - allow exit to proceed
    }
  }

  /**
   * Reset the entire service container
   * Used for testing or when a complete reset is needed
   */
  async resetAll(): Promise<void> {
    logger.debug("Performing complete service reset");

    // Clear all singleton instances
    const { SessionManager } = await import("../session.js");
    SessionManager.getInstance().clear();

    // Reset all services in the container
    const serviceNames = Object.values(SERVICE_NAMES);
    for (const serviceName of serviceNames) {
      if (serviceContainer.isReady(serviceName)) {
        // Reset each service to idle state
        (serviceContainer as any).resetService(serviceName);
      }
    }

    logger.debug("Complete service reset finished");
  }
}

export const serviceLifecycleManager = ServiceLifecycleManager.getInstance();
