/**
 * Legal Pages Template
 * Renders Privacy Policy and Terms of Service pages
 */

export interface LegalPageParams {
  appName: string;
  companyName: string;
  contactEmail: string;
  effectiveDate: string;
}

const DEFAULT_PARAMS: LegalPageParams = {
  appName: 'Shopify MCP Server',
  companyName: 'Batin Studio',
  contactEmail: 'support@batinstudio.com',
  effectiveDate: 'December 22, 2024',
};

export function renderPrivacyPolicy(params: Partial<LegalPageParams> = {}): string {
  const p = { ...DEFAULT_PARAMS, ...params };
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy - ${p.appName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #202223; line-height: 1.7; }
        h1 { color: #008060; border-bottom: 2px solid #008060; padding-bottom: 16px; }
        h2 { color: #202223; margin-top: 32px; }
        .date { color: #6d7175; font-size: 14px; }
        a { color: #008060; }
    </style>
</head>
<body>
    <h1>Privacy Policy</h1>
    <p class="date">Effective Date: ${p.effectiveDate}</p>
    
    <p>${p.companyName} ("we", "us", or "our") operates ${p.appName} ("the App"). This Privacy Policy explains how we collect, use, and protect your information when you use our App.</p>
    
    <h2>1. Information We Collect</h2>
    <p>When you install and use our App, we collect:</p>
    <ul>
        <li><strong>Store Information:</strong> Your Shopify store domain, access tokens for API access</li>
        <li><strong>Usage Data:</strong> Number of API calls made through the App</li>
    </ul>
    <p>We do NOT collect or store:</p>
    <ul>
        <li>Customer personal information</li>
        <li>Payment card details</li>
        <li>Customer order details beyond what's accessed via API</li>
    </ul>
    
    <h2>2. How We Use Your Information</h2>
    <p>We use the information we collect to:</p>
    <ul>
        <li>Provide and maintain the App functionality</li>
        <li>Track usage for billing purposes</li>
        <li>Improve our services</li>
    </ul>
    
    <h2>3. Data Sharing</h2>
    <p>We do not sell, trade, or share your information with third parties except:</p>
    <ul>
        <li>When required by law</li>
        <li>To protect our rights or safety</li>
    </ul>
    
    <h2>4. Data Security</h2>
    <p>We implement industry-standard security measures to protect your data, including HTTPS encryption and secure token storage.</p>
    
    <h2>5. Data Retention</h2>
    <p>We retain your data for as long as you use our App. When you uninstall the App, we delete all associated data within 48 hours as required by Shopify's GDPR compliance.</p>
    
    <h2>6. Your Rights</h2>
    <p>You have the right to:</p>
    <ul>
        <li>Access your data</li>
        <li>Request deletion of your data</li>
        <li>Uninstall the App at any time</li>
    </ul>
    
    <h2>7. GDPR Compliance</h2>
    <p>We comply with GDPR and handle all data subject requests through Shopify's webhook system.</p>
    
    <h2>8. Contact Us</h2>
    <p>For privacy-related questions, contact us at: <a href="mailto:${p.contactEmail}">${p.contactEmail}</a></p>
    
    <h2>9. Changes to This Policy</h2>
    <p>We may update this policy from time to time. Changes will be posted on this page.</p>
</body>
</html>
  `;
}

export function renderTermsOfService(params: Partial<LegalPageParams> = {}): string {
  const p = { ...DEFAULT_PARAMS, ...params };
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terms of Service - ${p.appName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #202223; line-height: 1.7; }
        h1 { color: #008060; border-bottom: 2px solid #008060; padding-bottom: 16px; }
        h2 { color: #202223; margin-top: 32px; }
        .date { color: #6d7175; font-size: 14px; }
        a { color: #008060; }
    </style>
</head>
<body>
    <h1>Terms of Service</h1>
    <p class="date">Effective Date: ${p.effectiveDate}</p>
    
    <p>By installing and using ${p.appName} ("the App"), you agree to these Terms of Service.</p>
    
    <h2>1. Description of Service</h2>
    <p>${p.appName} provides an MCP (Model Context Protocol) server that allows AI agents and automation tools to interact with your Shopify store.</p>
    
    <h2>2. Eligibility</h2>
    <p>You must have a valid Shopify store and be authorized to install apps on that store.</p>
    
    <h2>3. Account & API Keys</h2>
    <ul>
        <li>You are responsible for keeping your API keys secure</li>
        <li>Do not share your API keys with unauthorized parties</li>
        <li>Notify us immediately if you suspect unauthorized access</li>
    </ul>
    
    <h2>4. Acceptable Use</h2>
    <p>You agree NOT to:</p>
    <ul>
        <li>Use the App for illegal purposes</li>
        <li>Attempt to bypass usage limits</li>
        <li>Reverse engineer or exploit the App</li>
        <li>Use the App to harm Shopify or other merchants</li>
    </ul>
    
    <h2>5. Pricing & Billing</h2>
    <ul>
        <li>Free Plan: 200 API calls per month</li>
        <li>Pro Plan: $9.99/month for unlimited API calls</li>
        <li>Charges are processed through Shopify Billing</li>
        <li>You may cancel at any time</li>
    </ul>
    
    <h2>6. Service Availability</h2>
    <p>We strive for 99.9% uptime but do not guarantee uninterrupted service. We are not liable for downtime or service interruptions.</p>
    
    <h2>7. Limitation of Liability</h2>
    <p>THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES. WE ARE NOT LIABLE FOR ANY DAMAGES ARISING FROM YOUR USE OF THE APP.</p>
    
    <h2>8. Termination</h2>
    <p>We may terminate your access if you violate these terms. You may uninstall the App at any time.</p>
    
    <h2>9. Changes to Terms</h2>
    <p>We may update these terms. Continued use after changes constitutes acceptance.</p>
    
    <h2>10. Contact</h2>
    <p>Questions? Contact us at: <a href="mailto:${p.contactEmail}">${p.contactEmail}</a></p>
</body>
</html>
  `;
}
