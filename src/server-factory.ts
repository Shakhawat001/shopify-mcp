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
  getOrder,
  // Customers
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  // Inventory
  getInventoryLevels,
  adjustInventory,
  getLocations,
  // Collections
  getCollections,
  getCollection,
  createCollection,
  addProductsToCollection,
  deleteCollection,
  removeProductsFromCollection,
  // Discounts
  getDiscounts,
  createDiscountCode,
  deleteDiscount,
  // Fulfillment
  getOrderFulfillments,
  createFulfillment,
  // Shop
  getShopInfo,
  // Enterprise: Variants
  getProductVariants,
  createProductVariant,
  updateProductVariant,
  // Enterprise: Metafields
  getMetafields,
  setMetafield,
  deleteMetafield,
  // Enterprise: Order Management
  addOrderNote,
  addOrderTags,
  cancelOrder,
  // Enterprise: Refunds
  calculateRefund,
  createRefund,
  // Enterprise: Draft Orders
  getDraftOrders,
  createDraftOrder,
  completeDraftOrder,
  deleteDraftOrder,
  // ADVANCED: Bulk Operations
  bulkCreateProductVariants,
  bulkUpdateProductVariants,
  bulkAdjustInventory,
  // ADVANCED: Order Creation & Editing
  createOrder,
  beginOrderEdit,
  addLineItemToOrderEdit,
  commitOrderEdit,
  // ADVANCED: Gift Cards
  getGiftCards,
  createGiftCard,
  disableGiftCard,
  // ADVANCED: Webhooks
  getWebhooks,
  createWebhook,
  deleteWebhook,
  // ADVANCED: Files/Media
  getFiles,
  createFileFromUrl,
  deleteFile,
  // ADVANCED: Search
  searchProducts,
  searchCustomers,
  // ADVANCED: Price Rules
  getPriceRules,
  // ADVANCED: Tags
  addProductTags,
  removeProductTags,
  // ADVANCED: International
  getMarkets,
  getDeliveryProfiles,
  // ADVANCED: Abandoned Checkouts
  getAbandonedCheckouts,
  // ADVANCED: Store Credit
  getStoreCreditAccounts,
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

  // ============================================================
  // CUSTOMER TOOLS
  // ============================================================

  // Tool: shopify_list_customers
  server.tool(
    "shopify_list_customers",
    "Search and list customers. Can filter by email, name, or other criteria.",
    {
      limit: z.number().min(1).max(50).default(10).describe("Number of customers to return"),
      query: z.string().optional().describe("Search query (e.g. 'email:john@example.com' or 'first_name:John')"),
    },
    async ({ limit, query }) => {
      try {
        const customers = await getCustomers(limit, query, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(customers, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing customers: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_get_customer
  server.tool(
    "shopify_get_customer",
    "Get detailed info about a specific customer including orders and address.",
    {
      customerId: z.string().describe("The customer ID (e.g. gid://shopify/Customer/123)"),
    },
    async ({ customerId }) => {
      try {
        const customer = await getCustomer(customerId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(customer, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting customer: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_customer
  server.tool(
    "shopify_create_customer",
    "Create a new customer with email, name, phone, notes, and tags.",
    {
      email: z.string().optional().describe("Customer email address"),
      firstName: z.string().optional().describe("First name"),
      lastName: z.string().optional().describe("Last name"),
      phone: z.string().optional().describe("Phone number"),
      note: z.string().optional().describe("Internal note about customer"),
      tags: z.array(z.string()).optional().describe("Tags for segmentation (e.g. ['vip', 'wholesale'])"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateCustomer] Creating customer: ${args.email || args.firstName}`
        });
        const customer = await createCustomer(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(customer, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating customer: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_update_customer
  server.tool(
    "shopify_update_customer",
    "Update an existing customer's info, tags, or notes.",
    {
      customerId: z.string().describe("The customer ID to update"),
      email: z.string().optional().describe("New email"),
      firstName: z.string().optional().describe("New first name"),
      lastName: z.string().optional().describe("New last name"),
      phone: z.string().optional().describe("New phone"),
      note: z.string().optional().describe("Updated note"),
      tags: z.array(z.string()).optional().describe("New tags array"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:UpdateCustomer] Updating customer: ${args.customerId}`
        });
        const customer = await updateCustomer(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(customer, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating customer: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // INVENTORY TOOLS
  // ============================================================

  // Tool: shopify_get_inventory
  server.tool(
    "shopify_get_inventory",
    "Get inventory levels for a product across all locations.",
    {
      productId: z.string().describe("The product ID (e.g. gid://shopify/Product/123)"),
    },
    async ({ productId }) => {
      try {
        const inventory = await getInventoryLevels(productId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(inventory, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting inventory: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_adjust_inventory
  server.tool(
    "shopify_adjust_inventory",
    "Adjust inventory quantity for a product variant at a specific location.",
    {
      inventoryItemId: z.string().describe("The inventory item ID (from get_inventory)"),
      locationId: z.string().describe("The location ID (from get_locations)"),
      delta: z.number().describe("Quantity change (+5 to add, -3 to remove)"),
      reason: z.string().optional().describe("Reason: 'correction', 'received', 'damaged', 'other'"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:AdjustInventory] Adjusting by ${args.delta}: ${args.inventoryItemId}`
        });
        const result = await adjustInventory(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Inventory adjusted successfully.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error adjusting inventory: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_get_locations
  server.tool(
    "shopify_get_locations",
    "Get all inventory/fulfillment locations for the store.",
    {},
    async () => {
      try {
        const locations = await getLocations(session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(locations, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting locations: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // COLLECTION TOOLS
  // ============================================================

  // Tool: shopify_list_collections
  server.tool(
    "shopify_list_collections",
    "List all product collections in the store.",
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of collections to return"),
    },
    async ({ limit }) => {
      try {
        const collections = await getCollections(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(collections, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing collections: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_get_collection
  server.tool(
    "shopify_get_collection",
    "Get details about a collection including its products.",
    {
      collectionId: z.string().describe("The collection ID (e.g. gid://shopify/Collection/123)"),
    },
    async ({ collectionId }) => {
      try {
        const collection = await getCollection(collectionId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(collection, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting collection: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_collection
  server.tool(
    "shopify_create_collection",
    "Create a new manual collection.",
    {
      title: z.string().describe("Collection title"),
      description: z.string().optional().describe("Collection description"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateCollection] Creating collection: ${args.title}`
        });
        const collection = await createCollection(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(collection, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating collection: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_add_products_to_collection
  server.tool(
    "shopify_add_products_to_collection",
    "Add products to a manual collection.",
    {
      collectionId: z.string().describe("The collection ID"),
      productIds: z.array(z.string()).describe("Array of product IDs to add"),
    },
    async ({ collectionId, productIds }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:AddToCollection] Adding ${productIds.length} products to: ${collectionId}`
        });
        const collection = await addProductsToCollection(collectionId, productIds, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(collection, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error adding products: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // DISCOUNT TOOLS
  // ============================================================

  // Tool: shopify_list_discounts
  server.tool(
    "shopify_list_discounts",
    "List all discount codes and automatic discounts.",
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of discounts to return"),
    },
    async ({ limit }) => {
      try {
        const discounts = await getDiscounts(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(discounts, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing discounts: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_discount
  server.tool(
    "shopify_create_discount",
    "Create a discount code with percentage or fixed amount off.",
    {
      title: z.string().describe("Internal title for the discount"),
      code: z.string().describe("The discount code customers will use (e.g. 'SAVE20')"),
      percentOff: z.number().optional().describe("Percentage discount (e.g. 20 for 20% off)"),
      amountOff: z.number().optional().describe("Fixed amount off (use instead of percentOff)"),
      startsAt: z.string().optional().describe("Start date ISO string"),
      endsAt: z.string().optional().describe("End date ISO string"),
      usageLimit: z.number().optional().describe("Max number of times code can be used"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateDiscount] Creating discount: ${args.code}`
        });
        const discount = await createDiscountCode(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(discount, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating discount: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // FULFILLMENT TOOLS
  // ============================================================

  // Tool: shopify_get_fulfillments
  server.tool(
    "shopify_get_fulfillments",
    "Get fulfillment status and tracking info for an order.",
    {
      orderId: z.string().describe("The order ID (e.g. gid://shopify/Order/123)"),
    },
    async ({ orderId }) => {
      try {
        const fulfillments = await getOrderFulfillments(orderId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(fulfillments, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting fulfillments: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_fulfillment
  server.tool(
    "shopify_create_fulfillment",
    "Fulfill an order with optional tracking information.",
    {
      fulfillmentOrderId: z.string().describe("The fulfillment order ID (from get_fulfillments)"),
      trackingNumber: z.string().optional().describe("Tracking number"),
      trackingCompany: z.string().optional().describe("Carrier name (e.g. 'UPS', 'FedEx', 'USPS')"),
      trackingUrl: z.string().optional().describe("Tracking URL"),
      notifyCustomer: z.boolean().optional().default(true).describe("Send notification email"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateFulfillment] Fulfilling order: ${args.fulfillmentOrderId}`
        });
        const fulfillment = await createFulfillment(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Order fulfilled successfully!\n${JSON.stringify(fulfillment, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating fulfillment: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // SHOP INFO TOOL
  // ============================================================

  // Tool: shopify_get_shop_info
  server.tool(
    "shopify_get_shop_info",
    "Get store information including name, domain, currency, plan, and settings.",
    {},
    async () => {
      try {
        const shop = await getShopInfo(session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(shop, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting shop info: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // PRODUCT VARIANT TOOLS
  // ============================================================

  // Tool: shopify_get_variants
  server.tool(
    "shopify_get_variants",
    "Get all variants (sizes, colors) for a product including prices and inventory.",
    {
      productId: z.string().describe("The product ID (e.g. gid://shopify/Product/123)"),
    },
    async ({ productId }) => {
      try {
        const variants = await getProductVariants(productId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(variants, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting variants: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_variant
  server.tool(
    "shopify_create_variant",
    "Create a new product variant (e.g. new size or color option).",
    {
      productId: z.string().describe("The product ID"),
      options: z.array(z.string()).describe("Option values (e.g. ['Large', 'Blue'])"),
      price: z.string().describe("Price (e.g. '29.99')"),
      sku: z.string().optional().describe("SKU code"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateVariant] Creating variant for: ${args.productId}`
        });
        const variant = await createProductVariant(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(variant, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating variant: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_update_variant
  server.tool(
    "shopify_update_variant",
    "Update a variant's price, SKU, or compare-at price.",
    {
      variantId: z.string().describe("The variant ID (e.g. gid://shopify/ProductVariant/123)"),
      price: z.string().optional().describe("New price"),
      sku: z.string().optional().describe("New SKU"),
      compareAtPrice: z.string().optional().describe("Original price (for showing discount)"),
    },
    async (args) => {
      try {
        const variant = await updateProductVariant(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(variant, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating variant: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // METAFIELD TOOLS (Custom Data)
  // ============================================================

  // Tool: shopify_get_metafields
  server.tool(
    "shopify_get_metafields",
    "Get custom metafields for a product, customer, or order.",
    {
      ownerId: z.string().describe("The resource ID (e.g. gid://shopify/Product/123)"),
      namespace: z.string().optional().describe("Filter by namespace"),
    },
    async ({ ownerId, namespace }) => {
      try {
        const metafields = await getMetafields(ownerId, namespace, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(metafields, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting metafields: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_set_metafield
  server.tool(
    "shopify_set_metafield",
    "Set a custom metafield on a product, customer, or order.",
    {
      ownerId: z.string().describe("The resource ID (e.g. gid://shopify/Product/123)"),
      namespace: z.string().describe("Namespace (e.g. 'custom', 'my_app')"),
      key: z.string().describe("Key name (e.g. 'color', 'warranty_days')"),
      value: z.string().describe("Value (for JSON, stringify first)"),
      type: z.string().describe("Type: 'single_line_text_field', 'number_integer', 'json', 'boolean', etc."),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:SetMetafield] Setting ${args.namespace}.${args.key} on ${args.ownerId}`
        });
        const metafield = await setMetafield(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(metafield, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error setting metafield: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_delete_metafield
  server.tool(
    "shopify_delete_metafield",
    "Delete a metafield.",
    {
      metafieldId: z.string().describe("The metafield ID to delete"),
    },
    async ({ metafieldId }) => {
      try {
        const result = await deleteMetafield(metafieldId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Metafield deleted. ID: ${result.deletedId}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting metafield: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // ORDER MANAGEMENT TOOLS
  // ============================================================

  // Tool: shopify_add_order_note
  server.tool(
    "shopify_add_order_note",
    "Add or update an internal note on an order.",
    {
      orderId: z.string().describe("The order ID"),
      note: z.string().describe("Note text"),
    },
    async ({ orderId, note }) => {
      try {
        const order = await addOrderNote(orderId, note, session?.shop, session?.accessToken);
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
            text: `Error adding note: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_add_order_tags
  server.tool(
    "shopify_add_order_tags",
    "Add tags to an order for organization/filtering.",
    {
      orderId: z.string().describe("The order ID"),
      tags: z.array(z.string()).describe("Tags to add (e.g. ['urgent', 'wholesale'])"),
    },
    async ({ orderId, tags }) => {
      try {
        const result = await addOrderTags(orderId, tags, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error adding tags: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_cancel_order
  server.tool(
    "shopify_cancel_order",
    "Cancel an order with options to refund and restock.",
    {
      orderId: z.string().describe("The order ID to cancel"),
      reason: z.string().optional().describe("Reason: 'CUSTOMER', 'FRAUD', 'INVENTORY', 'DECLINED', 'OTHER'"),
      notifyCustomer: z.boolean().optional().default(true).describe("Send cancellation email"),
      refund: z.boolean().optional().default(true).describe("Issue refund"),
      restock: z.boolean().optional().default(true).describe("Restock items"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "warning",
          data: `[Tool:CancelOrder] Cancelling order: ${args.orderId}`
        });
        const result = await cancelOrder(
          args.orderId,
          args.reason,
          args.notifyCustomer,
          args.refund,
          args.restock,
          session?.shop,
          session?.accessToken
        );
        return {
          content: [{
            type: "text",
            text: `Order cancellation initiated.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error cancelling order: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // REFUND TOOLS
  // ============================================================

  // Tool: shopify_calculate_refund
  server.tool(
    "shopify_calculate_refund",
    "Get refundable items and amounts for an order.",
    {
      orderId: z.string().describe("The order ID"),
    },
    async ({ orderId }) => {
      try {
        const refundInfo = await calculateRefund(orderId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(refundInfo, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error calculating refund: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_refund
  server.tool(
    "shopify_create_refund",
    "Process a refund for an order.",
    {
      orderId: z.string().describe("The order ID"),
      note: z.string().optional().describe("Refund note"),
      notify: z.boolean().optional().default(true).describe("Notify customer"),
      refundLineItems: z.array(z.object({
        lineItemId: z.string(),
        quantity: z.number()
      })).optional().describe("Specific items to refund"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "warning",
          data: `[Tool:CreateRefund] Processing refund for: ${args.orderId}`
        });
        const refund = await createRefund(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Refund processed.\n${JSON.stringify(refund, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating refund: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // DRAFT ORDER TOOLS (B2B / Quotes)
  // ============================================================

  // Tool: shopify_list_draft_orders
  server.tool(
    "shopify_list_draft_orders",
    "List all draft orders (quotes, pending orders).",
    {
      limit: z.number().min(1).max(50).default(20).describe("Number to return"),
    },
    async ({ limit }) => {
      try {
        const drafts = await getDraftOrders(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(drafts, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing draft orders: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_create_draft_order
  server.tool(
    "shopify_create_draft_order",
    "Create a draft order (quote) for a customer.",
    {
      email: z.string().optional().describe("Customer email"),
      customerId: z.string().optional().describe("Existing customer ID"),
      note: z.string().optional().describe("Order note"),
      tags: z.array(z.string()).optional().describe("Tags"),
      lineItems: z.array(z.object({
        variantId: z.string().optional(),
        title: z.string().optional(),
        quantity: z.number(),
        originalUnitPrice: z.string().optional()
      })).describe("Items: use variantId for products, or title+price for custom items"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateDraftOrder] Creating draft for: ${args.email || args.customerId}`
        });
        const draft = await createDraftOrder(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(draft, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating draft order: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_complete_draft_order
  server.tool(
    "shopify_complete_draft_order",
    "Convert a draft order to a real order.",
    {
      draftOrderId: z.string().describe("The draft order ID"),
      paymentPending: z.boolean().optional().default(false).describe("Mark as payment pending"),
    },
    async ({ draftOrderId, paymentPending }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CompleteDraftOrder] Completing: ${draftOrderId}`
        });
        const result = await completeDraftOrder(draftOrderId, paymentPending, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Draft order completed!\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error completing draft: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_delete_draft_order
  server.tool(
    "shopify_delete_draft_order",
    "Delete a draft order.",
    {
      draftOrderId: z.string().describe("The draft order ID to delete"),
    },
    async ({ draftOrderId }) => {
      try {
        const result = await deleteDraftOrder(draftOrderId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Draft order deleted. ID: ${result.deletedId}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting draft: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // DELETE OPERATION TOOLS
  // ============================================================

  // Tool: shopify_delete_collection
  server.tool(
    "shopify_delete_collection",
    "Delete a collection permanently.",
    {
      collectionId: z.string().describe("The collection ID to delete"),
    },
    async ({ collectionId }) => {
      try {
        server.sendLoggingMessage({
          level: "warning",
          data: `[Tool:DeleteCollection] Deleting: ${collectionId}`
        });
        const result = await deleteCollection(collectionId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Collection deleted. ID: ${result.deletedId}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting collection: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_delete_discount
  server.tool(
    "shopify_delete_discount",
    "Delete a discount code.",
    {
      discountId: z.string().describe("The discount ID to delete"),
    },
    async ({ discountId }) => {
      try {
        const result = await deleteDiscount(discountId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Discount deleted. ID: ${result.deletedId}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting discount: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool: shopify_remove_products_from_collection
  server.tool(
    "shopify_remove_products_from_collection",
    "Remove products from a collection.",
    {
      collectionId: z.string().describe("The collection ID"),
      productIds: z.array(z.string()).describe("Product IDs to remove"),
    },
    async ({ collectionId, productIds }) => {
      try {
        const result = await removeProductsFromCollection(collectionId, productIds, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Products removed from collection.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error removing products: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // BULK VARIANT OPERATIONS
  // These tools let you create or update MULTIPLE product variants at once.
  // Use these when you need to add many sizes/colors/options efficiently.
  // ============================================================

  server.tool(
    "shopify_bulk_create_variants",
    `Create MULTIPLE product variants at once. 
    
USE THIS WHEN: You need to add many sizes, colors, or options to a product efficiently.
EXAMPLE: Adding S, M, L, XL sizes to a t-shirt product in one call.

IMPORTANT: Each variant needs option values matching the product's options.
For a product with "Size" and "Color" options, provide options like ["Large", "Blue"].`,
    {
      productId: z.string().describe("The product ID to add variants to (e.g., gid://shopify/Product/123)"),
      variants: z.array(z.object({
        options: z.array(z.string()).describe("Option values for this variant (e.g., ['Large', 'Blue'])"),
        price: z.string().describe("Price as string (e.g., '29.99')"),
        sku: z.string().optional().describe("Stock Keeping Unit code"),
        barcode: z.string().optional().describe("Barcode/UPC"),
      })).describe("Array of variants to create"),
    },
    async ({ productId, variants }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:BulkCreateVariants] Creating ${variants.length} variants for: ${productId}`
        });
        const result = await bulkCreateProductVariants(productId, variants, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Created ${result?.length || 0} variants successfully.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating variants: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_bulk_update_variants",
    `Update MULTIPLE product variants at once.

USE THIS WHEN: You need to change prices, SKUs, or compare-at prices for many variants.
EXAMPLE: Updating all variant prices for a seasonal sale.

IMPORTANT: You must provide the variant IDs (not product ID) for each variant to update.`,
    {
      productId: z.string().describe("The product ID these variants belong to"),
      variants: z.array(z.object({
        id: z.string().describe("The variant ID to update (e.g., gid://shopify/ProductVariant/123)"),
        price: z.string().optional().describe("New price as string"),
        sku: z.string().optional().describe("New SKU"),
        compareAtPrice: z.string().optional().describe("Original price to show discount (e.g., '49.99' crossed out)"),
      })).describe("Array of variants to update"),
    },
    async ({ productId, variants }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:BulkUpdateVariants] Updating ${variants.length} variants`
        });
        const result = await bulkUpdateProductVariants(productId, variants, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Updated ${result?.length || 0} variants successfully.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating variants: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_bulk_adjust_inventory",
    `Adjust inventory for MULTIPLE items at once.

USE THIS WHEN: You need to update stock levels for many products efficiently.
EXAMPLE: After receiving a shipment, add inventory for multiple items.

IMPORTANT: You need inventoryItemId (from shopify_get_inventory) and locationId (from shopify_get_locations).`,
    {
      adjustments: z.array(z.object({
        inventoryItemId: z.string().describe("The inventory item ID (get from shopify_get_inventory)"),
        locationId: z.string().describe("The location ID (get from shopify_get_locations)"),
        delta: z.number().describe("Quantity change: positive to add, negative to remove (e.g., +50 or -10)"),
      })).describe("Array of inventory adjustments"),
      reason: z.string().optional().default("other").describe("Reason: 'correction', 'received', 'damaged', 'other'"),
    },
    async ({ adjustments, reason }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:BulkAdjustInventory] Adjusting ${adjustments.length} items`
        });
        const result = await bulkAdjustInventory(adjustments, reason, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Inventory adjusted for ${adjustments.length} items.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error adjusting inventory: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // ORDER CREATION & EDITING
  // These tools let you create orders programmatically and edit existing orders.
  // Use for wholesale, imports, POS, or modifying orders after placement.
  // ============================================================

  server.tool(
    "shopify_create_order",
    `Create a new order programmatically WITHOUT going through checkout.

USE THIS WHEN: 
- Importing orders from another system
- Creating wholesale/B2B orders
- Building a custom POS
- Creating orders on behalf of customers

IMPORTANT: This creates a real order. The customer can be notified via sendReceipt option.`,
    {
      email: z.string().optional().describe("Customer email address"),
      phone: z.string().optional().describe("Customer phone number"),
      lineItems: z.array(z.object({
        variantId: z.string().describe("The variant ID to add (e.g., gid://shopify/ProductVariant/123)"),
        quantity: z.number().describe("Quantity to order"),
      })).describe("Products to include in the order"),
      shippingAddress: z.object({
        firstName: z.string(),
        lastName: z.string(),
        address1: z.string(),
        city: z.string(),
        province: z.string().optional(),
        country: z.string(),
        zip: z.string(),
      }).optional().describe("Shipping address for the order"),
      note: z.string().optional().describe("Internal order note"),
      tags: z.array(z.string()).optional().describe("Tags for the order"),
      sendReceipt: z.boolean().optional().default(false).describe("Email order confirmation to customer"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateOrder] Creating order for: ${args.email || args.phone || 'unknown'}`
        });
        const order = await createOrder(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Order created successfully!\n${JSON.stringify(order, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating order: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_begin_order_edit",
    `Start editing an existing order to add/remove items.

USE THIS WHEN: You need to modify an order after it was placed.
This is STEP 1 of a 3-step process:
1. Begin edit (this tool) - returns a calculatedOrderId
2. Make changes using shopify_add_line_item_to_order_edit
3. Commit changes using shopify_commit_order_edit

IMPORTANT: Save the calculatedOrderId from the response for the next steps.`,
    {
      orderId: z.string().describe("The order ID to edit (e.g., gid://shopify/Order/123)"),
    },
    async ({ orderId }) => {
      try {
        const calculated = await beginOrderEdit(orderId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Order edit session started. Use the calculatedOrder.id for next steps:\n${JSON.stringify(calculated, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error starting order edit: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_add_line_item_to_order_edit",
    `Add a product to an order being edited.

USE THIS WHEN: You're in the middle of editing an order (after shopify_begin_order_edit).
This is STEP 2 of a 3-step process.

IMPORTANT: Use the calculatedOrderId from shopify_begin_order_edit, NOT the original order ID.`,
    {
      calculatedOrderId: z.string().describe("The calculated order ID from shopify_begin_order_edit"),
      variantId: z.string().describe("The variant to add (e.g., gid://shopify/ProductVariant/123)"),
      quantity: z.number().describe("Quantity to add"),
    },
    async ({ calculatedOrderId, variantId, quantity }) => {
      try {
        const result = await addLineItemToOrderEdit(calculatedOrderId, variantId, quantity, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Line item added to order edit.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error adding line item: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_commit_order_edit",
    `Finalize and save order edits.

USE THIS WHEN: You've finished making changes to an order and want to apply them.
This is STEP 3 (final step) of the order editing process.

IMPORTANT: This permanently applies all changes made during the edit session.`,
    {
      calculatedOrderId: z.string().describe("The calculated order ID from the edit session"),
      notifyCustomer: z.boolean().optional().default(true).describe("Send update email to customer"),
    },
    async ({ calculatedOrderId, notifyCustomer }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CommitOrderEdit] Committing changes: ${calculatedOrderId}`
        });
        const order = await commitOrderEdit(calculatedOrderId, notifyCustomer, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Order edit committed successfully!\n${JSON.stringify(order, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error committing order edit: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // GIFT CARDS
  // Manage store gift cards - create, list, disable.
  // ============================================================

  server.tool(
    "shopify_list_gift_cards",
    `List all gift cards in the store.

Shows: balance, initial value, expiration, status, and associated customer.
USE THIS WHEN: You need to see all active gift cards or find a specific one.`,
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of gift cards to return"),
    },
    async ({ limit }) => {
      try {
        const giftCards = await getGiftCards(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(giftCards, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing gift cards: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_create_gift_card",
    `Create a new gift card.

USE THIS WHEN: Creating gift cards for promotions, customer rewards, or refund alternatives.

IMPORTANT: The gift card CODE is only shown ONCE in the response. Save it immediately!
The code is what customers use at checkout.`,
    {
      initialValue: z.string().describe("Gift card value (e.g., '50.00')"),
      note: z.string().optional().describe("Internal note about the gift card"),
      expiresOn: z.string().optional().describe("Expiration date (ISO format: 2025-12-31)"),
      customerId: z.string().optional().describe("Associate with a customer (optional)"),
    },
    async (args) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateGiftCard] Creating gift card: $${args.initialValue}`
        });
        const result = await createGiftCard(args, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Gift card created! SAVE THIS CODE (only shown once):\n\nCODE: ${result.giftCardCode}\n\nDetails:\n${JSON.stringify(result.giftCard, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating gift card: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_disable_gift_card",
    `Disable a gift card so it can no longer be used.

USE THIS WHEN: A gift card was issued in error, suspected fraud, or needs to be revoked.
NOTE: This doesn't delete the card, just prevents it from being used at checkout.`,
    {
      giftCardId: z.string().describe("The gift card ID to disable"),
    },
    async ({ giftCardId }) => {
      try {
        const result = await disableGiftCard(giftCardId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Gift card disabled successfully.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error disabling gift card: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // WEBHOOKS
  // Register callbacks for store events. Essential for integrations.
  // ============================================================

  server.tool(
    "shopify_list_webhooks",
    `List all registered webhooks for the store.

Shows: topic (event type), callback URL, format, and creation date.
USE THIS WHEN: Checking what integrations are connected or debugging webhook issues.`,
    {},
    async () => {
      try {
        const webhooks = await getWebhooks(50, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(webhooks, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing webhooks: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_create_webhook",
    `Register a new webhook to receive event notifications.

USE THIS WHEN: Setting up integrations that need to react to store events.

COMMON TOPICS:
- ORDERS_CREATE - New order placed
- ORDERS_PAID - Order payment received
- ORDERS_FULFILLED - Order shipped
- PRODUCTS_CREATE, PRODUCTS_UPDATE, PRODUCTS_DELETE
- CUSTOMERS_CREATE, CUSTOMERS_UPDATE
- INVENTORY_LEVELS_UPDATE
- CHECKOUTS_CREATE, CHECKOUTS_UPDATE`,
    {
      topic: z.string().describe("Event topic (e.g., 'ORDERS_CREATE', 'PRODUCTS_UPDATE')"),
      callbackUrl: z.string().describe("HTTPS URL to receive webhook data"),
    },
    async ({ topic, callbackUrl }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:CreateWebhook] Registering webhook: ${topic} -> ${callbackUrl}`
        });
        const webhook = await createWebhook(topic, callbackUrl, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Webhook registered successfully!\n${JSON.stringify(webhook, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating webhook: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_delete_webhook",
    `Delete a webhook subscription.

USE THIS WHEN: Removing an integration or cleaning up unused webhooks.`,
    {
      webhookId: z.string().describe("The webhook subscription ID to delete"),
    },
    async ({ webhookId }) => {
      try {
        const result = await deleteWebhook(webhookId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Webhook deleted. ID: ${result.deletedId}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting webhook: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // FILES / MEDIA
  // Upload and manage store media files.
  // ============================================================

  server.tool(
    "shopify_list_files",
    `List files/media in the store's file library.

Shows: images, videos, and generic files with URLs and metadata.
USE THIS WHEN: Finding existing media or checking what files are uploaded.`,
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of files to return"),
      query: z.string().optional().describe("Search query to filter files"),
    },
    async ({ limit, query }) => {
      try {
        const files = await getFiles(limit, query, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(files, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing files: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_upload_file",
    `Upload a file to Shopify from a URL.

USE THIS WHEN: Adding images for products, blog posts, or general store assets.
The file is copied from the provided URL to Shopify's CDN.

IMPORTANT: The URL must be publicly accessible for Shopify to fetch it.`,
    {
      url: z.string().describe("Public URL of the file to upload"),
      altText: z.string().optional().describe("Alt text for accessibility (for images)"),
    },
    async ({ url, altText }) => {
      try {
        server.sendLoggingMessage({
          level: "info",
          data: `[Tool:UploadFile] Uploading from: ${url}`
        });
        const files = await createFileFromUrl(url, altText, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `File uploaded successfully!\n${JSON.stringify(files, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error uploading file: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_delete_file",
    `Delete a file from Shopify.

USE THIS WHEN: Removing unused media to clean up the file library.
NOTE: If the file is used by a product or page, it may break those references.`,
    {
      fileId: z.string().describe("The file ID to delete"),
    },
    async ({ fileId }) => {
      try {
        const result = await deleteFile(fileId, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `File deleted. IDs: ${result.deletedIds?.join(', ')}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error deleting file: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // SEARCH
  // Powerful search tools for products and customers.
  // ============================================================

  server.tool(
    "shopify_search_products",
    `Search products with filters.

USE THIS WHEN: Finding products by title, vendor, type, status, or any attribute.

QUERY EXAMPLES:
- "title:blue shirt" - Find products with "blue shirt" in title
- "vendor:Nike" - Find all Nike products  
- "status:ACTIVE" - Find only active products
- "inventory_total:<10" - Low stock products
- "created_at:>2024-01-01" - Products created after date
- "tag:sale" - Products with 'sale' tag`,
    {
      query: z.string().describe("Search query with filters"),
      limit: z.number().min(1).max(50).default(20).describe("Number of results"),
    },
    async ({ query, limit }) => {
      try {
        const results = await searchProducts(query, limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error searching products: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_search_customers",
    `Search customers with filters.

USE THIS WHEN: Finding customers by email, name, orders, spend, or tags.

QUERY EXAMPLES:
- "email:john@example.com" - Find by email
- "first_name:John" - Find by first name
- "orders_count:>5" - Customers with many orders
- "total_spent:>1000" - High-value customers
- "tag:vip" - VIP customers
- "created_at:>2024-01-01" - New customers`,
    {
      query: z.string().describe("Search query with filters"),
      limit: z.number().min(1).max(50).default(20).describe("Number of results"),
    },
    async ({ query, limit }) => {
      try {
        const results = await searchCustomers(query, limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error searching customers: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // PRICE RULES
  // View automatic discounts and price rules.
  // ============================================================

  server.tool(
    "shopify_list_price_rules",
    `List all price rules (automatic discounts).

Shows: title, status, value (percentage or fixed), dates, usage limits.
USE THIS WHEN: Reviewing active promotions or checking discount rules.
NOTE: Price rules are different from discount CODES (use shopify_list_discounts for codes).`,
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of rules to return"),
    },
    async ({ limit }) => {
      try {
        const rules = await getPriceRules(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(rules, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing price rules: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // PRODUCT TAGS
  // Add or remove tags from products for organization.
  // ============================================================

  server.tool(
    "shopify_add_product_tags",
    `Add tags to a product.

USE THIS WHEN: Organizing products for collections, filtering, or marketing.
Tags are useful for: seasonal items ('summer', 'holiday'), status ('new', 'clearance'), 
attributes ('organic', 'vegan'), or internal organization ('featured', 'homepage').`,
    {
      productId: z.string().describe("The product ID"),
      tags: z.array(z.string()).describe("Tags to add (e.g., ['sale', 'featured', 'new-arrival'])"),
    },
    async ({ productId, tags }) => {
      try {
        const result = await addProductTags(productId, tags, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Tags added successfully.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error adding tags: ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    "shopify_remove_product_tags",
    `Remove tags from a product.

USE THIS WHEN: A promotion ends, product status changes, or cleaning up organization.`,
    {
      productId: z.string().describe("The product ID"),
      tags: z.array(z.string()).describe("Tags to remove"),
    },
    async ({ productId, tags }) => {
      try {
        const result = await removeProductTags(productId, tags, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: `Tags removed successfully.\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error removing tags: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // INTERNATIONAL / MARKETS
  // View international selling configuration.
  // ============================================================

  server.tool(
    "shopify_list_markets",
    `List all markets (international selling regions).

Shows: market name, enabled status, countries, and currency settings.
USE THIS WHEN: Understanding international pricing or checking market configuration.
Markets control: pricing, currency, languages, and shipping for different regions.`,
    {},
    async () => {
      try {
        const markets = await getMarkets(session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(markets, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing markets: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // SHIPPING PROFILES
  // View shipping zones and rates.
  // ============================================================

  server.tool(
    "shopify_list_shipping_profiles",
    `List delivery/shipping profiles, zones, and rates.

Shows: shipping zones, countries, and rate definitions.
USE THIS WHEN: Understanding shipping configuration or checking rates.

NOTE: This shows read-only information. Shipping rate creation requires Shopify admin.`,
    {},
    async () => {
      try {
        const profiles = await getDeliveryProfiles(session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(profiles, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing shipping profiles: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // ABANDONED CHECKOUTS
  // View checkouts that didn't complete.
  // ============================================================

  server.tool(
    "shopify_list_abandoned_checkouts",
    `List abandoned checkouts (customers who didn't complete purchase).

Shows: cart value, customer info, items, and creation date.
USE THIS WHEN: Analyzing cart abandonment, planning recovery campaigns, or understanding lost sales.

TIP: Use this data to send recovery emails or identify checkout friction points.`,
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of checkouts to return"),
    },
    async ({ limit }) => {
      try {
        const checkouts = await getAbandonedCheckouts(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(checkouts, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing abandoned checkouts: ${error.message}`
          }]
        };
      }
    }
  );

  // ============================================================
  // STORE CREDIT
  // View customers with store credit.
  // ============================================================

  server.tool(
    "shopify_list_store_credits",
    `List customers who have store credit balances.

Shows: customer info and credit balance.
USE THIS WHEN: Checking store credit usage or finding customers with credit to spend.

NOTE: Store credit is different from gift cards - it's usually issued as refund alternatives.`,
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of customers to return"),
    },
    async ({ limit }) => {
      try {
        const accounts = await getStoreCreditAccounts(limit, session?.shop, session?.accessToken);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(accounts, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing store credits: ${error.message}`
          }]
        };
      }
    }
  );

  return server;
}
