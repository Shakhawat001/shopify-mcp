import { getProducts } from "./shopify-client.js";

async function verify() {
  console.log("Verifying Shopify Connection...");
  try {
    const products = await getProducts(1);
    console.log("SUCCESS! Connected to Shopify.");
    console.log("Products found:", products.products.edges.length);
    if (products.products.edges.length > 0) {
      console.log("First product:", products.products.edges[0].node.title);
    }
  } catch (error: any) {
    console.error("FAILED to connect:", error.message);
    process.exit(1);
  }
}

verify();
