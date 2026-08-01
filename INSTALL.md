# SwiftPay Installation & Deployment Guide

Follow these steps to apply this update package to your existing SwiftPay project.

---

## Installation Steps

1. **Extract the ZIP Archive**:
   Extract all contents from `swiftpay-update.zip` on your computer.

2. **Open the Extracted Folder**:
   Locate all files and folders inside the extracted directory (`src/`, `server.ts`, `db.ts`, `CHANGELOG.md`, `INSTALL.md`, etc.).

3. **Copy All Files**:
   Select and copy every file and folder from the extracted package.

4. **Paste Into SwiftPay Root Directory**:
   Paste the copied files into the root folder of your existing SwiftPay project codebase.

5. **Overwrite Existing Files**:
   When prompted by your operating system or file manager, select **Replace / Overwrite** to replace existing files.

6. **Install Dependencies** (if needed):
   Open your terminal in the SwiftPay project directory and run:
   ```bash
   npm install
   ```

7. **Verify & Build Locally**:
   To test the build locally before deploying:
   ```bash
   npm run build
   ```

8. **Commit & Push to GitHub**:
   ```bash
   git add .
   git commit -m "Feat: Complete SwiftPay balance card, 2-step transfer/withdrawal, and 24h wallet engine update"
   git push origin main
   ```

9. **Redeploy on Render / Cloud Run**:
   - Trigger a manual deployment or allow automatic build from your `main` branch.
   - Verify that your application builds and starts cleanly.

---

## Included Modified Files in This Update Package
- `src/App.tsx`
- `src/components/BottomNav.tsx`
- `src/components/AdminPanel.tsx`
- `src/components/CyberWithdrawalTerminal.tsx`
- `src/components/ErrorBoundary.tsx`
- `server.ts`
- `db.ts`
- `CHANGELOG.md`
- `INSTALL.md`

---
*For support or questions regarding WDV configuration or database migrations, refer to the project documentation in `CHANGELOG.md`.*
