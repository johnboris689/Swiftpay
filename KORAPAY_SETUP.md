# Korapay Virtual Account & Webhook Integration Setup

This document provides the complete instructions for configuring Korapay Virtual Accounts (DVAs), Bank Verification, and Automatic Webhook Settlement for SwiftPay.

---

## Step 1: Korapay Account Setup

1. Log in to your [Korapay Dashboard](https://dashboard.korapay.com/).
2. Navigate to **Settings -> API Keys & Webhooks**.
3. Retrieve your **Secret Key**, **Public Key**, and **Encryption / Webhook Secret Key**.

---

## Step 2: Set Webhook Endpoint in Korapay

1. Navigate to **Korapay Dashboard -> Settings -> API Keys & Webhooks**.
2. Set your **Webhook URL** to your backend server endpoint:
   `https://your-app-name.onrender.com/api/korapay/webhook`
3. Save changes.

---

## Step 3: Configure Environment Variables

Add the following environment variables to your deployment environment (or `.env` file):

```env
KORAPAY_SECRET_KEY=sk_live_xxxx...
KORAPAY_PUBLIC_KEY=pk_live_xxxx...
KORAPAY_WEBHOOK_SECRET=xxxx...
```

---

## Step 4: How It Works

1. **Live Korapay Flow**: When a user clicks **Buy WDV Voucher**, the system generates a Korapay Virtual Account with a 15-minute countdown timer.
2. **Webhook Verification**: When funds are transferred to the virtual account, Korapay posts a webhook payload to `/api/korapay/webhook`. The system verifies the HMAC SHA256 signature (`x-korapay-signature`), updates payment status to `successful`, and issues the WDV Voucher code instantly.
3. **Automatic Bank Resolution**: Transfer account numbers entered in SwiftPay are verified against Korapay's bank resolution API endpoint (`/api/bank/resolve`).
