# SwiftPay Recent Updates & Modifications

**Date:** July 31, 2026

## Summary of Changes

### 1. WDV Voucher Generator & State Fixes
- **File:** `src/components/AdminPanel.tsx`
- **Fixes:**
  - Added `safeDateStr()` helper function to safely format dates and prevent `TypeError` or `NaN` crashes when timestamp/date fields are missing, empty string, or invalid.
  - Added explicit event handling (`type="button"`, `e.preventDefault()`, `e.stopPropagation()`) to the "Generate New WDV Voucher" button to prevent unexpected form submissions or page state refreshes.
  - Updated `handleGenerateVoucher` to optimistically append newly generated voucher records directly to React component state (`setVouchers`), keeping the UI responsive without blank transitions.
  - Added array defensive checks (`Array.isArray()`) across all `.map()` and `.filter()` operations on `vouchers` to guard against null or undefined responses from the API.

### 2. Global Error Boundary & Crash Protection
- **Files:** `src/components/ErrorBoundary.tsx` (New), `src/App.tsx`
- **Fixes:**
  - Created a dedicated `ErrorBoundary` component (`src/components/ErrorBoundary.tsx`) featuring a clean glassmorphism error fallback card with "Retry Section" and "Reload App" controls.
  - Wrapped `AdminPanel` render locations in `src/App.tsx` with `<ErrorBoundary fallbackTitle="Admin Panel Error">` so unexpected runtime exceptions in sub-modules are captured safely without causing a blank screen transition.

### 3. Admin Authentication & Session Management
- **Files:** `server.ts`, `swiftpay_db.json`
- **Fixes:**
  - Updated `verifyAdminToken` in `server.ts` to validate tokens for both `talkdavidjohn@gmail.com` and `admin@swiftpay.com`.
  - Added automatic admin provisioning in `/api/admin/login` for `admin@swiftpay.com` and `talkdavidjohn@gmail.com` with bcrypt password hash support.
  - Updated `swiftpay_db.json` to include valid default admin user credentials and bcrypt password hashes.
