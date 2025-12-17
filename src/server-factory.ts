import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProducts, getRecentOrders, createProduct, getProduct } from "./shopify-client.js";
import { Session } from "@shopify/shopify-api";

export function createShopifyServer(session?: Session) {
  const server = new McpServer({
    name: "shopify-mcp-server",
    version: "1.0.0",
  });

  // Resource: shopify://products
  server.resource(
    "shopify-products",
    "shopify://products",
    async (uri) => {
      try {
        // If session exists, we should use its access token. 
        // For MVP phase 4, we assume getProducts still uses global env if session is null,
        // BUT ideally we pass session.accessToken to getProducts.
        // We need to refactor getProducts too.
        // For now, let's just log capturing the session.
        if (session) {
            server.sendLoggingMessage({
                level: "info",
                data: `[Resource:Products] accessed by shop: ${session.shop}`
            });
        }
        
        const productsData = await getProducts(
            10, 
            session?.shop, 
            session?.accessToken
        );
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(productsData, null, 2),
            mimeType: "application/json",
          }],
        };
      } catch (error: any) {
        server.sendLoggingMessage({ level: "error", data: `Error fetching products: ${error.message}` });
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching products: ${error.message}`,
            mimeType: "text/plain",
          }],
        };
      }
    }
  );

  // Resource: shopify://products/{id}
  server.resource(
    "shopify-product",
    new ResourceTemplate("shopify://products/{id}", { list: undefined }),
    async (uri, { id }) => {
      try {
        if (session) {
            server.sendLoggingMessage({
                level: "info",
                data: `[Resource:Product] accessed by shop: ${session.shop}, id: ${id}`
            });
        }
        const productId = Array.isArray(id) ? id[0] : id;
        
        const product = await getProduct(
            productId, 
            session?.shop, 
            session?.accessToken
        );
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(product, null, 2),
            mimeType: "application/json",
          }],
        };
      } catch (error: any) {
        server.sendLoggingMessage({ level: "error", data: `Error fetching product ${id}: ${error.message}` });
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching product ${id}: ${error.message}`,
            mimeType: "text/plain",
          }],
        };
      }
    }
  );

  // Resource: shopify://orders
  server.resource(
    "shopify-orders",
    "shopify://orders",
    async (uri) => {
      try {
        const ordersData = await getRecentOrders(
            5,
            session?.shop, 
            session?.accessToken
        );
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(ordersData, null, 2),
            mimeType: "application/json",
          }],
        };
      } catch (error: any) {
        server.sendLoggingMessage({ level: "error", data: `Error fetching orders: ${error.message}` });
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching orders: ${error.message}`,
            mimeType: "text/plain",
          }],
        };
      }
    }
  );

  // Tool: shopify_search_products
  server.tool(
    "shopify_search_products",
    "Search or list products from the store. useful for finding product IDs to update or checking inventory levels.",
    {
      limit: z.number().min(1).max(50).default(5).describe("Number of products to return"),
    },
    async ({ limit }) => {
      try {
        const products = await getProducts(
            limit,
            session?.shop, 
            session?.accessToken
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify(products, null, 2)
          }]
        };
      } catch (error: any) {
        server.sendLoggingMessage({ level: "error", data: `Error searching products: ${error.message}` });
        return {
          content: [{
            type: "text",
            text: `Error: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: trigger_n8n_workflow
  server.tool(
    "trigger_n8n_workflow",
    "Trigger an n8n automation workflow",
    {
      workflowId: z.string().describe("The ID or name of the workflow"),
      payload: z.string().describe("JSON string payload to send to the workflow").refine((val) => {
        try { JSON.parse(val); return true; } catch { return false; }
      }, { message: "Payload must be a valid JSON string" }),
    },
    async ({ workflowId, payload }) => {
      // In a real scenario, workflowId might be a full URL or a key mapped to a URL.
      // For flexibility, let's assume workflowId IS the webhook URL key or we have a base URL.
      // Option A: User passes full Webhook URL as workflowId (simplest for generic tool).
      // Option B: We have N8N_HOST env var.
      
      try {
          // If workflowId looks like a URL, use it. Otherwise assume it's a path segment.
          let targetUrl = workflowId;
          if (!targetUrl.startsWith('http')) {
              const n8nHost = process.env.N8N_HOST || 'http://localhost:5678';
              targetUrl = `${n8nHost}/webhook/${workflowId}`;
          }

          const response = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload
          });

          const responseText = await response.text();
          
          return {
            content: [{
              type: "text",
              text: `Successfully triggered n8n workflow. Status: ${response.status}. Response: ${responseText.substring(0, 200)}`
            }]
          };
      } catch (error: any) {
         server.sendLoggingMessage({ level: "error", data: `Failed to trigger n8n workflow: ${error.message}` });
         return {
            content: [{
              type: "text",
              text: `Failed to trigger n8n workflow: ${error.message}`
            }]
          };
      }
    }
  );


  // Prompt: shopify-assistant
  // Best Practice: Give the LLM a starting point with context
  server.prompt(
    "shopify-assistant",
    {
      topic: z.string().optional().describe("Broad topic (e.g. 'inventory', 'pricing')"),
    },
    async ({ topic }) => {
        const shopInfo = session?.shop ? `You are interacting with the Shopify store: ${session.shop}` : "You are interacting with a Shopify store.";
        
        server.sendLoggingMessage({
            level: "info",
            data: `[Prompt:Assistant] generated for topic: ${topic || "General"}`
        });

        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `${shopInfo}\n\nYour goal is to help manage products and orders. Use the available tools to fetch data before making changes.\nTopic focus: ${topic || "General Management"}`
                    }
                }
            ]
        };
    }
  );

  // Tool: shopify_create_product
  server.tool(
    "shopify_create_product",
    "Create a new product in the store. Use this when the user explicitly asks to add new merchandise. Requires title. Price and Status are optional (defaults to DRAFT).",
    {
      title: z.string().describe("Title of the product"),
      description: z.string().optional().describe("HTML description of the product"),
      price: z.string().optional().refine((val) => !val || /^\d+(\.\d{1,2})?$/.test(val), {
        message: "Price must be a valid number (e.g. '19.99')"
      }).describe("Price of the product (e.g. '19.99')"),
      status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional().describe("Product status"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
            level: "info",
            data: `[Tool:CreateProduct] Creating product: ${args.title}`
        });

        const product = await createProduct(
            args,
            session?.shop, 
            session?.accessToken
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify(product, null, 2)
          }]
        };
      } catch (error: any) {
        server.sendLoggingMessage({ level: "error", data: `Error creating product: ${error.message}` });
        return {
          content: [{
            type: "text",
            text: `Error creating product: ${error.message}`
          }]
        };
      }
    }
  );

  return server;
}
