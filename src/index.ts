import express from "express";
import cors from "cors";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createShopifyServer } from "./server-factory.js";
import { v4 as uuidv4 } from "uuid";
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from "@shopify/shopify-api";
import { sessionStorage } from "./session-storage.js";

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
  
  // Shopify API Context
  // Users must set these if they want to use OAuth
  const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY || "invalid_key",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "invalid_secret",
    scopes: ["read_products", "read_orders"],
    hostName: process.env.HOST ? process.env.HOST.replace(/https?:\/\//, "") : "localhost:3000",
    apiVersion: ApiVersion.January25, 
    isEmbeddedApp: false,
  });

  // Bearer Token Auth Middleware (for MCP Client protection)
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Allow Auth handshake routes to pass without MCP token
    if (req.path.startsWith("/auth")) {
        return next();
    }

    const expectedToken = process.env.MCP_SERVER_TOKEN;
    if (!expectedToken) {
        console.warn("MCP_SERVER_TOKEN not set via environment. Endpoints are unprotected!");
        return next();
    }

    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;

    // Check Header OR Query Param
    const isHeaderValid = authHeader && authHeader === `Bearer ${expectedToken}`;
    const isQueryValid = queryToken && queryToken === expectedToken;

    if (!isHeaderValid && !isQueryValid) {
      console.log(`[Auth] Failed. Header: ${!!authHeader}, Query: ${!!queryToken}`);
      return res.status(401).json({ error: "Unauthorized" });
    }
    // console.log(`[Auth] Passed. Path: ${req.path}`);
    next();
  };

  // CSP Middleware for Embedded App Support
  app.use((req, res, next) => {
    // specific valid shopify domains for frame-ancestors
    // We allow admin.shopify.com and any myshopify.com domain
    res.setHeader(
      "Content-Security-Policy", 
      "frame-ancestors https://admin.shopify.com https://*.myshopify.com;"
    );
    next();
  });

  app.use(cors());
  app.use(express.json());

  // Store active transports by SessionID
  const transports = new Map<string, SSEServerTransport>();

  // START OAUTH ROUTES
  app.get("/", (req, res) => {
    const shop = req.query.shop as string;
    
    // Polaris-inspired UI
     const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Shopify MCP Server</title>
        <style>
            :root {
                --p-color-bg-surface: #fff;
                --p-color-bg-app: #f1f2f3;
                --p-color-text: #202223;
                --p-color-text-subdued: #6d7175;
                --p-color-border: #e1e3e5;
                --p-color-action: #008060;
                --p-border-radius: 8px;
                --p-space-4: 16px;
                --p-space-5: 20px;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: var(--p-color-bg-app);
                color: var(--p-color-text);
                margin: 0;
                padding: 20px;
                display: flex;
                justify-content: center;
            }
            .container {
                max-width: 900px;
                width: 100%;
            }
            .header {
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .header h1 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
            }
            .badge {
                background: #cbf4c9;
                color: #0e4e0d;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
            }
            .card {
                background: var(--p-color-bg-surface);
                border: 1px solid var(--p-color-border);
                border-radius: var(--p-border-radius);
                padding: var(--p-space-5);
                margin-bottom: var(--p-space-5);
                box-shadow: 0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15);
            }
            .card-title {
                font-size: 16px;
                font-weight: 600;
                margin-top: 0;
                margin-bottom: 16px;
            }
            .field-group {
                margin-bottom: 16px;
            }
            .label {
                display: block;
                font-size: 13px;
                margin-bottom: 4px;
                color: var(--p-color-text-subdued);
            }
            .input-wrapper {
                display: flex;
                gap: 8px;
            }
            .code-input {
                flex: 1;
                font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
                font-size: 14px;
                padding: 8px 12px;
                border: 1px solid var(--p-color-border);
                border-radius: 4px;
                background: #fafbfc;
                color: #202223;
            }
            .btn {
                cursor: pointer;
                background: white;
                border: 1px solid var(--p-color-border);
                border-radius: 4px;
                padding: 8px 16px;
                font-size: 14px;
                font-weight: 500;
                color: var(--p-color-text);
                transition: background 0.2s;
            }
            .btn:hover {
                background: #f6f6f7;
            }
            .btn-primary {
                background: var(--p-color-action);
                color: white;
                border: none;
            }
            .btn-primary:hover {
                background: #006e52;
            }
            .steps {
                counter-reset: step;
                list-style: none;
                padding: 0;
            }
            .step {
                position: relative;
                padding-left: 40px;
                margin-bottom: 16px;
            }
            .step::before {
                counter-increment: step;
                content: counter(step);
                position: absolute;
                left: 0;
                top: 0;
                width: 24px;
                height: 24px;
                background: var(--p-color-bg-app);
                border: 1px solid var(--p-color-border);
                border-radius: 50%;
                text-align: center;
                line-height: 24px;
                font-size: 12px;
                font-weight: 600;
            }
            .footer-link {
                color: var(--p-color-text-subdued);
                text-decoration: none;
                font-size: 13px;
                display: inline-block;
                margin-top: 20px;
            }
            .footer-link:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>MCP Server Connection</h1>
                <span class="badge">Active</span>
            </div>

            <div class="card">
                <h2 class="card-title">🔌 Connect your Agent</h2>
                <p style="margin-bottom: 20px; color: #5c5f62;">Use these credentials to connect <strong>n8n</strong> or any <strong>MCP Client</strong> to this store.</p>

                <div class="field-group">
                    <label class="label">SSE URL Endpoint</label>
                    <div class="input-wrapper">
                        <input type="text" class="code-input" value="${process.env.HOST}/sse" readonly id="url">
                        <button class="btn" onclick="copy('url')">Copy</button>
                    </div>
                </div>

                <div class="field-group">
                    <label class="label">Authorization Header</label>
                    <div class="input-wrapper">
                        <input type="text" class="code-input" value="Bearer ${process.env.MCP_SERVER_TOKEN || 'See Server Env'}" readonly id="auth">
                        <button class="btn" onclick="copy('auth')">Copy</button>
                    </div>
                </div>

                <div class="field-group">
                    <label class="label">Shop Header (X-Shopify-Domain)</label>
                    <div class="input-wrapper">
                        <input type="text" class="code-input" value="${shop || 'missing-shop-param'}" readonly id="shop">
                        <button class="btn" onclick="copy('shop')">Copy</button>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 class="card-title">📝 Setup Instructions</h2>
                <ol class="steps">
                    <li class="step">Open your n8n workflow or MCP Client configuration.</li>
                    <li class="step">Select <strong>SSE Client</strong> or generic HTTP Stream node.</li>
                    <li class="step">Paste the <strong>SSE URL</strong> from above.</li>
                    <li class="step">Add two headers:
                        <ul style="margin-top: 8px; color: #5c5f62;">
                            <li><code>Authorization</code>: Paste the Bearer token.</li>
                            <li><code>X-Shopify-Domain</code>: Paste the Shop domain.</li>
                        </ul>
                    </li>
                    <li class="step">Save and Connect! Your agent now has access to Products and Orders.</li>
                </ol>
            </div>
            
            <div style="text-align: center;">
                <a href="/debug" target="_blank" class="footer-link">View System Health & Debug Info →</a>
            </div>
        </div>

        <script>
            function copy(id) {
                const el = document.getElementById(id);
                el.select();
                navigator.clipboard.writeText(el.value);
                
                const btn = el.nextElementSibling;
                const original = btn.innerText;
                btn.innerText = 'Copied!';
                setTimeout(() => btn.innerText = original, 2000);
            }
        </script>
    </body>
    </html>
    `;
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

      res.send(`<h1>App Installed Successfully!</h1><p>Session stored for ${session.shop}. You can now connect via MCP using X-Shopify-Domain: ${session.shop} header.</p>`);
      console.log(`[OAuth] Session stored for ${session.shop}`);
    } catch (error: any) {
      console.error(error);
      res.status(500).send(`Auth failed: ${error.message}`);
    }
  });
  // END OAUTH ROUTES

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
        <h1>🚀 Shopify MCP Server Status</h1>
        
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

  // SSE Endpoint
  app.get("/sse", authMiddleware, async (req, res) => {
    console.log("New SSE connection...");
    
    // CRITICAL: Disable Nginx Buffering for SSE (Coolify/Docker)
    // We only set this. The SDK (SSEServerTransport) sets Content-Type, Connection, etc.
    // Do NOT call res.flushHeaders() here, or the SDK will crash with ERR_HTTP_HEADERS_SENT.
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Determine which Shopify Session to use
    // Option A: Env var (Single Tenant legacy)
    // Option B: Header (Multi-tenant)
    // Option C: Query Param (Fallback for clients without Header support)
    const targetShop = (req.headers['x-shopify-domain'] as string) || (req.query.shop as string);
    let shopifySession: Session | undefined;

    if (targetShop) {
        shopifySession = await sessionStorage.findSessionByShop(targetShop);
        if (!shopifySession) {
             console.warn(`[SSE] Requested shop ${targetShop} not found in session storage.`);
             // We might continue if they use Env var fallback inside the client...
        } else {
             console.log(`[SSE] Connected context to shop: ${targetShop}`);
        }
    }

    const transport = new SSEServerTransport("/message", res);
    
    // Pass session to factory (TODO: Update factory to accept session)
    // For now, factory uses Env var. We need to refactor factory next.
    const server = createShopifyServer(shopifySession);
    
    const sessionId = uuidv4();
    // Propagate token to the POST endpoint for clients that can't set headers (n8n/Browser)
    const queryToken = req.query.token as string;
    const authQuery = queryToken ? `&token=${queryToken}` : "";
    
    const sessionAwareTransport = new SSEServerTransport(`/message?sessionId=${sessionId}${authQuery}`, res);
    transports.set(sessionId, sessionAwareTransport);

    sessionAwareTransport.onclose = () => {
      console.log(`Connection closed: ${sessionId}`);
      transports.delete(sessionId);
    };

    await server.connect(sessionAwareTransport);
  });

  // Message Endpoint
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

  app.listen(port, () => {
    console.log(`Shopify MCP Server listening on port ${port} (HTTP/SSE)`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`OAuth URL: http://localhost:${port}/auth?shop=...`);
  });
}
