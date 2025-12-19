import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { 
  getProducts, 
  getRecentOrders, 
  createProduct, 
  getProduct,
  getBlogs,
  getBlogArticles,
  getArticle,
  createBlogArticle,
  updateBlogArticle,
  deleteArticle,
  publishArticle,
  getShopAnalytics,
  updateProduct,
  deleteProduct,
  getOrder
} from "./shopify-client.js";
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

  // ============================================================
  // BLOG TOOLS (Enhanced)
  // ============================================================

  // Tool: shopify_list_blogs
  server.tool(
    "shopify_list_blogs",
    "List all blogs in the store. Returns blog IDs, titles, handles, and URLs. Use this to find blog IDs before creating articles.",
    {},
    async () => {
      try {
        const blogs = await getBlogs(10, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(blogs, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing blogs: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_list_blog_articles
  server.tool(
    "shopify_list_blog_articles",
    "List articles from a specific blog with details like author, tags, publish status, and images.",
    {
      blogId: z.string().describe("The blog ID (e.g. gid://shopify/Blog/123)"),
      limit: z.number().min(1).max(50).default(10).describe("Number of articles to return"),
    },
    async ({ blogId, limit }) => {
      try {
        const articles = await getBlogArticles(blogId, limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(articles, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing articles: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_get_article
  server.tool(
    "shopify_get_article",
    "Get full details of a specific blog article including body content, SEO, author info, and image.",
    {
      articleId: z.string().describe("The article ID (e.g. gid://shopify/Article/123)"),
    },
    async ({ articleId }) => {
      try {
        const article = await getArticle(articleId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(article, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting article: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_blog_article
  server.tool(
    "shopify_create_blog_article",
    "Create a new blog article with full SEO, author, tags, and image support. Set published=true to publish immediately.",
    {
      blogId: z.string().describe("The blog ID (e.g. gid://shopify/Blog/123)"),
      title: z.string().describe("Title of the article"),
      body: z.string().describe("HTML content of the article body"),
      author: z.string().optional().describe("Author name"),
      authorEmail: z.string().optional().describe("Author email address"),
      summary: z.string().optional().describe("Short summary/excerpt for previews"),
      tags: z.array(z.string()).optional().describe("Array of tags (e.g. ['holiday', 'sale', 'announcement'])"),
      imageUrl: z.string().optional().describe("URL of the featured image"),
      imageAltText: z.string().optional().describe("Alt text for the image"),
      seoTitle: z.string().optional().describe("SEO title (defaults to article title)"),
      seoDescription: z.string().optional().describe("SEO meta description"),
      published: z.boolean().optional().default(true).describe("Publish immediately (default: true)"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateBlogArticle] Creating article: ${args.title} (published: ${args.published})`
        });
        const article = await createBlogArticle(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(article, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating article: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_update_blog_article
  server.tool(
    "shopify_update_blog_article",
    "Update an existing blog article. Can modify content, SEO, tags, image, and publish status.",
    {
      articleId: z.string().describe("The article ID to update (e.g. gid://shopify/Article/123)"),
      title: z.string().optional().describe("New title"),
      body: z.string().optional().describe("New HTML content"),
      summary: z.string().optional().describe("New summary/excerpt"),
      tags: z.array(z.string()).optional().describe("New tags array"),
      imageUrl: z.string().optional().describe("New featured image URL"),
      imageAltText: z.string().optional().describe("New image alt text"),
      seoTitle: z.string().optional().describe("New SEO title"),
      seoDescription: z.string().optional().describe("New SEO description"),
      published: z.boolean().optional().describe("Publish (true) or unpublish (false)"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:UpdateBlogArticle] Updating article: ${args.articleId}`
        });
        const article = await updateBlogArticle(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(article, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating article: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_delete_article
  server.tool(
    "shopify_delete_article",
    "Permanently delete a blog article. This cannot be undone!",
    {
      articleId: z.string().describe("The article ID to delete (e.g. gid://shopify/Article/123)"),
    },
    async ({ articleId }) => {
      try {
        server.sendLoggingMessage({
          level: "warning",
          data: `[Tool:DeleteArticle] Deleting article: ${articleId}`
        });
        const result = await deleteArticle(articleId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Article deleted successfully. ID: ${result.deletedArticleId}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting article: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_publish_article
  server.tool(
    "shopify_publish_article",
    "Quick publish or unpublish a blog article without modifying other content.",
    {
      articleId: z.string().describe("The article ID (e.g. gid://shopify/Article/123)"),
      publish: z.boolean().describe("true to publish, false to unpublish"),
    },
    async ({ articleId, publish }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:PublishArticle] ${publish ? 'Publishing' : 'Unpublishing'} article: ${articleId}`
        });
        const article = await publishArticle(articleId, publish, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Article ${publish ? 'published' : 'unpublished'} successfully.\n${JSON.stringify(article, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error ${publish ? 'publishing' : 'unpublishing'} article: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // ANALYTICS TOOLS
  // ============================================================

  // Tool: shopify_get_analytics
  server.tool(
    "shopify_get_analytics",
    "Get store analytics including recent orders summary, revenue, and fulfillment stats. Use this to generate performance reports.",
    {},
    async () => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:GetAnalytics] Fetching store analytics`
        });
        const analytics = await getShopAnalytics(session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(analytics, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching analytics: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // PRODUCT UPDATE/DELETE TOOLS
  // ============================================================

  // Tool: shopify_update_product
  server.tool(
    "shopify_update_product",
    "Update an existing product. Use this to change product details like title, description, or status.",
    {
      productId: z.string().describe("The product ID to update (e.g. gid://shopify/Product/123)"),
      title: z.string().optional().describe("New product title"),
      description: z.string().optional().describe("New HTML description"),
      status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional().describe("New product status"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:UpdateProduct] Updating product: ${args.productId}`
        });
        const product = await updateProduct(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(product, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating product: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_delete_product
  server.tool(
    "shopify_delete_product",
    "Delete a product permanently. Use with caution - this cannot be undone!",
    {
      productId: z.string().describe("The product ID to delete (e.g. gid://shopify/Product/123)"),
    },
    async ({ productId }) => {
      try {
        server.sendLoggingMessage({
          level: "warning",
          data: `[Tool:DeleteProduct] Deleting product: ${productId}`
        });
        const result = await deleteProduct(productId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Product deleted successfully. ID: ${result.deletedProductId}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting product: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // ORDER TOOLS
  // ============================================================

  // Tool: shopify_get_order
  server.tool(
    "shopify_get_order",
    "Get detailed information about a specific order including items, shipping, and customer info.",
    {
      orderId: z.string().describe("The order ID (e.g. gid://shopify/Order/123)"),
    },
    async ({ orderId }) => {
      try {
        const order = await getOrder(orderId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(order, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching order: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_list_recent_orders
  server.tool(
    "shopify_list_recent_orders",
    "List recent orders from the store with basic details and fulfillment status.",
    {
      limit: z.number().min(1).max(50).default(10).describe("Number of orders to return"),
    },
    async ({ limit }) => {
      try {
        const orders = await getRecentOrders(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(orders, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing orders: ${error.message}`
          }]
        };
      }
    }
  );

  return server;
}
