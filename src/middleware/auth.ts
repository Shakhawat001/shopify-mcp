/**
 * Authentication Middleware
 * Authenticates MCP requests using per-store API keys
 */

import express from "express";
import { sessionStorage, StoredSession } from "../session-storage.js";

// Extend Express Request to include shopifySession
declare global {
  namespace Express {
    interface Request {
      shopifySession?: StoredSession;
    }
  }
}

/**
 * API Key Authentication Middleware
 * - Allows auth routes and public endpoints to pass
 * - Requires Bearer token for all MCP endpoints
 * - Attaches session to req.shopifySession for use in handlers
 */
export const authMiddleware = async (
  req: express.Request, 
  res: express.Response, 
  next: express.NextFunction
) => {
  // Allow Auth handshake routes to pass
  if (req.path.startsWith("/auth")) {
    return next();
  }
  
  // Allow public endpoints
  if (req.path === "/" || req.path === "/health" || req.path === "/debug") {
    return next();
  }

  // Extract API key from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[Auth] Missing or invalid Authorization header. Path: ${req.path}`);
    return res.status(401).json({ 
      error: "Missing API key",
      hint: "Provide Authorization: Bearer <your-api-key> header"
    });
  }

  const apiKey = authHeader.substring(7); // Remove "Bearer " prefix
  
  // Find session by API key
  const session = await sessionStorage.findSessionByApiKey(apiKey);
  
  if (!session) {
    console.log(`[Auth] Invalid API key: ${apiKey.substring(0, 12)}...`);
    return res.status(401).json({ 
      error: "Invalid API key",
      hint: "Check your API key or reinstall the app"
    });
  }

  // Attach session to request for later use
  req.shopifySession = session;
  console.log(`[Auth] Authenticated via API key for: ${session.shop}`);
  next();
};

/**
 * CSP Middleware for Embedded App Support
 * Sets Content-Security-Policy headers to allow Shopify Admin iframe embedding
 */
export const cspMiddleware = (
  req: express.Request, 
  res: express.Response, 
  next: express.NextFunction
) => {
  res.setHeader(
    "Content-Security-Policy", 
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com;"
  );
  next();
};
