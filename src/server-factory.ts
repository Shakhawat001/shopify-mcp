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

  return server;
}
