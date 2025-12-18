# 🤖 AI Agent Context & Developer Guide

## Project Mission
To build a **Headless, Multi-Tenant MCP Server** that exposes the full capabilities of the **Shopify 2026-01 Admin API**. This server enables AI agents (like Claude Desktop, n8n, etc.) to securely manage Shopify stores via the Model Context Protocol.

## 🏗 Architecture
*   **Framework**: Node.js + Express
*   **Protocol**: MCP (Model Context Protocol) via Reference SDK (`@modelcontextprotocol/sdk`)
*   **Transport**: 
    *   **Streamable HTTP**: Recommended transport for n8n and modern clients (`/mcp`).
    *   **SSE (Server-Sent Events)**: Legacy transport for older clients (`/sse`, `/message`).
    *   **Stdio**: Fallback for local CLI usage.
*   **Shopify Integration**: Uses `@shopify/shopify-api` (Node adapter).
*   **Deployment**: Dockerized (Alpine Node 20), optimized for Coolify.

## 🔐 Authentication & Multi-Tenancy
This project implements a **Dual-Layer Authentication** strategy:

1.  **Shopify OAuth (System Layer)**:
    *   The server acts as a Shopify App.
    *   Routes: `GET /auth` -> `GET /auth/callback`
    *   Stores `Session` objects (Access Tokens) in `MemorySessionStorage` (mapped by `shop` domain).
    *   **Goal**: Allows the server to act *on behalf of* the shop.

2.  **MCP Auth (Client Layer)**:
    *   Protects the SSE endpoints (`/sse`, `/message`) from unauthorized AI agents.
    *   Mechanism: **Bearer Token** (`Authorization: Bearer <MCP_SERVER_TOKEN>`).
    *   **Context Switching**: Clients MUST send `X-Shopify-Domain` header to select which shop they want to interact with.

## 📂 Key File Map
*   **`src/index.ts`**: The main entry point. Sets up Express, OAuth routes, CSP headers for Embedded Dashboard, and the SSE Endpoint.
*   **`src/server-factory.ts`**: Defines the `McpServer` resources (`shopify://products`, `shopify://orders`) and tools. It accepts a `Session` object to make authenticated API calls.
*   **`src/shopify-client.ts`**: Low-level GraphQL client. **Crucial**: It accepts `shop` and `accessToken` arguments to support multi-tenancy.
*   **`src/session-storage.ts`**: Simple in-memory storage for OAuth sessions. *Future TODO: Move to Redis/Postgres for persistence.*

## 🚀 Deployment (Coolify/Docker)
The `Dockerfile` and `docker-compose.yml` are production-ready.
*   **Port**: `38383` (Internal & External).
*   **Healthcheck**: `GET /health`

### Required Environment Variables
| Variable | Description |
| :--- | :--- |
| `HOST` | Public URL (e.g., `https://mcp.yourdomain.com`). Used for OAuth callbacks. |
| `SHOPIFY_API_KEY` | Shopify App Client ID. |
| `SHOPIFY_API_SECRET` | Shopify App Client Secret (keep safe!). |
| `MCP_SERVER_TOKEN` | A strong password you invent to protect the MCP interface. |
| `PORT` | Optional. Defaults to `38383`. |

## 🛠 Future Roadmap
*   **Persistence**: Replace `MemorySessionStorage` with a database adapter (Prisma/Redis) so logins survive restarts.
*   **Webhooks**: Implement `POST /webhooks` to receive `products/update` events and forward them via MCP notifications.
*   **Full 2026-01 API**: Expand `shopify-client.ts` to cover Mutations (Create Product, Update Order).

## 💡 Developer Tips
*   **Debug Dashboard**: Visit `/debug` to check env var status and system health.
*   **Embedded App**: The root `/` route detects if it's running in an iframe and serves a helper dashboard.
