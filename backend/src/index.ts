import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./configs/index.js";
import { logger } from "./utils/logger.js";

import authRoutes from "./routes/auth.js";
import fieldMappingRoutes from "./routes/fieldMapping.js";
import webhookRoutes from "./routes/webhooks.js";
import formRoutes from "./routes/forms.js";
import syncRoutes from "./routes/sync.js";
import homeRoute from "./routes/home.js";
import { connectDb } from "./db/index.js";

const app = express();

// ─── Security ───
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: [config.frontendUrl, /\.wix\.com$/, /\.wixsite\.com$/],
    credentials: true,
  })
);

// ─── Body parsers (must come first) ───
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Preserve raw body for webhooks ───
app.use(
  (req: Request & { rawBody?: string }, _res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/webhooks")) {
      req.rawBody = JSON.stringify(req.body);
    }
    next();
  }
);

// ─── Rate limiting ───
app.use(
  "/api/",
  rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(
  "/api/forms/",
  rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ─── Routes ───
app.use("", homeRoute);
app.use("/api/auth", authRoutes);
app.use("/api/field-mapping", fieldMappingRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/sync", syncRoutes);

// ─── Health check ───
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 ───
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error handler ───
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({ error: "Internal server error" });
});

// connect to DB before starting server
await connectDb();

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});

export default app;