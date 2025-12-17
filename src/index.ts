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
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.MCP_SERVER_TOKEN;
    
    // Allow Auth handshake routes to pass without MCP token
    if (req.path.startsWith("/auth")) {
        return next();
    }
    
    if (!expectedToken) {
        console.warn("MCP_SERVER_TOKEN not set via environment. Endpoints are unprotected!");
        return next();
    }

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  app.use(cors());
  app.use(express.json());

  // Store active transports by SessionID
  const transports = new Map<string, SSEServerTransport>();

  // START OAUTH ROUTES
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

  // SSE Endpoint
  app.get("/sse", authMiddleware, async (req, res) => {
    console.log("New SSE connection...");
    
    // Determine which Shopify Session to use
    // Option A: Env var (Single Tenant legacy)
    // Option B: Header (Multi-tenant)
    const targetShop = req.headers['x-shopify-domain'] as string;
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
    const sessionAwareTransport = new SSEServerTransport(`/message?sessionId=${sessionId}`, res);
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
