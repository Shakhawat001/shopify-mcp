import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createShopifyServer } from "./server-factory.js";
import { v4 as uuidv4 } from "uuid";
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from "@shopify/shopify-api";
import { sessionStorage } from "./session-storage.js";
import { renderDashboard } from "./templates/dashboard.js";
import { renderNewDashboard } from "./templates/dashboard-new.js";
import { renderPrivacyPolicy, renderTermsOfService } from "./templates/legal.js";
import { authMiddleware, cspMiddleware } from "./middleware/auth.js";
import { createProSubscription, getCurrentSubscription, PRICING, formatPrice } from "./billing/billing.js";
import { registerGDPRWebhooks } from "./webhooks/gdpr.js";

// Check for Stdio mode (Default for local dev)
if (process.argv.includes("--stdio")) {
  startStdioServer();
} else {
  startHttpServer();
}

async function startStdioServer() {
  console.error("Starting Shopify MCP Server in STDIO mode...");
  // For stdio, we stick to the .env approach for now or need a way to pass session
  const server = createShopifyServer(); 
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Shopify MCP Server running on stdio");
}

async function startHttpServer() {
  const app = express();
  const port = process.env.PORT || 3000;
  
  // Essential middleware for OAuth cookie handling
  app.use(cookieParser());
  
  // Shopify API Context
  // Users must set these if they want to use OAuth
  const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY || "invalid_key",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "invalid_secret",
    scopes: ["read_products", "write_products", "read_orders"],
    hostName: process.env.HOST ? process.env.HOST.replace(/https?:\/\//, "") : "localhost:3000",
    apiVersion: ApiVersion.January25, 
    isEmbeddedApp: false,
  });

  // Use extracted middleware
  app.use(cspMiddleware);
  app.use(cors());
  
  // JSON body parser - EXCLUDE /mcp, /sse, and /webhooks endpoints
  // The MCP transports need to read raw body stream directly
  // Webhooks use their own raw body parser for HMAC verification
  app.use((req, res, next) => {
    if (req.path === '/mcp' || req.path === '/sse' || req.path === '/message' || req.path.startsWith('/webhooks')) {
      return next(); // Skip JSON parsing
    }
    express.json()(req, res, next);
  });

  // Register GDPR and app lifecycle webhooks (mandatory for App Store)
  registerGDPRWebhooks(app);

  // Store active transports by SessionID
  const transports = new Map<string, SSEServerTransport>();

  // START OAUTH ROUTES
  app.get("/", async (req, res) => {
    const shop = req.query.shop as string;
    const host = process.env.HOST || 'https://your-server.com';
    

    // Fetch session and usage stats for this shop
    let apiKey = '';
    let isAuthorized = false;
    let usageCount = 0;
    let usageLimit = 200;
    let plan: 'free' | 'pro' = 'free';
    
    if (shop) {
      const storedSession = await sessionStorage.findSessionByShop(shop);
      if (storedSession) {
        apiKey = storedSession.apiKey;
        isAuthorized = true;
        plan = storedSession.plan || 'free';
        usageCount = storedSession.usageCount || 0;
        usageLimit = plan === 'pro' ? -1 : 200;
      }
    }
    
    // Use new simplified dashboard
    const html = renderNewDashboard({
      host,
      shop: shop || null,
      apiKey,
      isAuthorized,
      usageCount,
      usageLimit,
      plan
    });
    
    res.send(html);
  });
  app.get("/auth", async (req, res) => {
    if (!req.query.shop) {
        return res.status(400).send("Missing shop parameter. e.g. /auth?shop=my-store.myshopify.com");
    }
    // Begin OAuth
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(req.query.shop as string, true)!,
      callbackPath: "/auth/callback",
      isOnline: false, // Offline session for background access
      rawRequest: req,
      rawResponse: res,
    });
  });

  app.get("/auth/callback", async (req, res) => {
    try {
      const callbackResponse = await shopify.auth.callback({
        rawRequest: req,
        rawResponse: res,
      });

      const session = callbackResponse.session;
      await sessionStorage.storeSession(session);

      // Redirect to dashboard with shop parameter so user sees their API key
      const host = process.env.HOST || '';
      res.redirect(`${host}/?shop=${session.shop}`);
      console.log(`[OAuth] Session stored for ${session.shop}, redirecting to dashboard`);
    } catch (error: any) {
      console.error(error);
      res.status(500).send(`Auth failed: ${error.message}`);
    }
  });
  // END OAUTH ROUTES

  // START BILLING ROUTES
  app.get("/billing", async (req, res) => {
    const shop = req.query.shop as string;
    if (!shop) {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    const stats = await sessionStorage.getUsageStats(shop);
    if (!stats) {
      return res.status(404).json({ error: "Shop not found. Complete OAuth first." });
    }

    const session = await sessionStorage.findSessionByShop(shop);
    
    res.json({
      plan: stats.plan,
      displayName: stats.plan === 'pro' ? 'Pro' : 'Free',
      price: stats.plan === 'pro' ? formatPrice('pro') : 'Free',
      usage: {
        current: stats.usageCount,
        limit: stats.limit === -1 ? 'Unlimited' : stats.limit,
        resetDate: stats.resetDate,
      },
      upgrade: stats.plan === 'free' ? {
        available: true,
        url: `/billing/subscribe?shop=${shop}`,
        price: formatPrice('pro'),
      } : null,
    });
  });

  app.get("/billing/subscribe", async (req, res) => {
    const shop = req.query.shop as string;
    if (!shop) {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    const session = await sessionStorage.findSessionByShop(shop);
    if (!session) {
      return res.status(404).json({ error: "Shop not found. Complete OAuth first." });
    }

    const host = process.env.HOST || '';
    const returnUrl = `${host}/billing/callback?shop=${shop}`;
    
    const result = await createProSubscription(shop, session.accessToken, returnUrl);
    
    if (!result) {
      return res.status(500).json({ error: "Failed to create subscription" });
    }

    // Redirect merchant to Shopify to approve charge
    console.log(`[Billing] Created subscription for ${shop}, redirecting to Shopify approval`);
    res.redirect(result.confirmationUrl);
  });

  app.get("/billing/callback", async (req, res) => {
    const shop = req.query.shop as string;
    const chargeId = req.query.charge_id as string;
    
    if (!shop) {
      return res.status(400).send("Missing shop parameter");
    }

    const session = await sessionStorage.findSessionByShop(shop);
    if (!session) {
      return res.status(404).send("Shop not found");
    }

    // Check if subscription was approved
    const subscription = await getCurrentSubscription(shop, session.accessToken);
    
    if (subscription && subscription.status === 'ACTIVE') {
      // Update plan in our storage
      await sessionStorage.updatePlan(shop, 'pro', subscription.id);
      console.log(`[Billing] Pro subscription activated for ${shop}`);
      
      const host = process.env.HOST || '';
      res.redirect(`${host}/?shop=${shop}&upgraded=true`);
    } else {
      // Subscription was declined
      console.log(`[Billing] Subscription declined for ${shop}`);
      const host = process.env.HOST || '';
      res.redirect(`${host}/?shop=${shop}&upgrade_failed=true`);
    }
  });
  // END BILLING ROUTES

  // Legal Pages (required for App Store)
  app.get("/privacy", (req, res) => {
    res.send(renderPrivacyPolicy());
  });

  app.get("/terms", (req, res) => {
    res.send(renderTermsOfService());
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", mode: "http", clients: transports.size });
  });

  app.get("/debug", (req, res) => {
    const memUsage = process.memoryUsage();
    
    // Mask secrets
    const mask = (str?: string) => str ? `${str.substring(0, 4)}...${str.substring(str.length - 4)}` : "NOT_SET";
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Shopify MCP Server Debug</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f4f6f8; color: #202223; }
            .card { background: white; border: 1px solid #e1e3e5; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            h2 { margin-top: 0; color: #008060; }
            .ok { color: #008060; font-weight: bold; }
            .err { color: #d82c0d; font-weight: bold; }
            pre { background: #fafbfc; padding: 10px; border-radius: 4px; overflow-x: auto; }
            table { width: 100%; border-collapse: collapse; }
            td, th { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
        </style>
    </head>
    <body>
        <h1>Shopify MCP Server Status</h1>
        
        <div class="card">
            <h2>System Health</h2>
            <table>
                <tr><td>Running Since</td><td>${new Date().toISOString()}</td></tr>
                <tr><td>Active MCP Clients (SSE)</td><td>${transports.size}</td></tr>
                <tr><td>Memory (Heap Used)</td><td>${Math.round(memUsage.heapUsed / 1024 / 1024)} MB</td></tr>
                <tr><td>Node Version</td><td>${process.version}</td></tr>
            </table>
        </div>

        <div class="card">
            <h2>Configuration Check</h2>
            <table>
                <tr><td>HOST</td><td>${process.env.HOST || "<span class='err'>MISSING</span>"}</td></tr>
                <tr><td>SHOPIFY_API_KEY</td><td>${process.env.SHOPIFY_API_KEY ? `<span class='ok'>SET</span> (${process.env.SHOPIFY_API_KEY})` : "<span class='err'>MISSING</span>"}</td></tr>
                <tr><td>SHOPIFY_API_SECRET</td><td>${process.env.SHOPIFY_API_SECRET ? "<span class='ok'>SET</span> (Hidden)" : "<span class='err'>MISSING</span>"}</td></tr>
                <tr><td>MCP_SERVER_TOKEN</td><td>${process.env.MCP_SERVER_TOKEN ? "<span class='ok'>SET</span> (Hidden)" : "<span class='err'>MISSING</span>"}</td></tr>
                <tr><td>Port</td><td>${port} (External Env: ${process.env.SERVER_PORT || "Default"})</td></tr>
            </table>
        </div>

        <div class="card">
            <h2>Actions</h2>
            <p>
                <a href="/auth?shop=YOUR_SHOP_DOMAIN.myshopify.com" target="_blank" style="background: #008060; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Test OAuth Flow</a>
                <span style="color: #6d7175; font-size: 0.9em;">(Replace YOUR_SHOP_DOMAIN in URL)</span>
            </p>
        </div>
    </body>
    </html>
    `;
    res.send(html);
  });

  // MCP Test Endpoint - Simple test for verifying MCP connectivity
  app.post("/mcp-test", authMiddleware, async (req, res) => {
    console.log("=== MCP-TEST REQUEST ===");
    console.log("[MCP-TEST] Headers:", JSON.stringify({
      'authorization': req.headers['authorization'] ? 'Bearer *** (present)' : 'MISSING',
      'x-shopify-domain': req.headers['x-shopify-domain'] || 'MISSING',
      'content-type': req.headers['content-type'],
    }, null, 2));
    console.log("[MCP-TEST] Body:", JSON.stringify(req.body, null, 2));
    console.log("========================");

    // Session is already attached by authMiddleware
    const shopifySession = (req as any).shopifySession;

    res.json({
      success: true,
      message: "MCP server is reachable and authentication passed!",
      details: {
        authValid: true,
        shopDomain: shopifySession?.shop || "not found",
        shopifySessionFound: !!shopifySession,
        serverTime: new Date().toISOString(),
        mcpEndpoint: `${process.env.HOST}/mcp`,
        sseEndpoint: `${process.env.HOST}/sse`,
      },
      nextSteps: [
        "Your connection is ready! Configure your MCP client to use the endpoints above."
      ]
    });
  });

  // SSE Endpoint (Legacy - still supported for backward compatibility)
  app.get("/sse", authMiddleware, async (req, res) => {
    // === ENHANCED DEBUGGING FOR n8n TROUBLESHOOTING ===
    console.log("=== NEW SSE CONNECTION ===");
    console.log("[SSE] Time:", new Date().toISOString());
    console.log("[SSE] Headers:", JSON.stringify({
      'user-agent': req.headers['user-agent'],
      'accept': req.headers['accept'],
      'x-shopify-domain': req.headers['x-shopify-domain'],
      'authorization': req.headers['authorization'] ? 'Bearer ***' : 'NOT_SET',
    }, null, 2));
    console.log("[SSE] Query:", JSON.stringify(req.query, null, 2));
    console.log("===========================");
    
    // CRITICAL: Headers for SSE compatibility with reverse proxies (Coolify/Traefik/Nginx)
    res.setHeader('X-Accel-Buffering', 'no');           // Disable Nginx buffering
    res.setHeader('Cache-Control', 'no-cache, no-transform'); // Prevent caching
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Security header
    
    // Session is attached by authMiddleware
    const shopifySession = (req as any).shopifySession;
    console.log(`[SSE] Connected context to shop: ${shopifySession?.shop || 'unknown'}`);

    const server = createShopifyServer(shopifySession);
    
    const sessionId = uuidv4();
    const queryToken = req.query.token as string;
    const authQuery = queryToken ? `&token=${queryToken}` : "";
    
    const sessionAwareTransport = new SSEServerTransport(`/message?sessionId=${sessionId}${authQuery}`, res);
    transports.set(sessionId, sessionAwareTransport);
    
    console.log(`[SSE] Session created: ${sessionId}`);

    sessionAwareTransport.onclose = () => {
      console.log(`[SSE] Connection closed: ${sessionId}`);
      transports.delete(sessionId);
    };

    try {
      await server.connect(sessionAwareTransport);
      console.log(`[SSE] Server connected successfully for session: ${sessionId}`);
    } catch (error: any) {
      console.error(`[SSE] Connection error for session ${sessionId}:`, error.message);
    }
  });

  // Message Endpoint (for SSE transport)
  app.post("/message", authMiddleware, async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).send("Missing sessionId parameter");
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      return res.status(404).send("Session not found");
    }
    await transport.handlePostMessage(req, res);
  });

  // ============================================================
  // NEW: Streamable HTTP Transport Endpoint (Recommended by MCP spec)
  // This is the modern transport that n8n and other clients prefer
  // ============================================================
  const mcpSessions = new Map<string, { 
    server: ReturnType<typeof createShopifyServer>, 
    transport: InstanceType<typeof StreamableHTTPServerTransport>,
    lastAccess: number 
  }>();
  
  // Session cleanup interval (every 5 minutes, expire sessions after 30 minutes)
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of mcpSessions.entries()) {
      if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
        console.log(`[MCP] Session expired: ${sessionId}`);
        mcpSessions.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
  
  app.all("/mcp", authMiddleware, async (req, res) => {
    console.log("=== NEW MCP STREAMABLE CONNECTION ===");
    console.log("[MCP] Time:", new Date().toISOString());
    console.log("[MCP] Method:", req.method);
    console.log("[MCP] Headers:", JSON.stringify({
      'user-agent': req.headers['user-agent'],
      'accept': req.headers['accept'],
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? 'Bearer ***' : 'MISSING',
      'x-shopify-domain': req.headers['x-shopify-domain'],
      'mcp-session-id': req.headers['mcp-session-id'],
    }, null, 2));
    
    // Log request body for debugging
    if (req.body) {
      console.log("[MCP] Body:", JSON.stringify(req.body, null, 2));
    }
    console.log("=====================================");
    
    // Headers for reverse proxy compatibility
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    
    // Get session ID from header
    const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;
    
    // Session is attached by authMiddleware
    const shopifySession = (req as any).shopifySession;
    if (shopifySession) {
      console.log(`[MCP] Using Shopify session for: ${shopifySession.shop}`);
    }
    
    // Handle different HTTP methods
    if (req.method === 'POST') {
      // Check for existing session
      if (sessionIdHeader && mcpSessions.has(sessionIdHeader)) {
        console.log(`[MCP] Reusing existing session: ${sessionIdHeader}`);
        const session = mcpSessions.get(sessionIdHeader)!;
        session.lastAccess = Date.now(); // Update last access time
        
        try {
          await session.transport.handleRequest(req, res);
          console.log(`[MCP] Request handled for session: ${sessionIdHeader}`);
        } catch (error: any) {
          console.error(`[MCP] Request error for session ${sessionIdHeader}:`, error.message);
          if (!res.headersSent) {
            res.status(500).json({ 
              jsonrpc: "2.0",
              error: { code: -32603, message: error.message },
              id: null
            });
          }
        }
        return;
      }
      
      // Create new session for initialize request
      const newSessionId = uuidv4();
      console.log(`[MCP] Creating new session: ${newSessionId}`);
      
      const server = createShopifyServer(shopifySession);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });
      
      // Store session with timestamp
      mcpSessions.set(newSessionId, { 
        server, 
        transport, 
        lastAccess: Date.now() 
      });
      
      console.log(`[MCP] Total active sessions: ${mcpSessions.size}`);
      
      try {
        await server.connect(transport);
        console.log(`[MCP] Server connected for session: ${newSessionId}`);
        
        await transport.handleRequest(req, res);
        console.log(`[MCP] Initial request handled for session: ${newSessionId}`);
        
        // Send session ID in response header for client to use in subsequent requests
        if (!res.headersSent) {
          res.setHeader('mcp-session-id', newSessionId);
        }
      } catch (error: any) {
        console.error(`[MCP] Session error for ${newSessionId}:`, error.message, error.stack);
        mcpSessions.delete(newSessionId);
        if (!res.headersSent) {
          res.status(500).json({ 
            jsonrpc: "2.0",
            error: { code: -32603, message: error.message },
            id: null
          });
        }
      }
    } else if (req.method === 'GET') {
      // For GET requests, check if client wants SSE upgrade or just info
      const acceptHeader = req.headers['accept'] || '';
      
      if (acceptHeader.includes('text/event-stream')) {
        // Client wants SSE - redirect them
        console.log(`[MCP] GET with SSE accept header - recommend /sse endpoint`);
        res.status(200).json({ 
          message: "For SSE transport, please use the /sse endpoint",
          sse_endpoint: `${process.env.HOST}/sse`,
          mcp_endpoint: `${process.env.HOST}/mcp (POST)`
        });
      } else {
        // Return endpoint info
        res.status(200).json({ 
          protocol: "MCP",
          transport: "Streamable HTTP",
          usage: "Send POST requests with JSON-RPC body",
          sse_alternative: `${process.env.HOST}/sse`,
          active_sessions: mcpSessions.size
        });
      }
    } else if (req.method === 'DELETE') {
      // Session cleanup
      if (sessionIdHeader && mcpSessions.has(sessionIdHeader)) {
        mcpSessions.delete(sessionIdHeader);
        console.log(`[MCP] Session deleted: ${sessionIdHeader}`);
        res.status(200).json({ success: true });
      } else {
        res.status(404).json({ error: "Session not found" });
      }
    } else if (req.method === 'OPTIONS') {
      // CORS preflight
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Shopify-Domain, mcp-session-id');
      res.status(204).send();
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  });

  app.listen(port, () => {
    console.log(`Shopify MCP Server listening on port ${port} (HTTP/SSE/Streamable)`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`SSE Endpoint: http://localhost:${port}/sse`);
    console.log(`MCP Endpoint: http://localhost:${port}/mcp`);
    console.log(`OAuth URL: http://localhost:${port}/auth?shop=...`);
  });
}
