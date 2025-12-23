/**
 * Billing Page Template
 * Clear plan comparison for non-technical users
 */

export interface BillingParams {
  host: string;
  shop: string | null;
  currentPlan: 'free' | 'pro';
  usageCount: number;
  usageLimit: number;
  resetDate?: string;
}

export function renderBillingPage(params: BillingParams): string {
  const { 
    host, 
    shop, 
    currentPlan,
    usageCount,
    usageLimit,
    resetDate
  } = params;
  
  const isProPlan = currentPlan === 'pro';
  const usagePercent = usageLimit > 0 ? Math.min(100, (usageCount / usageLimit) * 100) : 0;
  
  // Format date nicely
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Next month';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Choose Your Plan</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #f6f6f7;
            color: #202223;
            line-height: 1.6;
            min-height: 100vh;
        }
        
        .header {
            background: linear-gradient(135deg, #008060 0%, #004c3f 100%);
            color: white;
            padding: 32px 20px;
            text-align: center;
        }
        .header h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .header p { opacity: 0.9; font-size: 15px; }
        
        .container { max-width: 800px; margin: 0 auto; padding: 24px 16px 60px; }
        
        /* Current Usage */
        .usage-card {
            background: white;
            border: 1px solid #e1e3e5;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
        }
        .usage-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .usage-label { font-size: 14px; color: #6d7175; }
        .usage-value { font-size: 28px; font-weight: 600; }
        .progress-bar { background: #e1e3e5; height: 10px; border-radius: 5px; overflow: hidden; margin: 12px 0; }
        .progress-fill { height: 100%; border-radius: 5px; transition: width 0.3s; }
        .progress-fill.green { background: #008060; }
        .progress-fill.yellow { background: #ffc107; }
        .progress-fill.red { background: #d82c0d; }
        .usage-note { font-size: 13px; color: #6d7175; }
        
        /* Plan Cards */
        .plans-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        @media (max-width: 600px) { .plans-grid { grid-template-columns: 1fr; } }
        
        .plan-card {
            background: white;
            border: 2px solid #e1e3e5;
            border-radius: 16px;
            padding: 28px;
            text-align: center;
            position: relative;
        }
        .plan-card.current { border-color: #008060; }
        .plan-card.featured { border-color: #5c4aff; }
        
        .current-badge, .featured-badge {
            position: absolute;
            top: -12px;
            left: 50%;
            transform: translateX(-50%);
            padding: 4px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .current-badge { background: #008060; color: white; }
        .featured-badge { background: #5c4aff; color: white; }
        
        .plan-name { font-size: 22px; font-weight: 600; margin: 12px 0 8px; }
        .plan-price { font-size: 36px; font-weight: 700; margin-bottom: 4px; }
        .plan-price span { font-size: 16px; font-weight: 400; color: #6d7175; }
        .plan-original { font-size: 14px; color: #6d7175; text-decoration: line-through; margin-bottom: 8px; }
        .plan-discount { background: #f1f8f5; color: #008060; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 500; display: inline-block; margin-bottom: 16px; }
        
        .plan-features { list-style: none; text-align: left; margin: 20px 0; }
        .plan-features li { 
            padding: 8px 0; 
            display: flex; 
            align-items: center; 
            gap: 10px;
            font-size: 14px;
        }
        .plan-features .check { color: #008060; font-size: 18px; }
        .plan-features .cross { color: #ccc; }
        
        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 14px 24px;
            font-size: 15px;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            border: none;
            text-decoration: none;
            transition: all 0.15s;
        }
        .btn-primary { background: #008060; color: white; }
        .btn-primary:hover { background: #006e52; }
        .btn-purple { background: #5c4aff; color: white; }
        .btn-purple:hover { background: #4838cc; }
        .btn-outline { background: white; color: #202223; border: 2px solid #e1e3e5; }
        .btn-outline:hover { background: #f9fafb; }
        .btn-disabled { background: #e1e3e5; color: #6d7175; cursor: default; }
        
        /* FAQ */
        .faq { margin-top: 32px; }
        .faq h2 { font-size: 18px; margin-bottom: 16px; }
        .faq-item { background: white; border: 1px solid #e1e3e5; border-radius: 8px; margin-bottom: 8px; }
        .faq-q { padding: 16px; font-weight: 500; cursor: pointer; display: flex; justify-content: space-between; }
        .faq-a { padding: 0 16px 16px; color: #6d7175; display: none; }
        .faq-item.open .faq-a { display: block; }
        .faq-item.open .faq-arrow { transform: rotate(180deg); }
        
        /* Back link */
        .back-link { display: inline-flex; align-items: center; gap: 8px; color: #6d7175; text-decoration: none; margin-bottom: 24px; font-size: 14px; }
        .back-link:hover { color: #008060; }
    </style>
</head>
<body>
    <div class="header">
        <h1>💎 Choose Your Plan</h1>
        <p>Simple pricing. Cancel anytime.</p>
    </div>
    
    <div class="container">
        <a href="/?shop=${shop}" class="back-link">← Back to Dashboard</a>
        
        <!-- Current Usage -->
        <div class="usage-card">
            <div class="usage-header">
                <div>
                    <div class="usage-label">This Month's Usage</div>
                    <div class="usage-value">${usageCount} ${!isProPlan ? `/ ${usageLimit}` : ''} actions</div>
                </div>
                <div style="text-align: right;">
                    <div class="usage-label">Resets</div>
                    <div style="font-weight: 500;">${formatDate(resetDate)}</div>
                </div>
            </div>
            ${!isProPlan ? `
            <div class="progress-bar">
                <div class="progress-fill ${usagePercent > 90 ? 'red' : usagePercent > 70 ? 'yellow' : 'green'}" style="width: ${usagePercent}%"></div>
            </div>
            <div class="usage-note">${usageLimit - usageCount} actions remaining</div>
            ` : `
            <div class="usage-note" style="color: #008060; margin-top: 8px;">✨ Unlimited actions with Pro plan</div>
            `}
        </div>
        
        <!-- Plan Cards -->
        <div class="plans-grid">
            <!-- Free Plan -->
            <div class="plan-card ${!isProPlan ? 'current' : ''}">
                ${!isProPlan ? '<div class="current-badge">Current Plan</div>' : ''}
                <div class="plan-name">Free</div>
                <div class="plan-price">$0<span>/month</span></div>
                <div style="height: 28px;"></div>
                
                <ul class="plan-features">
                    <li><span class="check">✓</span> 200 actions per month</li>
                    <li><span class="check">✓</span> All AI tools supported</li>
                    <li><span class="check">✓</span> Product management</li>
                    <li><span class="check">✓</span> Order tracking</li>
                    <li><span class="cross">✗</span> Unlimited actions</li>
                    <li><span class="cross">✗</span> Priority support</li>
                </ul>
                
                ${!isProPlan 
                    ? '<div class="btn btn-disabled">Current Plan</div>' 
                    : '<a href="/?shop=' + shop + '" class="btn btn-outline">Downgrade</a>'
                }
            </div>
            
            <!-- Pro Plan -->
            <div class="plan-card ${isProPlan ? 'current' : 'featured'}">
                ${isProPlan ? '<div class="current-badge">Current Plan</div>' : '<div class="featured-badge">⭐ Best Value</div>'}
                <div class="plan-name">Pro</div>
                <div class="plan-price">$6.99<span>/month</span></div>
                <div class="plan-original">$9.99/month</div>
                <div class="plan-discount">🎉 30% Launch Discount</div>
                
                <ul class="plan-features">
                    <li><span class="check">✓</span> <strong>Unlimited</strong> actions</li>
                    <li><span class="check">✓</span> All AI tools supported</li>
                    <li><span class="check">✓</span> Product management</li>
                    <li><span class="check">✓</span> Order tracking</li>
                    <li><span class="check">✓</span> Priority support</li>
                    <li><span class="check">✓</span> Early access to new features</li>
                </ul>
                
                ${isProPlan 
                    ? '<div class="btn btn-disabled">Current Plan</div>' 
                    : '<a href="/billing/subscribe?shop=' + shop + '" class="btn btn-purple">Upgrade to Pro →</a>'
                }
            </div>
        </div>
        
        <!-- FAQ -->
        <div class="faq">
            <h2>Common Questions</h2>
            
            <div class="faq-item">
                <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
                    What counts as an "action"?
                    <span class="faq-arrow">▼</span>
                </div>
                <div class="faq-a">
                    Each time your AI tool does something with your store (like searching products, creating an order, or updating inventory), that's one action.
                </div>
            </div>
            
            <div class="faq-item">
                <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
                    Can I cancel anytime?
                    <span class="faq-arrow">▼</span>
                </div>
                <div class="faq-a">
                    Yes! You can cancel your Pro subscription anytime from your Shopify admin. No questions asked.
                </div>
            </div>
            
            <div class="faq-item">
                <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
                    How long does the 30% discount last?
                    <span class="faq-arrow">▼</span>
                </div>
                <div class="faq-a">
                    The launch discount applies to your first 3 months. After that, the regular $9.99/month price applies.
                </div>
            </div>
        </div>
    </div>
</body>
</html>
  `;
}
