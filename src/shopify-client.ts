import dotenv from 'dotenv';
dotenv.config();

const API_VERSION = "2025-01";

// Helper to get headers
function getHeaders(accessToken?: string) {
  const token = accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing Shopify Access Token");
  }
  return {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  };
}

// Helper to get endpoint
function getEndpoint(shopDomain?: string) {
  const domain = shopDomain || process.env.SHOPIFY_SHOP_DOMAIN;
  if (!domain) {
    throw new Error("Missing Shopify Shop Domain");
  }
  return `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
}

async function shopifyGraphQL(query: string, variables?: any, shopDomain?: string, accessToken?: string) {
  const endpoint = getEndpoint(shopDomain);
  const headers = getHeaders(accessToken);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API Error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(`GraphQL Errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  } catch (error) {
    console.error("Shopify Request Failed:", error);
    throw error;
  }
}

export async function getProducts(first = 5, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            description
            totalInventory
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

export async function getRecentOrders(first = 5, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetOrders($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            displayFulfillmentStatus
            lineItems(first: 5) {
              edges {
                node {
                  title
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

export async function createProduct(input: { title: string; description?: string; price?: string; status?: "ACTIVE" | "DRAFT" | "ARCHIVED" }, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      title: input.title,
      descriptionHtml: input.description,
      status: input.status,
      variants: input.price ? [{ price: input.price }] : undefined,
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.productCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.productCreate.userErrors)}`);
  }
  
  return data.productCreate?.product;
}

export async function getProduct(id: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        descriptionHtml
        totalInventory
        status
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id }, shopDomain, accessToken);
  return data.product;
}

// ============================================================
// BLOG POSTS FUNCTIONS (Enhanced)
// ============================================================

export async function getBlogs(first = 10, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetBlogs($first: Int!) {
      blogs(first: $first) {
        edges {
          node {
            id
            title
            handle
            onlineStoreUrl
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

export async function getBlogArticles(blogId: string, first = 10, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetBlogArticles($blogId: ID!, $first: Int!) {
      blog(id: $blogId) {
        id
        title
        handle
        articles(first: $first, sortKey: PUBLISHED_AT, reverse: true) {
          edges {
            node {
              id
              title
              handle
              publishedAt
              createdAt
              summary
              tags
              isPublished
              author {
                name
                email
              }
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { blogId, first }, shopDomain, accessToken);
}

export async function getArticle(articleId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetArticle($id: ID!) {
      article(id: $id) {
        id
        title
        handle
        body
        summary
        tags
        isPublished
        publishedAt
        createdAt
        author {
          name
          email
        }
        image {
          url
          altText
        }
        seo {
          title
          description
        }
        blog {
          id
          title
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id: articleId }, shopDomain, accessToken);
  return data.article;
}

export async function createBlogArticle(
  input: { 
    blogId: string; 
    title: string; 
    body: string; 
    author?: string; 
    authorEmail?: string;
    summary?: string; 
    tags?: string[];
    imageUrl?: string;
    imageAltText?: string;
    seoTitle?: string;
    seoDescription?: string;
    published?: boolean;
  },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation articleCreate($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article {
          id
          title
          handle
          publishedAt
          isPublished
          tags
          author {
            name
          }
          blog {
            id
            title
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables: any = {
    article: {
      blogId: input.blogId,
      title: input.title,
      body: input.body,
      summary: input.summary,
      tags: input.tags,
      isPublished: input.published ?? false,
    }
  };

  // Add author if provided
  if (input.author) {
    variables.article.author = {
      name: input.author,
      email: input.authorEmail
    };
  }

  // Add image if provided
  if (input.imageUrl) {
    variables.article.image = {
      src: input.imageUrl,
      altText: input.imageAltText || input.title
    };
  }

  // Add SEO if provided
  if (input.seoTitle || input.seoDescription) {
    variables.article.seo = {
      title: input.seoTitle,
      description: input.seoDescription
    };
  }

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.articleCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.articleCreate.userErrors)}`);
  }
  
  return data.articleCreate?.article;
}

export async function updateBlogArticle(
  input: { 
    articleId: string; 
    title?: string; 
    body?: string; 
    summary?: string; 
    tags?: string[];
    imageUrl?: string;
    imageAltText?: string;
    seoTitle?: string;
    seoDescription?: string;
    published?: boolean;
  },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation articleUpdate($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article {
          id
          title
          handle
          publishedAt
          isPublished
          tags
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const articleUpdate: any = {};
  
  if (input.title !== undefined) articleUpdate.title = input.title;
  if (input.body !== undefined) articleUpdate.body = input.body;
  if (input.summary !== undefined) articleUpdate.summary = input.summary;
  if (input.tags !== undefined) articleUpdate.tags = input.tags;
  if (input.published !== undefined) articleUpdate.isPublished = input.published;
  
  // Add image if provided
  if (input.imageUrl) {
    articleUpdate.image = {
      src: input.imageUrl,
      altText: input.imageAltText || ''
    };
  }

  // Add SEO if provided
  if (input.seoTitle || input.seoDescription) {
    articleUpdate.seo = {
      title: input.seoTitle,
      description: input.seoDescription
    };
  }

  const variables = {
    id: input.articleId,
    article: articleUpdate
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.articleUpdate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.articleUpdate.userErrors)}`);
  }
  
  return data.articleUpdate?.article;
}

export async function deleteArticle(articleId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation articleDelete($id: ID!) {
      articleDelete(id: $id) {
        deletedArticleId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: articleId }, shopDomain, accessToken);
  
  if (data.articleDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.articleDelete.userErrors)}`);
  }
  
  return { deletedArticleId: data.articleDelete?.deletedArticleId };
}

export async function publishArticle(articleId: string, publish: boolean = true, shopDomain?: string, accessToken?: string) {
  // This is a convenience wrapper around updateBlogArticle
  return updateBlogArticle({ articleId, published: publish }, shopDomain, accessToken);
}


// ============================================================
// ANALYTICS FUNCTIONS
// ============================================================

export async function getShopAnalytics(shopDomain?: string, accessToken?: string) {
  // Note: Shopify's analytics API is limited. We'll fetch what's available via GraphQL.
  // For detailed analytics, merchants typically need the Analytics API or reports.
  const query = `
    query GetShopAnalytics {
      shop {
        name
        currencyCode
        plan {
          displayName
        }
        primaryDomain {
          url
        }
      }
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            displayFulfillmentStatus
            displayFinancialStatus
          }
        }
      }
      products(first: 1) {
        pageInfo {
          hasNextPage
        }
      }
    }
  `;
  
  const data = await shopifyGraphQL(query, {}, shopDomain, accessToken);
  
  // Calculate some basic analytics from the orders
  const orders = data.orders?.edges || [];
  const totalRevenue = orders.reduce((sum: number, edge: any) => {
    return sum + parseFloat(edge.node.totalPriceSet?.shopMoney?.amount || 0);
  }, 0);
  
  const fulfillmentStats = orders.reduce((acc: any, edge: any) => {
    const status = edge.node.displayFulfillmentStatus || 'UNKNOWN';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    shop: data.shop,
    recentOrdersCount: orders.length,
    totalRevenueRecent: totalRevenue,
    currency: data.shop?.currencyCode,
    fulfillmentBreakdown: fulfillmentStats,
    recentOrders: orders.slice(0, 10).map((e: any) => e.node),
  };
}

// ============================================================
// PRODUCT MUTATIONS (Update/Delete)
// ============================================================

export async function updateProduct(
  input: { productId: string; title?: string; description?: string; status?: "ACTIVE" | "DRAFT" | "ARCHIVED" },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      id: input.productId,
      title: input.title,
      descriptionHtml: input.description,
      status: input.status,
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.productUpdate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.productUpdate.userErrors)}`);
  }
  
  return data.productUpdate?.product;
}

export async function deleteProduct(productId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation productDelete($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      id: productId,
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.productDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.productDelete.userErrors)}`);
  }
  
  return { deletedProductId: data.productDelete?.deletedProductId };
}

// ============================================================
// ORDER DETAILS
// ============================================================

export async function getOrder(orderId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetOrder($id: ID!) {
      order(id: $id) {
        id
        name
        createdAt
        email
        phone
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
          }
        }
        displayFulfillmentStatus
        displayFinancialStatus
        shippingAddress {
          address1
          address2
          city
          province
          country
          zip
        }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
        customer {
          firstName
          lastName
          email
        }
      }
    }
  `;
  
  const data = await shopifyGraphQL(query, { id: orderId }, shopDomain, accessToken);
  return data.order;
}
