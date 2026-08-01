# SwiftPay Enterprise Update Changelog — Paystack Dedicated Virtual Account & Automatic WDV Voucher Delivery

## Summary of Changes

### 1. Backend & Server (`server.ts`)
- **Paystack Dedicated Virtual Account (DVA) Integration**:
  - Implemented `POST /api/paystack/virtual-account` to automatically generate or retrieve a 10-digit dedicated virtual account for fixed ₦6,500 WDV voucher payments.
  - Implemented `GET /api/paystack/payment-status/:reference` to poll payment verification status.
  - Implemented `POST /api/paystack/webhook` with HMAC SHA512 signature verification (`x-paystack-signature`) for instant automated payment processing upon Paystack webhook events.
  - Implemented `GET /api/bank/resolve` for account name lookup across Nigerian banks.
  - Implemented `POST /api/paystack/simulate-payment` for instant test payment verification and automated voucher delivery.
- **Bank Account Resolution**:
  - Updated `verifyBankAccountService` in `server.ts` to automatically attempt Paystack resolution when `PAYSTACK_SECRET_KEY` is present.
- **ZIP Download Endpoints**:
  - Added public download routes for `/swiftpay-paystack-auto-wdv-update.zip` and `/download/swiftpay-paystack-auto-wdv-update.zip`.

### 2. Database Schema (`db.ts`)
- Added/verified `wdv_payments` table schema with PostgreSQL dual-engine support and JSON file fallback (`swiftpay_db.json`).
- Added helper functions for creating, updating, and querying WDV payment records.

### 3. Frontend Application (`src/App.tsx`)
- **Paystack DVA Payment Flow**:
  - Updated "Buy WDV Voucher" screen to invoke Paystack DVA creation endpoint with fixed price ₦6,500.
  - Displayed real-time Bank Name, Dedicated Account Number, Account Name, and 15-minute countdown window timer.
  - Added live background polling ticker checking Paystack payment status every 3 seconds.
  - Added "Simulate / Check Payment Received" action button for instant testing.
- **Automatic Voucher Issuance & PDF Receipt Download**:
  - Automatically generates and registers WDV Voucher code when Paystack payment status transitions to `successful` or `settled`.
  - Added **Copy Voucher Code** button on confirmation.
  - Added **Download PDF Receipt** button utilizing `jsPDF` to generate official A4 PDF payment certificates.

### 4. Environment Configuration (`.env.example`)
- Added `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, and `PAYSTACK_WEBHOOK_SECRET`.
