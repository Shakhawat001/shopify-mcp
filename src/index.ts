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

  // API Key Auth Middleware
  // Authenticates MCP requests using per-store API keys
  const authMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    (req as any).shopifySession = session;
    console.log(`[Auth] Authenticated via API key for: ${session.shop}`);
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
  
  // JSON body parser - EXCLUDE /mcp and /sse endpoints
  // The MCP transports need to read raw body stream directly
  app.use((req, res, next) => {
    if (req.path === '/mcp' || req.path === '/sse' || req.path === '/message') {
      return next(); // Skip JSON parsing for MCP endpoints
    }
    express.json()(req, res, next);
  });

  // Store active transports by SessionID
  const transports = new Map<string, SSEServerTransport>();

  // START OAUTH ROUTES
  app.get("/", async (req, res) => {
    const shop = req.query.shop as string;
    const host = process.env.HOST || 'https://your-server.com';
    
    // Fetch API key for this shop if they've completed OAuth
    let apiKey = '';
    let isAuthorized = false;
    if (shop) {
      const storedSession = await sessionStorage.findSessionByShop(shop);
      if (storedSession) {
        apiKey = storedSession.apiKey;
        isAuthorized = true;
      }
    }
    
    // Comprehensive Polaris-inspired Dashboard
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Shopify MCP Server - Connect Your AI Agent</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --p-color-bg-surface: #ffffff;
                --p-color-bg-app: #f6f6f7;
                --p-color-bg-subdued: #fafbfb;
                --p-color-bg-success: #aee9d1;
                --p-color-bg-info: #a4e8f2;
                --p-color-bg-warning: #ffea8a;
                --p-color-text: #202223;
                --p-color-text-subdued: #6d7175;
                --p-color-text-success: #0d5c2f;
                --p-color-border: #e1e3e5;
                --p-color-border-subdued: #f0f1f2;
                --p-color-action-primary: #008060;
                --p-color-action-primary-hover: #006e52;
                --p-color-action-secondary: #5c5f62;
                --p-border-radius-base: 8px;
                --p-border-radius-lg: 12px;
                --p-shadow-card: 0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15);
                --p-shadow-popover: 0 3px 6px -3px rgba(23, 24, 24, 0.08), 0 8px 20px -4px rgba(23, 24, 24, 0.12);
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: var(--p-color-bg-app);
                color: var(--p-color-text);
                line-height: 1.5;
                min-height: 100vh;
            }
            .page-header {
                background: linear-gradient(135deg, #008060 0%, #004c3f 100%);
                color: white;
                padding: 40px 20px;
                text-align: center;
            }
            .page-header h1 {
                font-size: 28px;
                font-weight: 700;
                margin-bottom: 8px;
            }
            .page-header p {
                opacity: 0.9;
                font-size: 16px;
                max-width: 600px;
                margin: 0 auto;
            }
            .status-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: rgba(255,255,255,0.2);
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 13px;
                margin-top: 16px;
            }
            .status-dot {
                width: 8px;
                height: 8px;
                background: #aee9d1;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            .container {
                max-width: 1000px;
                margin: 0 auto;
                padding: 24px 20px 60px;
            }
            .card {
                background: var(--p-color-bg-surface);
                border: 1px solid var(--p-color-border);
                border-radius: var(--p-border-radius-lg);
                box-shadow: var(--p-shadow-card);
                margin-bottom: 20px;
                overflow: hidden;
            }
            .card-header {
                padding: 20px 24px;
                border-bottom: 1px solid var(--p-color-border-subdued);
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .card-header h2 {
                font-size: 18px;
                font-weight: 600;
                flex: 1;
            }
            .card-icon {
                width: 40px;
                height: 40px;
                background: var(--p-color-bg-subdued);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .card-icon svg {
                width: 20px;
                height: 20px;
                color: var(--p-color-action-primary);
            }
            .card-body { padding: 24px; }
            
            /* Credentials Section */
            .credentials-grid {
                display: grid;
                gap: 16px;
            }
            .credential-item {
                background: var(--p-color-bg-subdued);
                border: 1px solid var(--p-color-border);
                border-radius: var(--p-border-radius-base);
                padding: 16px;
            }
            .credential-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--p-color-text-subdued);
                margin-bottom: 8px;
            }
            .credential-value {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .credential-input {
                flex: 1;
                font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
                font-size: 14px;
                padding: 10px 12px;
                border: 1px solid var(--p-color-border);
                border-radius: 6px;
                background: white;
                color: var(--p-color-text);
            }
            .credential-input:focus {
                outline: none;
                border-color: var(--p-color-action-primary);
                box-shadow: 0 0 0 2px rgba(0, 128, 96, 0.2);
            }
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 10px 16px;
                font-size: 14px;
                font-weight: 500;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.15s ease;
                border: none;
            }
            .btn-primary {
                background: var(--p-color-action-primary);
                color: white;
            }
            .btn-primary:hover { background: var(--p-color-action-primary-hover); }
            .btn-secondary {
                background: white;
                color: var(--p-color-text);
                border: 1px solid var(--p-color-border);
            }
            .btn-secondary:hover { background: var(--p-color-bg-subdued); }
            .btn-sm { padding: 8px 12px; font-size: 13px; }
            
            /* Tabs */
            .tabs {
                display: flex;
                gap: 4px;
                padding: 4px;
                background: var(--p-color-bg-subdued);
                border-radius: var(--p-border-radius-base);
                margin-bottom: 20px;
                overflow-x: auto;
            }
            .tab {
                flex: 1;
                min-width: 120px;
                padding: 10px 16px;
                font-size: 14px;
                font-weight: 500;
                background: transparent;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                color: var(--p-color-text-subdued);
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            .tab:hover { color: var(--p-color-text); }
            .tab.active {
                background: white;
                color: var(--p-color-text);
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
            
            /* Tutorial Steps */
            .tutorial-steps {
                counter-reset: step;
            }
            .tutorial-step {
                display: flex;
                gap: 16px;
                padding: 20px 0;
                border-bottom: 1px solid var(--p-color-border-subdued);
            }
            .tutorial-step:last-child { border-bottom: none; }
            .step-number {
                flex-shrink: 0;
                width: 32px;
                height: 32px;
                background: var(--p-color-action-primary);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 600;
            }
            .step-content { flex: 1; }
            .step-title {
                font-size: 15px;
                font-weight: 600;
                margin-bottom: 6px;
            }
            .step-description {
                font-size: 14px;
                color: var(--p-color-text-subdued);
                margin-bottom: 12px;
            }
            .step-code {
                background: #1e1e1e;
                color: #d4d4d4;
                padding: 12px 16px;
                border-radius: 6px;
                font-family: 'SF Mono', 'Consolas', monospace;
                font-size: 13px;
                overflow-x: auto;
                position: relative;
            }
            .step-code .copy-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                background: rgba(255,255,255,0.1);
                border: none;
                color: #999;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
            }
            .step-code .copy-btn:hover { background: rgba(255,255,255,0.2); color: white; }
            .step-image {
                max-width: 100%;
                border: 1px solid var(--p-color-border);
                border-radius: 8px;
                margin-top: 12px;
            }
            
            /* Info Boxes */
            .info-box {
                display: flex;
                gap: 12px;
                padding: 16px;
                border-radius: var(--p-border-radius-base);
                margin: 16px 0;
            }
            .info-box.success {
                background: #f1f8f5;
                border: 1px solid #aee9d1;
            }
            .info-box.info {
                background: #f0f9fa;
                border: 1px solid #a4e8f2;
            }
            .info-box.warning {
                background: #fffbeb;
                border: 1px solid #ffea8a;
            }
            .info-box-icon { font-size: 20px; }
            .info-box-content { flex: 1; }
            .info-box-title {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 4px;
            }
            .info-box-text {
                font-size: 13px;
                color: var(--p-color-text-subdued);
            }
            
            /* Platform Cards */
            .platform-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 16px;
                margin-bottom: 20px;
            }
            .platform-card {
                background: var(--p-color-bg-surface);
                border: 1px solid var(--p-color-border);
                border-radius: var(--p-border-radius-base);
                padding: 20px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .platform-card:hover {
                border-color: var(--p-color-action-primary);
                box-shadow: 0 0 0 1px var(--p-color-action-primary);
            }
            .platform-card.selected {
                border-color: var(--p-color-action-primary);
                background: #f1f8f5;
            }
            .platform-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 8px;
            }
            .platform-logo {
                width: 40px;
                height: 40px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
            }
            .platform-name {
                font-size: 16px;
                font-weight: 600;
            }
            .platform-type {
                font-size: 12px;
                color: var(--p-color-text-subdued);
            }
            .platform-desc {
                font-size: 13px;
                color: var(--p-color-text-subdued);
            }
            
            /* Footer */
            .footer {
                text-align: center;
                padding: 20px;
                color: var(--p-color-text-subdued);
                font-size: 13px;
            }
            .footer a {
                color: var(--p-color-action-primary);
                text-decoration: none;
            }
            .footer a:hover { text-decoration: underline; }
            
            /* Responsive */
            @media (max-width: 640px) {
                .page-header { padding: 24px 16px; }
                .page-header h1 { font-size: 22px; }
                .container { padding: 16px; }
                .card-header, .card-body { padding: 16px; }
                .tabs { flex-wrap: wrap; }
                .tab { min-width: auto; flex: none; }
            }
        </style>
    </head>
    <body>
        <div class="page-header">
            <h1>Shopify MCP Server</h1>
            <p>Connect AI agents to your Shopify store and automate product management, order tracking, and more!</p>
            <div class="status-pill">
                <span class="status-dot"></span>
                Server Active & Ready
            </div>
        </div>
        
        <div class="container">
            <!-- YOUR CREDENTIALS -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg></div>
                    <h2>Your Connection Credentials</h2>
                </div>
                <div class="card-body">
                    <p style="color: var(--p-color-text-subdued); margin-bottom: 20px;">
                        These are your unique credentials. You'll need them to connect any AI agent or automation tool to your store.
                    </p>
                    
                    <div class="credentials-grid">
                        <div class="credential-item">
                            <div class="credential-label">
                                Server URL (MCP Endpoint)
                            </div>
                            <div class="credential-value">
                                <input type="text" class="credential-input" value="${host}/mcp" readonly id="cred-url">
                                <button class="btn btn-secondary btn-sm" onclick="copyCredential('cred-url')">Copy</button>
                            </div>
                            <small style="color: var(--p-color-text-subdued); display: block; margin-top: 8px;">
                                Recommended for n8n, Make, and most automation tools
                            </small>
                        </div>
                        
                        <div class="credential-item">
                            <div class="credential-label">
                                Alternative URL (SSE Endpoint)
                            </div>
                            <div class="credential-value">
                                <input type="text" class="credential-input" value="${host}/sse" readonly id="cred-sse">
                                <button class="btn btn-secondary btn-sm" onclick="copyCredential('cred-sse')">Copy</button>
                            </div>
                            <small style="color: var(--p-color-text-subdued); display: block; margin-top: 8px;">
                                Use this if the main URL doesn't work with your tool
                            </small>
                        </div>
                        
                        <div class="credential-item">
                            <div class="credential-label">
                                Your Shop Domain
                            </div>
                            <div class="credential-value">
                                <input type="text" class="credential-input" value="${shop || 'your-store.myshopify.com'}" readonly id="cred-shop">
                                <button class="btn btn-secondary btn-sm" onclick="copyCredential('cred-shop')">Copy</button>
                            </div>
                            <small style="color: var(--p-color-text-subdued); display: block; margin-top: 8px;">
                                This identifies which Shopify store to connect to. Use as X-Shopify-Domain header.
                            </small>
                        </div>
                    </div>
                    
                    <div class="info-box success" style="margin-top: 20px;">
                        <div class="info-box-icon" style="background: #aee9d1; color: #0d5c2f; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">i</div>
                        <div class="info-box-content">
                            <div class="info-box-title">OAuth Authentication</div>
                            <div class="info-box-text">No API token needed! Your store is authenticated via OAuth. Just provide your shop domain in requests.</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- CHOOSE YOUR PLATFORM -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg></div>
                    <h2>Connect Your AI Tool</h2>
                </div>
                <div class="card-body">
                    <p style="color: var(--p-color-text-subdued); margin-bottom: 20px;">
                        Select your platform below to see step-by-step instructions:
                    </p>
                    
                    <div class="tabs">
                        <button class="tab active" onclick="showTab('n8n')">n8n</button>
                        <button class="tab" onclick="showTab('make')">Make (Zapier)</button>
                        <button class="tab" onclick="showTab('cursor')">Cursor IDE</button>
                        <button class="tab" onclick="showTab('vscode')">VS Code</button>
                        <button class="tab" onclick="showTab('claude')">Claude Desktop</button>
                        <button class="tab" onclick="showTab('other')">Other Tools</button>
                    </div>
                    
                    <!-- n8n Instructions -->
                    <div id="tab-n8n" class="tab-content active">
                        <div class="info-box info">
                            <div class="info-box-icon" style="background: #a4e8f2; color: #0d5c5c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">i</div>
                            <div class="info-box-content">
                                <div class="info-box-title">What is n8n?</div>
                                <div class="info-box-text">n8n is a workflow automation tool that lets you connect different apps and services. With this integration, n8n can read your products, create new ones, and more!</div>
                            </div>
                        </div>
                        
                        <div class="tutorial-steps">
                            <div class="tutorial-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <div class="step-title">Open n8n and Create a New Workflow</div>
                                    <div class="step-description">Log into your n8n instance and click the "+" button to create a new workflow.</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <div class="step-title">Add the "AI Agent" Node</div>
                                    <div class="step-description">Click the "+" button in the workflow, search for "AI Agent", and add it to your workflow.</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <div class="step-title">Add the "MCP Client" Tool</div>
                                    <div class="step-description">In the AI Agent settings, click "Add Tool" and select "MCP Client Tool".</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">4</div>
                                <div class="step-content">
                                    <div class="step-title">Configure the MCP Client</div>
                                    <div class="step-description">Enter these values in the MCP Client settings:</div>
                                    <div class="step-code">
                                        <div><strong style="color: #9cdcfe;">SSE Endpoint:</strong> <span style="color: #ce9178;">${host}/sse</span></div>
                                        <div style="margin-top: 8px;"><strong style="color: #9cdcfe;">Authentication:</strong> <span style="color: #ce9178;">Bearer Token</span></div>
                                        <div style="margin-top: 8px;"><strong style="color: #9cdcfe;">API Key:</strong> <span style="color: #ce9178;">${apiKey || 'Complete OAuth first'}</span></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">5</div>
                                <div class="step-content">
                                    <div class="step-title">Add Custom Headers</div>
                                    <div class="step-description">In the MCP Client, add these custom headers:</div>
                                    <div class="step-code">
                                        <div><strong style="color: #9cdcfe;">Header Name:</strong> <span style="color: #ce9178;">X-Shopify-Domain</span></div>
                                        <div><strong style="color: #9cdcfe;">Header Value:</strong> <span style="color: #ce9178;">${shop || 'your-store.myshopify.com'}</span></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">6</div>
                                <div class="step-content">
                                    <div class="step-title">Test the Connection</div>
                                    <div class="step-description">Click "Test" or run the workflow. You should see the Shopify tools appear (like "shopify_search_products").</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="info-box warning" style="margin-top: 16px;">
                            <div class="info-box-icon" style="background: #ffea8a; color: #8a6d00; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">!</div>
                            <div class="info-box-content">
                                <div class="info-box-title">Connection Issues?</div>
                                <div class="info-box-text">If you see "Could not connect" error, try using the alternative SSE endpoint (${host}/sse) instead. Some n8n versions work better with SSE transport.</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Make Instructions -->
                    <div id="tab-make" class="tab-content">
                        <div class="info-box info">
                            <div class="info-box-icon" style="background: #a4e8f2; color: #0d5c5c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">i</div>
                            <div class="info-box-content">
                                <div class="info-box-title">What is Make?</div>
                                <div class="info-box-text">Make (formerly Integromat) is a visual automation platform. While it doesn't have native MCP support yet, you can use HTTP modules to connect.</div>
                            </div>
                        </div>
                        
                        <div class="tutorial-steps">
                            <div class="tutorial-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <div class="step-title">Create a New Scenario</div>
                                    <div class="step-description">Log into Make.com and create a new scenario.</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <div class="step-title">Add HTTP Module</div>
                                    <div class="step-description">Add the "HTTP" → "Make a request" module.</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <div class="step-title">Configure the Request</div>
                                    <div class="step-description">Use these settings:</div>
                                    <div class="step-code">
                                        <div><strong style="color: #9cdcfe;">URL:</strong> <span style="color: #ce9178;">${host}/mcp</span></div>
                                        <div style="margin-top: 8px;"><strong style="color: #9cdcfe;">Method:</strong> <span style="color: #ce9178;">POST</span></div>
                                        <div style="margin-top: 8px;"><strong style="color: #9cdcfe;">Headers:</strong></div>
                                        <div style="margin-left: 16px;">Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}</div>
                                        <div style="margin-left: 16px;">X-Shopify-Domain: ${shop || 'your-store.myshopify.com'}</div>
                                        <div style="margin-left: 16px;">Content-Type: application/json</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">4</div>
                                <div class="step-content">
                                    <div class="step-title">Send MCP Commands</div>
                                    <div class="step-description">In the request body, send MCP protocol messages. For example, to list tools:</div>
                                    <div class="step-code">
                                        <pre style="margin: 0;">{"jsonrpc": "2.0", "method": "tools/list", "id": 1}</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Cursor IDE Instructions -->
                    <div id="tab-cursor" class="tab-content">
                        <div class="info-box info">
                            <div class="info-box-icon" style="background: #a4e8f2; color: #0d5c5c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">i</div>
                            <div class="info-box-content">
                                <div class="info-box-title">What is Cursor?</div>
                                <div class="info-box-text">Cursor is an AI-powered code editor. You can connect it to this MCP server to let the AI manage your Shopify store while you code!</div>
                            </div>
                        </div>
                        
                        <div class="tutorial-steps">
                            <div class="tutorial-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <div class="step-title">Open Cursor Settings</div>
                                    <div class="step-description">Open Cursor and go to Settings → Features → MCP Servers</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <div class="step-title">Add New MCP Server</div>
                                    <div class="step-description">Click "Add MCP Server" or edit your mcp.json file directly:</div>
                                    <div class="step-code">
                                        <pre style="margin: 0;">{
  "mcpServers": {
    "shopify": {
      "url": "${host}/sse",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE",
        "X-Shopify-Domain": "${shop || 'your-store.myshopify.com'}"
      }
    }
  }
}</pre>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <div class="step-title">Replace YOUR_TOKEN_HERE</div>
                                    <div class="step-description">Copy your secret token from above and replace "YOUR_TOKEN_HERE" in the config.</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">4</div>
                                <div class="step-content">
                                    <div class="step-title">Restart Cursor</div>
                                    <div class="step-description">Close and reopen Cursor. Now you can ask the AI to search products, create products, and more!</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- VS Code Instructions -->
                    <div id="tab-vscode" class="tab-content">
                        <div class="info-box info">
                            <div class="info-box-icon" style="background: #a4e8f2; color: #0d5c5c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">i</div>
                            <div class="info-box-content">
                                <div class="info-box-title">VS Code + GitHub Copilot/Continue</div>
                                <div class="info-box-text">Use VS Code with extensions like Continue or Cline to connect to MCP servers.</div>
                            </div>
                        </div>
                        
                        <div class="tutorial-steps">
                            <div class="tutorial-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <div class="step-title">Install Continue Extension</div>
                                    <div class="step-description">Open VS Code Extensions (Ctrl+Shift+X) and search for "Continue". Install it.</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <div class="step-title">Open Continue Config</div>
                                    <div class="step-description">Click the Continue icon in the sidebar, then click the gear icon to open config.json</div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <div class="step-title">Add MCP Server Configuration</div>
                                    <div class="step-description">Add this to your config.json:</div>
                                    <div class="step-code">
                                        <pre style="margin: 0;">{
  "experimental": {
    "mcpServers": {
      "shopify": {
        "transport": {
          "type": "sse",
          "url": "${host}/sse",
          "headers": {
            "Authorization": "Bearer YOUR_TOKEN_HERE",
            "X-Shopify-Domain": "${shop || 'your-store.myshopify.com'}"
          }
        }
      }
    }
  }
}</pre>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">4</div>
                                <div class="step-content">
                                    <div class="step-title">Reload VS Code</div>
                                    <div class="step-description">Reload the window (Ctrl+Shift+P → "Reload Window"). The Shopify tools should now be available!</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Claude Desktop Instructions -->
                    <div id="tab-claude" class="tab-content">
                        <div class="info-box info">
                            <div class="info-box-icon" style="background: #a4e8f2; color: #0d5c5c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">i</div>
                            <div class="info-box-content">
                                <div class="info-box-title">Claude Desktop</div>
                                <div class="info-box-text">Claude Desktop by Anthropic supports MCP natively. Connect it to manage your Shopify store with Claude!</div>
                            </div>
                        </div>
                        
                        <div class="tutorial-steps">
                            <div class="tutorial-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <div class="step-title">Open Claude Desktop Settings</div>
                                    <div class="step-description">Open Claude Desktop and find the MCP configuration file:</div>
                                    <div class="step-code">
                                        <div><strong style="color: #9cdcfe;">Mac:</strong> <span style="color: #ce9178;">~/Library/Application Support/Claude/claude_desktop_config.json</span></div>
                                        <div style="margin-top: 8px;"><strong style="color: #9cdcfe;">Windows:</strong> <span style="color: #ce9178;">%APPDATA%\\Claude\\claude_desktop_config.json</span></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <div class="step-title">Add Server Configuration</div>
                                    <div class="step-description">Add this to your config file:</div>
                                    <div class="step-code">
                                        <pre style="margin: 0;">{
  "mcpServers": {
    "shopify": {
      "url": "${host}/sse",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE",
        "X-Shopify-Domain": "${shop || 'your-store.myshopify.com'}"
      }
    }
  }
}</pre>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tutorial-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <div class="step-title">Restart Claude Desktop</div>
                                    <div class="step-description">Close and reopen Claude Desktop. You should see a plug icon indicating MCP is connected!</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Other Tools Instructions -->
                    <div id="tab-other" class="tab-content">
                        <div class="info-box info">
                            <div class="info-box-icon" style="background: #a4e8f2; color: #0d5c5c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">i</div>
                            <div class="info-box-content">
                                <div class="info-box-title">Generic MCP Connection</div>
                                <div class="info-box-text">Any tool that supports the Model Context Protocol (MCP) can connect using these credentials.</div>
                            </div>
                        </div>
                        
                        <div style="margin-top: 20px;">
                            <h3 style="font-size: 16px; margin-bottom: 16px;">Connection Details</h3>
                            
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr style="background: var(--p-color-bg-subdued);">
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border); font-weight: 600;">Setting</td>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border); font-weight: 600;">Value</td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border);">MCP Endpoint (HTTP)</td>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border); font-family: monospace;">${host}/mcp</td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border);">SSE Endpoint</td>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border); font-family: monospace;">${host}/sse</td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border);">Authorization Header</td>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border); font-family: monospace;">Bearer YOUR_TOKEN</td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border);">Shop Header</td>
                                    <td style="padding: 12px; border: 1px solid var(--p-color-border); font-family: monospace;">X-Shopify-Domain: ${shop || 'your-store.myshopify.com'}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <div class="info-box warning" style="margin-top: 20px;">
                            <div class="info-box-icon" style="background: #a4e8f2; color: #0d5c5c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">?</div>
                            <div class="info-box-content">
                                <div class="info-box-title">Need Help?</div>
                                <div class="info-box-text">Can't find instructions for your tool? Contact support or visit our documentation for the full API reference.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- AVAILABLE TOOLS -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg></div>
                    <h2>What Can Your AI Do?</h2>
                </div>
                <div class="card-body">
                    <p style="color: var(--p-color-text-subdued); margin-bottom: 20px;">
                        Once connected, your AI agent can use these tools:
                    </p>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
                        <div style="background: var(--p-color-bg-subdued); padding: 16px; border-radius: 8px;">
                            <div style="font-size: 20px; margin-bottom: 8px; color: var(--p-color-action-primary);"><svg style="width:24px;height:24px" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></div>
                            <div style="font-weight: 600; margin-bottom: 4px;">Search Products</div>
                            <div style="font-size: 13px; color: var(--p-color-text-subdued);">Find products by name, search inventory, get product details</div>
                        </div>
                        <div style="background: var(--p-color-bg-subdued); padding: 16px; border-radius: 8px;">
                            <div style="font-size: 20px; margin-bottom: 8px; color: var(--p-color-action-primary);"><svg style="width:24px;height:24px" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></div>
                            <div style="font-weight: 600; margin-bottom: 4px;">Create Products</div>
                            <div style="font-size: 13px; color: var(--p-color-text-subdued);">Add new products with title, description, price, and status</div>
                        </div>
                        <div style="background: var(--p-color-bg-subdued); padding: 16px; border-radius: 8px;">
                            <div style="font-size: 20px; margin-bottom: 8px; color: var(--p-color-action-primary);"><svg style="width:24px;height:24px" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg></div>
                            <div style="font-weight: 600; margin-bottom: 4px;">View Orders</div>
                            <div style="font-size: 13px; color: var(--p-color-text-subdued);">See recent orders, order details, and fulfillment status</div>
                        </div>
                        <div style="background: var(--p-color-bg-subdued); padding: 16px; border-radius: 8px;">
                            <div style="font-size: 20px; margin-bottom: 8px; color: var(--p-color-action-primary);"><svg style="width:24px;height:24px" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></div>
                            <div style="font-weight: 600; margin-bottom: 4px;">Trigger Workflows</div>
                            <div style="font-size: 13px; color: var(--p-color-text-subdued);">Connect to n8n webhooks to trigger custom automations</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                <a href="/debug">View System Status</a> · 
                <a href="/health">Health Check</a>
                <p style="margin-top: 12px;">Shopify MCP Server v1.0 • Powered by Model Context Protocol</p>
            </div>
        </div>
        
        <script>
            function copyCredential(id) {
                const el = document.getElementById(id);
                const originalType = el.type;
                el.type = 'text';
                el.select();
                navigator.clipboard.writeText(el.value);
                el.type = originalType;
                
                const btn = el.parentElement.querySelector('button');
                const original = btn.innerText;
                btn.innerText = 'Copied!';
                btn.style.background = '#aee9d1';
                setTimeout(() => {
                    btn.innerText = original;
                    btn.style.background = '';
                }, 2000);
            }
            
            function toggleToken() {
                const el = document.getElementById('cred-token');
                const btn = el.parentElement.querySelectorAll('button')[0];
                if (el.type === 'password') {
                    el.type = 'text';
                    btn.innerText = 'Hide';
                } else {
                    el.type = 'password';
                    btn.innerText = 'Show';
                }
            }
            
            function showTab(tabId) {
                // Hide all tabs
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                
                // Show selected tab
                document.getElementById('tab-' + tabId).classList.add('active');
                event.target.classList.add('active');
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
