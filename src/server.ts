// Load environment variables first
import "./config/env";

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectDatabase } from "./config/database";
import { logger } from "./config/logger";

// Import routes
import authRoutes from "./routes/auth";
import walletRoutes from "./routes/wallet";
import insightIqRoutes from "./routes/insightiq";
import onboardingRoutes from "./routes/onboarding";
import whitelistRoutes from "./routes/whitelist";
import veriffRoutes from "./routes/veriff";

class Server {
  private app: Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = Number(process.env.PORT) || 3001;

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      })
    );

    // CORS configuration - Allow all origins for now and others
    this.app.use(
      cors({
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      })
    );

    // Rate limiting
    const limiter = rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        success: false,
        message: "Too many requests from this IP, please try again later.",
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use("/api/", limiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({
        success: true,
        message: "Diamondz Backend API is running",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
      });
    });

    // API routes
    this.app.use("/api/auth", authRoutes);
    this.app.use("/api/wallet", walletRoutes);
    this.app.use("/api/insightiq", insightIqRoutes);
    this.app.use("/api/onboarding", onboardingRoutes);
    this.app.use("/api/whitelist", whitelistRoutes);
    this.app.use("/api/veriff", veriffRoutes);

    // 404 handler for unknown routes
    this.app.use("*", (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.originalUrl,
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use(
      (error: Error, req: Request, res: Response, next: NextFunction) => {
        logger.error("Unhandled error:", {
          error: error.message,
          stack: error.stack,
          url: req.url,
          method: req.method,
          ip: req.ip,
        });

        res.status(500).json({
          success: false,
          message: "Internal server error",
          ...(process.env.NODE_ENV === "development" && {
            error: error.message,
            stack: error.stack,
          }),
        });
      }
    );

    // Graceful shutdown handling
    process.on("SIGTERM", this.gracefulShutdown.bind(this));
    process.on("SIGINT", this.gracefulShutdown.bind(this));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error: Error) => {
      logger.error("Uncaught Exception:", error);
      this.gracefulShutdown();
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);
      console.error("UNHANDLED PROMISE REJECTION:", reason);
      // Don't exit in development mode to allow for debugging
      if (process.env.NODE_ENV === "production") {
        this.gracefulShutdown();
      }
    });
  }

  private server: any;

  private gracefulShutdown(): void {
    logger.info("Starting graceful shutdown...");

    if (this.server) {
      this.server.close(() => {
        logger.info("Server closed");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await connectDatabase();

      // Start server
      this.server = this.app.listen(this.port, () => {
        logger.info(`🚀 Diamondz Backend Server running on port ${this.port}`);
        logger.info(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
        logger.info(`🔗 Health check: http://localhost:${this.port}/health`);

        if (process.env.NODE_ENV === "development") {
          logger.info(
            `🛠️  API Documentation: http://localhost:${this.port}/api`
          );
        }

        logger.info("✅ Server startup completed successfully");
      });

      this.server.on("error", (error: any) => {
        logger.error("Server error:", error);
      });

      // Add a small delay to see if something happens after startup
      setTimeout(() => {
        logger.info("🔍 Server is still running after startup");
      }, 2000);
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  public getApp(): Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start().catch((error) => {
    logger.error("Server startup failed:", error);
    process.exit(1);
  });
}

export default Server;
