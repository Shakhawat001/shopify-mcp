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
