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

// ============================================================
// CUSTOMER FUNCTIONS
// ============================================================

export async function getCustomers(first = 10, query?: string, shopDomain?: string, accessToken?: string) {
  const gql = `
    query GetCustomers($first: Int!, $query: String) {
      customers(first: $first, query: $query) {
        edges {
          node {
            id
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            createdAt
            tags
            verifiedEmail
            validEmailAddress
            note
          }
        }
      }
    }
  `;
  return shopifyGraphQL(gql, { first, query: query || null }, shopDomain, accessToken);
}

export async function getCustomer(customerId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetCustomer($id: ID!) {
      customer(id: $id) {
        id
        firstName
        lastName
        email
        phone
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
        createdAt
        updatedAt
        tags
        note
        defaultAddress {
          address1
          address2
          city
          province
          country
          zip
        }
        orders(first: 10) {
          edges {
            node {
              id
              name
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id: customerId }, shopDomain, accessToken);
  return data.customer;
}

export async function createCustomer(
  input: { firstName?: string; lastName?: string; email?: string; phone?: string; note?: string; tags?: string[] },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          firstName
          lastName
          email
          phone
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input }, shopDomain, accessToken);
  
  if (data.customerCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.customerCreate.userErrors)}`);
  }
  
  return data.customerCreate?.customer;
}

export async function updateCustomer(
  input: { customerId: string; firstName?: string; lastName?: string; email?: string; phone?: string; note?: string; tags?: string[] },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation customerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          firstName
          lastName
          email
          phone
          tags
          note
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const { customerId, ...rest } = input;
  const data = await shopifyGraphQL(query, { input: { id: customerId, ...rest } }, shopDomain, accessToken);
  
  if (data.customerUpdate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.customerUpdate.userErrors)}`);
  }
  
  return data.customerUpdate?.customer;
}

// ============================================================
// INVENTORY FUNCTIONS
// ============================================================

export async function getInventoryLevels(productId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetInventoryLevels($id: ID!) {
      product(id: $id) {
        id
        title
        totalInventory
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              inventoryQuantity
              inventoryItem {
                id
                tracked
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      id
                      available
                      location {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id: productId }, shopDomain, accessToken);
  return data.product;
}

export async function adjustInventory(
  input: { inventoryItemId: string; locationId: string; delta: number; reason?: string },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        inventoryAdjustmentGroup {
          reason
          changes {
            name
            delta
          }
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
      reason: input.reason || "other",
      name: "available",
      changes: [{
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        delta: input.delta
      }]
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.inventoryAdjustQuantities?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.inventoryAdjustQuantities.userErrors)}`);
  }
  
  return data.inventoryAdjustQuantities?.inventoryAdjustmentGroup;
}

export async function getLocations(shopDomain?: string, accessToken?: string) {
  const query = `
    query GetLocations {
      locations(first: 50) {
        edges {
          node {
            id
            name
            address {
              address1
              city
              country
            }
            isActive
            fulfillmentService {
              serviceName
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, {}, shopDomain, accessToken);
}

// ============================================================
// COLLECTION FUNCTIONS
// ============================================================

export async function getCollections(first = 20, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetCollections($first: Int!) {
      collections(first: $first) {
        edges {
          node {
            id
            title
            handle
            description
            productsCount
            sortOrder
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

export async function getCollection(collectionId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetCollection($id: ID!) {
      collection(id: $id) {
        id
        title
        handle
        description
        productsCount
        sortOrder
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id: collectionId }, shopDomain, accessToken);
  return data.collection;
}

export async function createCollection(
  input: { title: string; description?: string; },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation collectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input }, shopDomain, accessToken);
  
  if (data.collectionCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.collectionCreate.userErrors)}`);
  }
  
  return data.collectionCreate?.collection;
}

export async function addProductsToCollection(
  collectionId: string,
  productIds: string[],
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection {
          id
          title
          productsCount
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: collectionId, productIds }, shopDomain, accessToken);
  
  if (data.collectionAddProducts?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.collectionAddProducts.userErrors)}`);
  }
  
  return data.collectionAddProducts?.collection;
}

// ============================================================
// DISCOUNT FUNCTIONS
// ============================================================

export async function getDiscounts(first = 20, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetDiscounts($first: Int!) {
      discountNodes(first: $first) {
        edges {
          node {
            id
            discount {
              ... on DiscountCodeBasic {
                title
                status
                codes(first: 5) {
                  edges {
                    node {
                      code
                    }
                  }
                }
                startsAt
                endsAt
              }
              ... on DiscountCodeBxgy {
                title
                status
                startsAt
                endsAt
              }
              ... on DiscountCodeFreeShipping {
                title
                status
                startsAt
                endsAt
              }
              ... on DiscountAutomaticBasic {
                title
                status
                startsAt
                endsAt
              }
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

export async function createDiscountCode(
  input: { 
    title: string; 
    code: string; 
    percentOff?: number;
    amountOff?: number;
    startsAt?: string;
    endsAt?: string;
    usageLimit?: number;
  },
  shopDomain?: string,
  accessToken?: string
) {
  // Using basic discount code
  const query = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const customerGets: any = {
    items: { all: true },
  };

  if (input.percentOff) {
    customerGets.value = { percentage: input.percentOff / 100 };
  } else if (input.amountOff) {
    customerGets.value = { discountAmount: { amount: input.amountOff, appliesOnEachItem: false } };
  } else {
    customerGets.value = { percentage: 0.1 }; // Default 10%
  }

  const variables = {
    basicCodeDiscount: {
      title: input.title,
      code: input.code,
      startsAt: input.startsAt || new Date().toISOString(),
      endsAt: input.endsAt,
      usageLimit: input.usageLimit,
      customerGets,
      customerSelection: { all: true },
      appliesOncePerCustomer: true,
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.discountCodeBasicCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.discountCodeBasicCreate.userErrors)}`);
  }
  
  return data.discountCodeBasicCreate?.codeDiscountNode;
}

// ============================================================
// FULFILLMENT FUNCTIONS
// ============================================================

export async function getOrderFulfillments(orderId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetOrderFulfillments($id: ID!) {
      order(id: $id) {
        id
        name
        displayFulfillmentStatus
        fulfillments {
          id
          status
          createdAt
          trackingInfo {
            company
            number
            url
          }
          fulfillmentLineItems(first: 50) {
            edges {
              node {
                lineItem {
                  title
                  quantity
                }
                quantity
              }
            }
          }
        }
        fulfillmentOrders(first: 10) {
          edges {
            node {
              id
              status
              assignedLocation {
                name
              }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    totalQuantity
                    remainingQuantity
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id: orderId }, shopDomain, accessToken);
  return data.order;
}

export async function createFulfillment(
  input: { fulfillmentOrderId: string; trackingNumber?: string; trackingCompany?: string; trackingUrl?: string; notifyCustomer?: boolean },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
      fulfillmentCreateV2(fulfillment: $fulfillment) {
        fulfillment {
          id
          status
          trackingInfo {
            company
            number
            url
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
    fulfillment: {
      lineItemsByFulfillmentOrder: [{
        fulfillmentOrderId: input.fulfillmentOrderId
      }],
      notifyCustomer: input.notifyCustomer ?? true,
    }
  };

  if (input.trackingNumber || input.trackingCompany) {
    variables.fulfillment.trackingInfo = {
      number: input.trackingNumber,
      company: input.trackingCompany,
      url: input.trackingUrl
    };
  }

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.fulfillmentCreateV2?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.fulfillmentCreateV2.userErrors)}`);
  }
  
  return data.fulfillmentCreateV2?.fulfillment;
}

// ============================================================
// SHOP INFO
// ============================================================

export async function getShopInfo(shopDomain?: string, accessToken?: string) {
  const query = `
    query GetShopInfo {
      shop {
        id
        name
        email
        url
        primaryDomain {
          url
          host
        }
        currencyCode
        weightUnit
        timezoneAbbreviation
        ianaTimezone
        plan {
          displayName
          partnerDevelopment
          shopifyPlus
        }
        contactEmail
        billingAddress {
          address1
          city
          country
          zip
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, {}, shopDomain, accessToken);
  return data.shop;
}

// ============================================================
// PRODUCT VARIANTS
// ============================================================

export async function getProductVariants(productId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetProductVariants($id: ID!) {
      product(id: $id) {
        id
        title
        options {
          id
          name
          values
        }
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
              selectedOptions {
                name
                value
              }
              image {
                url
              }
              inventoryItem {
                id
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id: productId }, shopDomain, accessToken);
  return data.product;
}

export async function createProductVariant(
  input: { productId: string; options: string[]; price: string; sku?: string; inventoryQuantity?: number },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation productVariantCreate($input: ProductVariantInput!) {
      productVariantCreate(input: $input) {
        productVariant {
          id
          title
          sku
          price
          inventoryQuantity
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
      productId: input.productId,
      options: input.options,
      price: input.price,
      sku: input.sku,
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.productVariantCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.productVariantCreate.userErrors)}`);
  }
  
  return data.productVariantCreate?.productVariant;
}

export async function updateProductVariant(
  input: { variantId: string; price?: string; sku?: string; compareAtPrice?: string },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation productVariantUpdate($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
          title
          sku
          price
          compareAtPrice
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
      id: input.variantId,
      price: input.price,
      sku: input.sku,
      compareAtPrice: input.compareAtPrice,
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.productVariantUpdate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.productVariantUpdate.userErrors)}`);
  }
  
  return data.productVariantUpdate?.productVariant;
}

// ============================================================
// METAFIELDS (Custom Data)
// ============================================================

export async function getMetafields(
  ownerId: string, // e.g. gid://shopify/Product/123
  namespace?: string,
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    query GetMetafields($ownerId: ID!, $namespace: String) {
      node(id: $ownerId) {
        ... on Product {
          metafields(first: 50, namespace: $namespace) {
            edges {
              node {
                id
                namespace
                key
                value
                type
                description
              }
            }
          }
        }
        ... on Customer {
          metafields(first: 50, namespace: $namespace) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
        ... on Order {
          metafields(first: 50, namespace: $namespace) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { ownerId, namespace: namespace || null }, shopDomain, accessToken);
  return data.node;
}

export async function setMetafield(
  input: { ownerId: string; namespace: string; key: string; value: string; type: string },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
          type
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [{
      ownerId: input.ownerId,
      namespace: input.namespace,
      key: input.key,
      value: input.value,
      type: input.type, // e.g. "single_line_text_field", "number_integer", "json"
    }]
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.metafieldsSet?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
  }
  
  return data.metafieldsSet?.metafields;
}

export async function deleteMetafield(metafieldId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation metafieldDelete($input: MetafieldDeleteInput!) {
      metafieldDelete(input: $input) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input: { id: metafieldId } }, shopDomain, accessToken);
  
  if (data.metafieldDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.metafieldDelete.userErrors)}`);
  }
  
  return { deletedId: data.metafieldDelete?.deletedId };
}

// ============================================================
// ORDER MANAGEMENT
// ============================================================

export async function addOrderNote(orderId: string, note: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation orderUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        order {
          id
          name
          note
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input: { id: orderId, note } }, shopDomain, accessToken);
  
  if (data.orderUpdate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.orderUpdate.userErrors)}`);
  }
  
  return data.orderUpdate?.order;
}

export async function addOrderTags(orderId: string, tags: string[], shopDomain?: string, accessToken?: string) {
  const query = `
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          ... on Order {
            id
            tags
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: orderId, tags }, shopDomain, accessToken);
  
  if (data.tagsAdd?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.tagsAdd.userErrors)}`);
  }
  
  return data.tagsAdd?.node;
}

export async function cancelOrder(
  orderId: string, 
  reason?: string,
  notifyCustomer?: boolean,
  refund?: boolean,
  restock?: boolean,
  shopDomain?: string, 
  accessToken?: string
) {
  const query = `
    mutation orderCancel($orderId: ID!, $reason: OrderCancelReason!, $notifyCustomer: Boolean, $refund: Boolean, $restock: Boolean) {
      orderCancel(orderId: $orderId, reason: $reason, notifyCustomer: $notifyCustomer, refund: $refund, restock: $restock) {
        job {
          id
        }
        orderCancelUserErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    orderId,
    reason: reason || "OTHER",
    notifyCustomer: notifyCustomer ?? true,
    refund: refund ?? true,
    restock: restock ?? true,
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.orderCancel?.orderCancelUserErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.orderCancel.orderCancelUserErrors)}`);
  }
  
  return { job: data.orderCancel?.job, success: true };
}

// ============================================================
// REFUNDS
// ============================================================

export async function calculateRefund(orderId: string, shopDomain?: string, accessToken?: string) {
  // Get order details to calculate refund
  const query = `
    query GetOrderForRefund($id: ID!) {
      order(id: $id) {
        id
        name
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        refundable
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              quantity
              refundableQuantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
        transactions(first: 10) {
          id
          kind
          amountSet {
            shopMoney {
              amount
            }
          }
        }
      }
    }
  `;
  
  const data = await shopifyGraphQL(query, { id: orderId }, shopDomain, accessToken);
  return data.order;
}

export async function createRefund(
  input: { orderId: string; note?: string; notify?: boolean; refundLineItems?: { lineItemId: string; quantity: number }[] },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation refundCreate($input: RefundInput!) {
      refundCreate(input: $input) {
        refund {
          id
          note
          createdAt
          totalRefundedSet {
            shopMoney {
              amount
            }
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
    input: {
      orderId: input.orderId,
      note: input.note,
      notify: input.notify ?? true,
    }
  };

  if (input.refundLineItems) {
    variables.input.refundLineItems = input.refundLineItems.map(item => ({
      lineItemId: item.lineItemId,
      quantity: item.quantity,
      restockType: "RETURN"
    }));
  }

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.refundCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.refundCreate.userErrors)}`);
  }
  
  return data.refundCreate?.refund;
}

// ============================================================
// DRAFT ORDERS (For B2B, Quotes, Manual Orders)
// ============================================================

export async function getDraftOrders(first = 20, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetDraftOrders($first: Int!) {
      draftOrders(first: $first, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            status
            createdAt
            updatedAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              firstName
              lastName
              email
            }
            lineItems(first: 10) {
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

export async function createDraftOrder(
  input: { 
    customerId?: string;
    email?: string;
    note?: string;
    tags?: string[];
    lineItems: { variantId?: string; title?: string; quantity: number; originalUnitPrice?: string }[];
  },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          status
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const lineItems = input.lineItems.map(item => {
    if (item.variantId) {
      return { variantId: item.variantId, quantity: item.quantity };
    } else {
      return { 
        title: item.title || "Custom Item", 
        quantity: item.quantity,
        originalUnitPrice: item.originalUnitPrice || "0.00"
      };
    }
  });

  const variables: any = {
    input: {
      lineItems,
      note: input.note,
      tags: input.tags,
    }
  };

  if (input.customerId) {
    variables.input.customerId = input.customerId;
  } else if (input.email) {
    variables.input.email = input.email;
  }

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.draftOrderCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.draftOrderCreate.userErrors)}`);
  }
  
  return data.draftOrderCreate?.draftOrder;
}

export async function completeDraftOrder(draftOrderId: string, paymentPending?: boolean, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder {
          id
          status
          order {
            id
            name
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: draftOrderId, paymentPending: paymentPending ?? false }, shopDomain, accessToken);
  
  if (data.draftOrderComplete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.draftOrderComplete.userErrors)}`);
  }
  
  return data.draftOrderComplete?.draftOrder;
}

export async function deleteDraftOrder(draftOrderId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation draftOrderDelete($input: DraftOrderDeleteInput!) {
      draftOrderDelete(input: $input) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input: { id: draftOrderId } }, shopDomain, accessToken);
  
  if (data.draftOrderDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.draftOrderDelete.userErrors)}`);
  }
  
  return { deletedId: data.draftOrderDelete?.deletedId };
}

// ============================================================
// DELETE OPERATIONS
// ============================================================

export async function deleteCollection(collectionId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation collectionDelete($input: CollectionDeleteInput!) {
      collectionDelete(input: $input) {
        deletedCollectionId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { input: { id: collectionId } }, shopDomain, accessToken);
  
  if (data.collectionDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.collectionDelete.userErrors)}`);
  }
  
  return { deletedId: data.collectionDelete?.deletedCollectionId };
}

export async function deleteDiscount(discountId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation discountCodeDelete($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: discountId }, shopDomain, accessToken);
  
  if (data.discountCodeDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.discountCodeDelete.userErrors)}`);
  }
  
  return { deletedId: data.discountCodeDelete?.deletedCodeDiscountId };
}

export async function removeProductsFromCollection(
  collectionId: string,
  productIds: string[],
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation collectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        job {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: collectionId, productIds }, shopDomain, accessToken);
  
  if (data.collectionRemoveProducts?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.collectionRemoveProducts.userErrors)}`);
  }
  
  return { success: true, job: data.collectionRemoveProducts?.job };
}

// ============================================================
// BULK PRODUCT OPERATIONS
// ============================================================

export async function bulkCreateProductVariants(
  productId: string,
  variants: { options: string[]; price: string; sku?: string; barcode?: string }[],
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants {
          id
          title
          sku
          price
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variantInputs = variants.map(v => ({
    optionValues: v.options.map((opt, idx) => ({ optionName: `Option${idx + 1}`, name: opt })),
    price: v.price,
    sku: v.sku,
    barcode: v.barcode,
  }));

  const data = await shopifyGraphQL(query, { productId, variants: variantInputs }, shopDomain, accessToken);
  
  if (data.productVariantsBulkCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.productVariantsBulkCreate.userErrors)}`);
  }
  
  return data.productVariantsBulkCreate?.productVariants;
}

export async function bulkUpdateProductVariants(
  productId: string,
  variants: { id: string; price?: string; sku?: string; compareAtPrice?: string }[],
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          title
          sku
          price
          compareAtPrice
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { productId, variants }, shopDomain, accessToken);
  
  if (data.productVariantsBulkUpdate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.productVariantsBulkUpdate.userErrors)}`);
  }
  
  return data.productVariantsBulkUpdate?.productVariants;
}

// ============================================================
// ORDER CREATION (For imports, wholesale, POS)
// ============================================================

export async function createOrder(
  input: {
    email?: string;
    phone?: string;
    lineItems: { variantId: string; quantity: number }[];
    shippingAddress?: {
      firstName: string;
      lastName: string;
      address1: string;
      city: string;
      province?: string;
      country: string;
      zip: string;
    };
    note?: string;
    tags?: string[];
    sendReceipt?: boolean;
  },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order {
          id
          name
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          displayFulfillmentStatus
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const orderInput: any = {
    lineItems: input.lineItems,
  };

  if (input.email) orderInput.email = input.email;
  if (input.phone) orderInput.phone = input.phone;
  if (input.shippingAddress) orderInput.shippingAddress = input.shippingAddress;
  if (input.note) orderInput.note = input.note;
  if (input.tags) orderInput.tags = input.tags;

  const options = {
    sendReceipt: input.sendReceipt ?? false,
  };

  const data = await shopifyGraphQL(query, { order: orderInput, options }, shopDomain, accessToken);
  
  if (data.orderCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.orderCreate.userErrors)}`);
  }
  
  return data.orderCreate?.order;
}

// ============================================================
// ORDER EDITING
// ============================================================

export async function beginOrderEdit(orderId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation orderEditBegin($id: ID!) {
      orderEditBegin(id: $id) {
        calculatedOrder {
          id
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                quantity
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: orderId }, shopDomain, accessToken);
  
  if (data.orderEditBegin?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.orderEditBegin.userErrors)}`);
  }
  
  return data.orderEditBegin?.calculatedOrder;
}

export async function addLineItemToOrderEdit(
  calculatedOrderId: string,
  variantId: string,
  quantity: number,
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
      orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
        calculatedOrder {
          id
          addedLineItems(first: 10) {
            edges {
              node {
                id
                title
                quantity
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: calculatedOrderId, variantId, quantity }, shopDomain, accessToken);
  
  if (data.orderEditAddVariant?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.orderEditAddVariant.userErrors)}`);
  }
  
  return data.orderEditAddVariant?.calculatedOrder;
}

export async function commitOrderEdit(
  calculatedOrderId: string,
  notifyCustomer: boolean = true,
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation orderEditCommit($id: ID!, $notifyCustomer: Boolean) {
      orderEditCommit(id: $id, notifyCustomer: $notifyCustomer) {
        order {
          id
          name
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: calculatedOrderId, notifyCustomer }, shopDomain, accessToken);
  
  if (data.orderEditCommit?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.orderEditCommit.userErrors)}`);
  }
  
  return data.orderEditCommit?.order;
}

// ============================================================
// GIFT CARDS
// ============================================================

export async function getGiftCards(first = 20, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetGiftCards($first: Int!) {
      giftCards(first: $first) {
        edges {
          node {
            id
            balance {
              amount
              currencyCode
            }
            initialValue {
              amount
            }
            lastCharacters
            expiresOn
            enabled
            createdAt
            customer {
              id
              email
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

export async function createGiftCard(
  input: { initialValue: string; note?: string; expiresOn?: string; customerId?: string },
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation giftCardCreate($input: GiftCardCreateInput!) {
      giftCardCreate(input: $input) {
        giftCard {
          id
          balance {
            amount
          }
          lastCharacters
          maskedCode
          expiresOn
        }
        giftCardCode
        userErrors {
          field
          message
        }
      }
    }
  `;

  const giftCardInput: any = {
    initialValue: input.initialValue,
  };
  if (input.note) giftCardInput.note = input.note;
  if (input.expiresOn) giftCardInput.expiresOn = input.expiresOn;
  if (input.customerId) giftCardInput.customerId = input.customerId;

  const data = await shopifyGraphQL(query, { input: giftCardInput }, shopDomain, accessToken);
  
  if (data.giftCardCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.giftCardCreate.userErrors)}`);
  }
  
  // Return both the gift card and the one-time visible code
  return {
    giftCard: data.giftCardCreate?.giftCard,
    giftCardCode: data.giftCardCreate?.giftCardCode, // Only visible once!
  };
}

export async function disableGiftCard(giftCardId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation giftCardDisable($id: ID!) {
      giftCardDisable(id: $id) {
        giftCard {
          id
          enabled
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: giftCardId }, shopDomain, accessToken);
  
  if (data.giftCardDisable?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.giftCardDisable.userErrors)}`);
  }
  
  return data.giftCardDisable?.giftCard;
}

// ============================================================
// WEBHOOKS
// ============================================================

export async function getWebhooks(first = 50, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetWebhooks($first: Int!) {
      webhookSubscriptions(first: $first) {
        edges {
          node {
            id
            topic
            endpoint {
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
            format
            createdAt
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

export async function createWebhook(
  topic: string,
  callbackUrl: string,
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
          topic
          endpoint {
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { 
    topic, 
    webhookSubscription: { 
      callbackUrl,
      format: "JSON"
    } 
  }, shopDomain, accessToken);
  
  if (data.webhookSubscriptionCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.webhookSubscriptionCreate.userErrors)}`);
  }
  
  return data.webhookSubscriptionCreate?.webhookSubscription;
}

export async function deleteWebhook(webhookId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation webhookSubscriptionDelete($id: ID!) {
      webhookSubscriptionDelete(id: $id) {
        deletedWebhookSubscriptionId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: webhookId }, shopDomain, accessToken);
  
  if (data.webhookSubscriptionDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.webhookSubscriptionDelete.userErrors)}`);
  }
  
  return { deletedId: data.webhookSubscriptionDelete?.deletedWebhookSubscriptionId };
}

// ============================================================
// FILES / MEDIA
// ============================================================

export async function getFiles(first = 20, query?: string, shopDomain?: string, accessToken?: string) {
  const gql = `
    query GetFiles($first: Int!, $query: String) {
      files(first: $first, query: $query) {
        edges {
          node {
            ... on MediaImage {
              id
              alt
              createdAt
              image {
                url
                width
                height
              }
            }
            ... on GenericFile {
              id
              url
              createdAt
            }
            ... on Video {
              id
              alt
              createdAt
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(gql, { first, query: query || null }, shopDomain, accessToken);
}

export async function createFileFromUrl(
  url: string,
  alt?: string,
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage {
            id
            alt
            image {
              url
            }
          }
          ... on GenericFile {
            id
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { 
    files: [{ 
      originalSource: url,
      alt: alt || "",
      contentType: "IMAGE"
    }] 
  }, shopDomain, accessToken);
  
  if (data.fileCreate?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.fileCreate.userErrors)}`);
  }
  
  return data.fileCreate?.files;
}

export async function deleteFile(fileId: string, shopDomain?: string, accessToken?: string) {
  const query = `
    mutation fileDelete($fileIds: [ID!]!) {
      fileDelete(fileIds: $fileIds) {
        deletedFileIds
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { fileIds: [fileId] }, shopDomain, accessToken);
  
  if (data.fileDelete?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.fileDelete.userErrors)}`);
  }
  
  return { deletedIds: data.fileDelete?.deletedFileIds };
}

// ============================================================
// PRODUCT SEARCH (With filters)
// ============================================================

export async function searchProducts(
  searchQuery: string,
  first = 20,
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    query SearchProducts($query: String!, $first: Int!) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            status
            totalInventory
            vendor
            productType
            createdAt
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
              }
            }
            featuredImage {
              url
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { query: searchQuery, first }, shopDomain, accessToken);
}

// ============================================================
// CUSTOMER SEARCH
// ============================================================

export async function searchCustomers(
  searchQuery: string,
  first = 20,
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    query SearchCustomers($query: String!, $first: Int!) {
      customers(first: $first, query: $query) {
        edges {
          node {
            id
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            tags
            createdAt
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { query: searchQuery, first }, shopDomain, accessToken);
}

// ============================================================
// PRICE RULES (Automatic Discounts)
// ============================================================

export async function getPriceRules(first = 20, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetPriceRules($first: Int!) {
      priceRules(first: $first) {
        edges {
          node {
            id
            title
            status
            startsAt
            endsAt
            target
            valueV2 {
              ... on MoneyV2 {
                amount
                currencyCode
              }
              ... on PricingPercentageValue {
                percentage
              }
            }
            usageLimit
            oncePerCustomer
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, { first }, shopDomain, accessToken);
}

// ============================================================
// BULK INVENTORY ADJUSTMENT
// ============================================================

export async function bulkAdjustInventory(
  adjustments: { inventoryItemId: string; locationId: string; delta: number }[],
  reason: string = "other",
  shopDomain?: string,
  accessToken?: string
) {
  const query = `
    mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        inventoryAdjustmentGroup {
          reason
          changes {
            name
            delta
          }
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
      reason,
      name: "available",
      changes: adjustments.map(adj => ({
        inventoryItemId: adj.inventoryItemId,
        locationId: adj.locationId,
        delta: adj.delta
      }))
    }
  };

  const data = await shopifyGraphQL(query, variables, shopDomain, accessToken);
  
  if (data.inventoryAdjustQuantities?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.inventoryAdjustQuantities.userErrors)}`);
  }
  
  return data.inventoryAdjustQuantities?.inventoryAdjustmentGroup;
}

// ============================================================
// PRODUCT TAGS (Bulk)
// ============================================================

export async function addProductTags(productId: string, tags: string[], shopDomain?: string, accessToken?: string) {
  const query = `
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          ... on Product {
            id
            tags
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: productId, tags }, shopDomain, accessToken);
  
  if (data.tagsAdd?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.tagsAdd.userErrors)}`);
  }
  
  return data.tagsAdd?.node;
}

export async function removeProductTags(productId: string, tags: string[], shopDomain?: string, accessToken?: string) {
  const query = `
    mutation tagsRemove($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        node {
          ... on Product {
            id
            tags
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { id: productId, tags }, shopDomain, accessToken);
  
  if (data.tagsRemove?.userErrors?.length > 0) {
    throw new Error(`Shopify User Errors: ${JSON.stringify(data.tagsRemove.userErrors)}`);
  }
  
  return data.tagsRemove?.node;
}

// ============================================================
// MARKET / INTERNATIONAL
// ============================================================

export async function getMarkets(shopDomain?: string, accessToken?: string) {
  const query = `
    query GetMarkets {
      markets(first: 50) {
        edges {
          node {
            id
            name
            enabled
            primary
            regions(first: 50) {
              edges {
                node {
                  ... on MarketRegionCountry {
                    code
                    name
                  }
                }
              }
            }
            currencySettings {
              baseCurrency {
                currencyCode
              }
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, {}, shopDomain, accessToken);
}

// ============================================================
// SHIPPING ZONES AND RATES
// ============================================================

export async function getDeliveryProfiles(shopDomain?: string, accessToken?: string) {
  const query = `
    query GetDeliveryProfiles {
      deliveryProfiles(first: 20) {
        edges {
          node {
            id
            name
            default
            profileLocationGroups {
              locationGroup {
                id
              }
              locationGroupZones(first: 20) {
                edges {
                  node {
                    zone {
                      id
                      name
                      countries {
                        code {
                          countryCode
                        }
                        name
                      }
                    }
                    methodDefinitions(first: 20) {
                      edges {
                        node {
                          id
                          name
                          active
                          rateProvider {
                            ... on DeliveryRateDefinition {
                              id
                              price {
                                amount
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  return shopifyGraphQL(query, {}, shopDomain, accessToken);
}

// ============================================================
// ABANDONED CHECKOUTS
// ============================================================

export async function getAbandonedCheckouts(first = 20, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetAbandonedCheckouts($first: Int!) {
      abandonedCheckouts(first: $first) {
        edges {
          node {
            id
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              email
              firstName
              lastName
            }
            lineItems(first: 10) {
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

// ============================================================
// STORE CREDIT
// ============================================================

export async function getStoreCreditAccounts(first = 20, shopDomain?: string, accessToken?: string) {
  const query = `
    query GetStoreCreditAccounts($first: Int!) {
      customers(first: $first, query: "store_credit_accounts_count:>0") {
        edges {
          node {
            id
            email
            firstName
            lastName
            storeCreditAccounts(first: 5) {
              edges {
                node {
                  id
                  balance {
                    amount
                    currencyCode
                  }
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
