# Shopify MCP Server (OAuth + Multi-Tenant)

A headless, production-ready **Model Context Protocol (MCP)** server for Shopify.
It acts as a bridge, allowing AI Agents (n8n, Claude Desktop, Cursor) to manage multiple Shopify stores via a standardized API.

## ✨ Features
*   **System-Level OAuth**: Installs as a real Shopify App on multiple stores.
*   **Multi-Tenancy**: Manage different stores using a single server instance.
*   **Dual Transport**: Supports both **Streamable HTTP** (recommended) and **SSE** (legacy).
*   **Secure**: Protected by Bearer Tokens and system headers.
*   **Embedded Dashboard**: Includes a helpful UI when viewed inside Shopify Admin.
*   **Docker Ready**: Optimized for Coolify/Portainer deployment on port `38383`.

## 🚀 Quick Start
### 1. Agents / Developers
> **🤖 Are you an AI Agent?**
> Read [AI_CONTEXT.md](./AI_CONTEXT.md) for full architectural details, code maps, and design constraints.

### 2. Deployment (Coolify)
1.  Deploy this repo.
2.  Set Environment Variables:
    *   `HOST`: Your public URL (e.g. `https://mcp.mydomain.com`)
    *   `SHOPIFY_API_KEY`: `a287cff4169d717d453125de7e90a361` (Default)
    *   `SHOPIFY_API_SECRET`: (From Partner Dashboard)
    *   `MCP_SERVER_TOKEN`: (Your secret password)
3.  Visit your URL to see the Dashboard!

## 🔗 Connecting Clients

### Streamable HTTP (Recommended for n8n)
*   **URL**: `https://your-server.com/mcp`
*   **Method**: POST
*   **Auth**: `Authorization: Bearer <MCP_SERVER_TOKEN>`
*   **Context**: `X-Shopify-Domain: <shop-domain>`

### SSE (Legacy)
*   **URL**: `https://your-server.com/sse`
*   **Auth**: `Authorization: Bearer <MCP_SERVER_TOKEN>`
*   **Context**: `X-Shopify-Domain: <shop-domain>`

## 🛠 Tech Stack
*   Node.js & TypeScript
*   Express & MCP SDK (Streamable HTTP + SSE)
*   `@shopify/shopify-api`

