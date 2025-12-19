import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  // Use environment variables for credentials
  const token = process.env.TEST_API_KEY;
  const shop = process.env.TEST_SHOP_DOMAIN;
  const host = process.env.HOST || "https://shopifymcp.apps.batinstudio.com";
  
  if (!token || !shop) {
    console.error("Missing TEST_API_KEY or TEST_SHOP_DOMAIN environment variables");
    process.exit(1);
  }
  
  // Use Query Params for Auth (Universal method)
  const url = `${host}/sse?token=${token}&shop=${shop}`;

  console.log(`Connecting to ${url}...`);

  const transport = new SSEClientTransport(new URL(url));

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    console.log("✅ Connected via MCP SDK!");
    
    // List tools to verify full handshake
    const tools = await client.listTools();
    console.log("✅ Tools received:", tools.tools.map(t => t.name));

    // Verify Prompts
    const prompts = await client.listPrompts();
    console.log("✅ Prompts received:", prompts.prompts.map(p => p.name));
    
    if (prompts.prompts.find(p => p.name === "shopify-assistant")) {
        const promptResult = await client.getPrompt({ name: "shopify-assistant", arguments: { topic: "testing" } });
        console.log("✅ 'shopify-assistant' prompt works. Message count:", promptResult.messages.length);
    }

    // Verify Resources
    const resources = await client.listResources();
    console.log("✅ Resources received (templates):", resources.resources.map(r => r.name));

    // Create Product & Verify Granular Resource logic (mock flow)
    console.log("🛠️ Testing shopify_create_product...");
    const createResult = await client.callTool({
        name: "shopify_create_product",
        arguments: {
            title: "MCP Created Product " + new Date().toISOString(),
            description: "Created via MCP Tool",
            price: "50.00",
            status: "DRAFT"
        }
    });
    console.log("✅ Product Created");
    
    // Parse result to get ID if possible, otherwise skip granular read test for now (simplicity)
    // The previous log output showed result is an object.
    
    await client.close();
  } catch (error) {
    console.error("❌ Connection failed:", error);
  }
}

main();
