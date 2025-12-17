import dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
import "dotenv/config";

const API_VERSION = "2024-01"; // Or 2026-01 as planned

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
    }
  `;
  return shopifyGraphQL(query, { first });
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
