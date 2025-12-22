/**
 * GDPR Webhook Handlers
 * Mandatory for Shopify App Store compliance
 * 
 * These webhooks handle:
 * - customers/data_request: Customer requests their data
 * - customers/redact: Customer requests data deletion
 * - shop/redact: Store uninstalls app (cleanup all data)
 */

import express from "express";
import crypto from "crypto";
import { sessionStorage } from "../session-storage.js";

// Verify Shopify webhook signature
function verifyWebhookSignature(
  body: string, 
  hmacHeader: string, 
  secret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  );
}

/**
 * Middleware to verify Shopify webhook authenticity
 */
export const webhookAuthMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!hmac || !secret) {
    console.error('[Webhook] Missing HMAC or secret');
    return res.status(401).send('Unauthorized');
  }

  // Get raw body
  let rawBody = '';
  if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf8');
  } else {
    rawBody = JSON.stringify(req.body);
  }

  if (!verifyWebhookSignature(rawBody, hmac, secret)) {
    console.error('[Webhook] Invalid signature');
    return res.status(401).send('Unauthorized');
  }

  next();
};

/**
 * Handle customers/data_request
 * Customer wants to know what data we have about them
 * We respond with 200 and process offline
 */
export async function handleCustomersDataRequest(
  req: express.Request,
  res: express.Response
) {
  const payload = req.body;
  console.log('[GDPR] customers/data_request received:', JSON.stringify({
    shop_domain: payload.shop_domain,
    customer_id: payload.customer?.id,
    email: payload.customer?.email,
  }));

  // Our app stores:
  // - Session data (shop, accessToken, apiKey) - not customer-specific
  // - Usage counts - not customer-specific
  // We don't store any customer PII directly
  
  // Log for compliance tracking
  console.log('[GDPR] Data request noted. We do not store customer PII directly.');
  
  // Respond immediately - processing is offline
  res.status(200).send('OK');
}

/**
 * Handle customers/redact
 * Store owner requests customer data deletion
 * We respond with 200 and process offline
 */
export async function handleCustomersRedact(
  req: express.Request,
  res: express.Response
) {
  const payload = req.body;
  console.log('[GDPR] customers/redact received:', JSON.stringify({
    shop_domain: payload.shop_domain,
    customer_id: payload.customer?.id,
  }));

  // Our app doesn't store customer-specific data
  // All data is shop-level (sessions, usage, etc.)
  
  console.log('[GDPR] Customer redact noted. We do not store customer-specific data.');
  
  res.status(200).send('OK');
}

/**
 * Handle shop/redact
 * Shop owner uninstalled app - delete ALL shop data
 * Sent 48 hours after app uninstall
 */
export async function handleShopRedact(
  req: express.Request,
  res: express.Response
) {
  const payload = req.body;
  const shopDomain = payload.shop_domain;
  
  console.log('[GDPR] shop/redact received for:', shopDomain);

  if (shopDomain) {
    // Delete all session data for this shop
    const deleted = await sessionStorage.deleteSessionByShop(shopDomain);
    console.log(`[GDPR] Deleted session data for ${shopDomain}: ${deleted ? 'success' : 'not found'}`);
  }
  
  res.status(200).send('OK');
}

/**
 * Handle app/uninstalled webhook
 * Called immediately when app is uninstalled
 */
export async function handleAppUninstalled(
  req: express.Request,
  res: express.Response
) {
  const shopDomain = req.get('X-Shopify-Shop-Domain');
  
  console.log('[Webhook] app/uninstalled received for:', shopDomain);

  if (shopDomain) {
    // Mark session as inactive (don't delete yet - shop/redact will handle full deletion)
    // For now, we'll just log it
    console.log(`[Webhook] App uninstalled from ${shopDomain}. Awaiting shop/redact for data deletion.`);
  }
  
  res.status(200).send('OK');
}

/**
 * Register all GDPR webhook routes
 */
export function registerGDPRWebhooks(app: express.Application) {
  // Use raw body parser for webhook verification
  const rawBodyParser = express.raw({ type: 'application/json' });
  
  app.post('/webhooks/customers/data_request', 
    rawBodyParser,
    webhookAuthMiddleware,
    handleCustomersDataRequest
  );
  
  app.post('/webhooks/customers/redact',
    rawBodyParser,
    webhookAuthMiddleware,
    handleCustomersRedact
  );
  
  app.post('/webhooks/shop/redact',
    rawBodyParser,
    webhookAuthMiddleware,
    handleShopRedact
  );
  
  app.post('/webhooks/app/uninstalled',
    rawBodyParser,
    webhookAuthMiddleware,
    handleAppUninstalled
  );
  
  console.log('[Webhooks] GDPR and app lifecycle webhooks registered');
}
