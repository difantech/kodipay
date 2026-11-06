/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runMigrations } from './server/db/schema.ts';
import { authRouter } from './server/routes/auth.ts';
import { propertiesRouter } from './server/routes/properties.ts';
import { tenantsRouter } from './server/routes/tenants.ts';
import { billingRouter } from './server/routes/billing.ts';
import { paymentsRouter } from './server/routes/payments.ts';
import { receiptsRouter } from './server/routes/receipts.ts';
import { dashboardRouter } from './server/routes/dashboard.ts';
import { tenantPortalRouter } from './server/routes/tenant-portal.ts';
import { usersRouter } from './server/routes/users.ts';
import { reportsRouter } from './server/routes/reports.ts';
import { auditRouter } from './server/routes/audit.ts';
import { settingsRouter } from './server/routes/settings.ts';
import { notificationsRouter } from './server/routes/notifications.ts';
import { refundsRouter } from './server/routes/refunds.ts';
import { securityRouter } from './server/routes/security.ts';
import { wafMiddleware } from './server/middleware/waf.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedApp: express.Express | null = null;

export async function createApp(): Promise<express.Express> {
  if (cachedApp) {
    return cachedApp;
  }

  const app = express();
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  // Request parsing with safe payload limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Web Application Firewall (WAF) & Security Shield
  app.use(wafMiddleware);

  // Request logger for audit & observability
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${req.method}] ${req.path} -> ${res.statusCode} (${duration}ms)`);
      });
    }
    next();
  });

  // Apply PostgreSQL database migrations (Runs automatically on boot)
  try {
    await runMigrations();
  } catch (migErr: any) {
    console.error('Migration notice on startup:', migErr?.message || migErr);
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      system: 'KodiPay Rental Management Kenya',
      timezone: 'Africa/Nairobi',
      currency: 'KSh',
      database: process.env.DATABASE_URL ? 'Neon Serverless PostgreSQL' : 'Local Embedded PostgreSQL',
      timestamp: new Date().toISOString()
    });
  });

  // Register API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/tenants', tenantsRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/receipts', receiptsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/tenant-portal', tenantPortalRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/refunds', refundsRouter);
  app.use('/api/security', securityRouter);

  // Error handling middleware for API routes
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API Error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      timestamp: new Date().toISOString()
    });
  });

  // Frontend Serving (Vite Middlewares in Dev, Static in Prod)
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false, // Explicitly disable WebSocket HMR in middlewareMode to eliminate console errors
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      console.warn('Production build directory "dist" not found. Falling back to dynamic rendering.');
    }
  }

  cachedApp = app;
  return app;
}

// In local Node runtime or docker, start listening on PORT
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  createApp().then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`KodiPay Kenya Rental Payment System running on http://0.0.0.0:${PORT}`);
    });
  }).catch((err) => {
    console.error('Fatal failure starting KodiPay server:', err);
    process.exit(1);
  });
}

export default createApp;
