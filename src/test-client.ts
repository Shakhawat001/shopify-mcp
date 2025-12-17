import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  // Hardcode for verification
  const token = "D57EB815-C627-4AD9-A56E-929AC12D733D";
  const shop = "batin-studio-dev-store.myshopify.com";
  
  // Use Query Params for Auth (Universal method)
  const url = `https://shopifymcp.apps.batinstudio.com/sse?token=${token}&shop=${shop}`;

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

    // Verify Create Product
    console.log("🛠️ Testing shopify_create_product...");
    const result = await client.callTool({
        name: "shopify_create_product",
        arguments: {
            title: "MCP Created Product " + new Date().toISOString(),
            description: "Created via MCP Tool",
            price: "50.00",
            status: "DRAFT"
        }
    });
    console.log("✅ Product Created:", result);
    
    await client.close();
  } catch (error) {
    console.error("❌ Connection failed:", error);
  }
}

main();
