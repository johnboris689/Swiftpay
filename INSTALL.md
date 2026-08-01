# SwiftPay Enterprise Update — Installation Guide

## Package Name
`swiftpay-paystack-auto-wdv-update.zip`

---

## How to Install this Update

1. **Extract the ZIP Archive**
   Unzip `swiftpay-paystack-auto-wdv-update.zip` on your computer.

2. **Overwrite Project Files**
   Copy all extracted files directly into the root directory of your existing SwiftPay project repository, overwriting existing files:
   - `server.ts`
   - `db.ts`
   - `.env.example`
   - `src/App.tsx`
   - `CHANGELOG.md`
   - `INSTALL.md`
   - `ENVIRONMENT_VARIABLES.md`
   - `PAYSTACK_SETUP.md`

3. **Configure Environment Variables**
   Set the following variables in your hosting environment (e.g., Render, Railway, Heroku, or `.env` file):
   - `PAYSTACK_SECRET_KEY`: Your Paystack Secret Key (e.g. `sk_live_...` or `sk_test_...`)
   - `PAYSTACK_PUBLIC_KEY`: Your Paystack Public Key (e.g. `pk_live_...` or `pk_test_...`)
   - `PAYSTACK_WEBHOOK_SECRET`: Your Paystack Webhook Secret Key

4. **Git Commit & Push**
   ```bash
   git add .
   git commit -m "Apply SwiftPay Paystack Dedicated Virtual Account & Auto WDV Voucher update"
   git push origin main
   ```

5. **Deploy on Render**
   - Trigger a new deployment on Render or your cloud provider.
   - Build Command: `npm run build`
   - Start Command: `npm run start`

6. **Configure Paystack Webhook URL**
   In your Paystack Dashboard -> Settings -> API Keys & Webhooks:
   - Set **Webhook URL** to: `https://your-domain.onrender.com/api/paystack/webhook`
