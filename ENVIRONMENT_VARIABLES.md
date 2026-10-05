# SwiftPay Environment Variables Guide

This document defines the environment variables required to run SwiftPay in local development and production on Render.

---

## 1. Core Application & Security
| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Optional | Server port (defaults to `3000`) |
| `NODE_ENV` | Optional | `development` or `production` |
| `JWT_SECRET` | Recommended | Secret key used to sign user and admin JWT tokens |

---

## 2. Database Configuration (Render PostgreSQL / Cloud SQL)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Optional | Full PostgreSQL connection string (`postgresql://user:pass@host:5432/dbname`). If omitted or unreachable, SwiftPay automatically uses its local JSON database (`swiftpay_db.json`). |
| `PGSSLMODE` | Optional | Set to `disable` if connecting to a PostgreSQL server without SSL |

---

## 3. Korapay Payment Gateway (Primary & Only WDV Voucher / Wallet Gateway)
| Variable | Required | Description |
|----------|----------|-------------|
| `KORAPAY_SECRET_KEY` | **Required for Live Payments** | Your Korapay Secret Key (`sk_live_...` or `sk_test_...`) |
| `KORAPAY_PUBLIC_KEY` | Recommended | Your Korapay Public Key (`pk_live_...` or `pk_test_...`) |
| `KORAPAY_ENCRYPTION_KEY` | Optional | Your Korapay Encryption Key |
| `KORAPAY_WEBHOOK_SECRET` | Optional | Webhook verification secret (defaults to `KORAPAY_SECRET_KEY` if omitted) |

---

## 4. Email & Optional Integrations
| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Optional | Resend API key for transactional emails |
| `EMAIL_FROM` | Optional | Sender address for transactional emails |
| `GEMINI_API_KEY` | Optional | Google Gemini API key for AI Support |
