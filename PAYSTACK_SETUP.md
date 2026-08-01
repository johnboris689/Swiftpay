# Paystack Dedicated Virtual Account & Webhook Integration Setup

## Overview
This update replaces manual bank transfer workflows with Paystack Dedicated Virtual Accounts (DVAs) for WDV Voucher purchases (fixed price: ₦6,500).

---

## Step 1: Paystack Account Setup
1. Log in to your [Paystack Dashboard](https://dashboard.paystack.com/).
2. Ensure your account is activated for **Dedicated Virtual Accounts (DVA)** under **Settings -> Customer Accounts / Virtual Accounts**.

---

## Step 2: Set Webhook Endpoint in Paystack
1. Navigate to **Paystack Dashboard -> Settings -> API Keys & Webhooks**.
2. Under **Webhook URL**, enter your deployed server URL:
   `https://your-app-name.onrender.com/api/paystack/webhook`
3. Copy the **Secret Key** and **Webhook Secret**.

---

## Step 3: Add Environment Variables in Hosting Dashboard (e.g., Render)
Add the following key-value pairs in your deployment settings:
```env
PAYSTACK_SECRET_KEY=sk_live_xxxx...
PAYSTACK_PUBLIC_KEY=pk_live_xxxx...
PAYSTACK_WEBHOOK_SECRET=xxxx...
```

---

## Step 4: Testing & Verification
1. **Live Paystack Flow**: When a user clicks **Buy WDV Voucher**, the system generates a Dedicated Virtual Account with a 15-minute countdown.
2. **Webhook Verification**: When funds are transferred to the virtual account, Paystack posts a webhook payload to `/api/paystack/webhook`. The system verifies the HMAC signature, updates status to `successful`, and issues the WDV Voucher code automatically.
3. **Test Simulation**: Use the **"Simulate / Check Payment Received"** button in the app to instantly test automated voucher generation without transferring real money.
