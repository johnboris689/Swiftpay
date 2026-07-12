import { Transaction, BankAccount, NotificationItem } from './types';

export const SUPPORTED_BANKS = [
  "9PSB",
  "Access Bank Limited",
  "Access Holdings Plc",
  "Aella App",
  "Airtel Money",
  "Alternative Bank Limited",
  "Carbon",
  "Chipper Cash",
  "Citibank Nigeria Limited",
  "Coronation Merchant Bank Limited",
  "Cowrywise",
  "Ecobank Nigeria Limited",
  "Eyowo",
  "FairMoney",
  "FBN Holdings Plc",
  "FBN Merchant Bank Limited",
  "FCMB Group Plc",
  "Fidelity Bank Plc",
  "First Bank of Nigeria Limited",
  "First City Monument Bank Limited (FCMB)",
  "Flutterwave Barter",
  "FSDH Holding Company Limited",
  "FSDH Merchant Bank Limited",
  "Globus Bank Limited",
  "Greenwich Merchant Bank Limited",
  "Guaranty Trust Bank Limited (GTBank)",
  "Guaranty Trust Holding Company Plc",
  "Heritage Bank Plc",
  "Hope PSB",
  "Jaiz Bank Plc",
  "Keystone Bank Limited",
  "Kuda Bank",
  "Lotus Bank Limited",
  "Moniepoint",
  "MoneyMaster PSB",
  "MTN MoMo PSB",
  "Nova Merchant Bank Limited",
  "OPay",
  "Optimus Bank Limited",
  "PalmPay",
  "Parallex Bank Limited",
  "PiggyVest",
  "Polaris Bank Limited",
  "Premium Trust Bank Limited",
  "Providus Bank Limited",
  "Rand Merchant Bank Limited",
  "Rubies",
  "Signature Bank Limited",
  "SmartCash PSB",
  "Spar",
  "Stanbic IBTC Bank Limited",
  "Stanbic IBTC Holdings Plc",
  "Standard Chartered Bank Limited",
  "Sterling Bank Limited",
  "Sterling Financial Holdings Limited",
  "SunTrust Bank Nigeria Limited",
  "Taj Bank Limited",
  "Titan Trust Bank Limited",
  "UBA (United Bank for Africa Plc)",
  "Union Bank of Nigeria Plc",
  "Unity Bank Plc",
  "V Bank",
  "Wema Bank Plc",
  "Zenith Bank Plc"
];

export const MOBILE_NETWORKS = [
  { id: 'mtn', name: 'MTN Nigeria', color: 'bg-yellow-400 text-black', logo: 'MTN' },
  { id: 'airtel', name: 'Airtel Nigeria', color: 'bg-red-600 text-white', logo: 'Airtel' },
  { id: 'glo', name: 'Glo Nigeria', color: 'bg-green-600 text-white', logo: 'Glo' },
  { id: '9mobile', name: '9Mobile', color: 'bg-emerald-950 text-white', logo: '9Mob' }
];

export const DATA_PLANS = [
  // MTN Plans
  { id: 'mtn-500', network: 'mtn', size: '500MB', validity: '30 Days', price: 150 },
  { id: 'mtn-1g', network: 'mtn', size: '1GB', validity: '30 Days', price: 250 },
  { id: 'mtn-2g', network: 'mtn', size: '2GB', validity: '30 Days', price: 480 },
  { id: 'mtn-3g', network: 'mtn', size: '3GB', validity: '30 Days', price: 700 },
  { id: 'mtn-5g', network: 'mtn', size: '5GB', validity: '30 Days', price: 1100 },
  { id: 'mtn-10g', network: 'mtn', size: '10GB', validity: '30 Days', price: 2100 },
  { id: 'mtn-20g', network: 'mtn', size: '20GB', validity: '30 Days', price: 4000 },
  { id: 'mtn-50g', network: 'mtn', size: '50GB', validity: '30 Days', price: 9500 },
  { id: 'mtn-100g', network: 'mtn', size: '100GB', validity: '30 Days', price: 18000 },

  // Airtel Plans
  { id: 'air-500', network: 'airtel', size: '500MB', validity: '30 Days', price: 150 },
  { id: 'air-1g', network: 'airtel', size: '1GB', validity: '30 Days', price: 250 },
  { id: 'air-2g', network: 'airtel', size: '2GB', validity: '30 Days', price: 480 },
  { id: 'air-3g', network: 'airtel', size: '3GB', validity: '30 Days', price: 700 },
  { id: 'air-5g', network: 'airtel', size: '5GB', validity: '30 Days', price: 1100 },
  { id: 'air-10g', network: 'airtel', size: '10GB', validity: '30 Days', price: 2100 },
  { id: 'air-20g', network: 'airtel', size: '20GB', validity: '30 Days', price: 4000 },
  { id: 'air-50g', network: 'airtel', size: '50GB', validity: '30 Days', price: 9500 },
  { id: 'air-100g', network: 'airtel', size: '100GB', validity: '30 Days', price: 18000 },

  // Glo Plans
  { id: 'glo-500', network: 'glo', size: '500MB', validity: '30 Days', price: 150 },
  { id: 'glo-1g', network: 'glo', size: '1GB', validity: '30 Days', price: 250 },
  { id: 'glo-2g', network: 'glo', size: '2GB', validity: '30 Days', price: 480 },
  { id: 'glo-3g', network: 'glo', size: '3GB', validity: '30 Days', price: 700 },
  { id: 'glo-5g', network: 'glo', size: '5GB', validity: '30 Days', price: 1100 },
  { id: 'glo-10g', network: 'glo', size: '10GB', validity: '30 Days', price: 2100 },
  { id: 'glo-20g', network: 'glo', size: '20GB', validity: '30 Days', price: 4000 },
  { id: 'glo-50g', network: 'glo', size: '50GB', validity: '30 Days', price: 9500 },
  { id: 'glo-100g', network: 'glo', size: '100GB', validity: '30 Days', price: 18000 },

  // 9Mobile Plans
  { id: '9mo-500', network: '9mobile', size: '500MB', validity: '30 Days', price: 150 },
  { id: '9mo-1g', network: '9mobile', size: '1GB', validity: '30 Days', price: 250 },
  { id: '9mo-2g', network: '9mobile', size: '2GB', validity: '30 Days', price: 480 },
  { id: '9mo-3g', network: '9mobile', size: '3GB', validity: '30 Days', price: 700 },
  { id: '9mo-5g', network: '9mobile', size: '5GB', validity: '30 Days', price: 1100 },
  { id: '9mo-10g', network: '9mobile', size: '10GB', validity: '30 Days', price: 2100 },
  { id: '9mo-20g', network: '9mobile', size: '20GB', validity: '30 Days', price: 4000 },
  { id: '9mo-50g', network: '9mobile', size: '50GB', validity: '30 Days', price: 9500 },
  { id: '9mo-100g', network: '9mobile', size: '100GB', validity: '30 Days', price: 18000 }
];

export const SYSTEM_BANK_ACCOUNT: BankAccount = {
  accountName: 'pwamunadi ishaku',
  accountNumber: '8960723295',
  bankName: 'PalmPay'
};

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    type: 'deposit',
    amount: 150000,
    date: '2026-07-08T14:30:00Z',
    status: 'success',
    description: 'Wallet funding via Bank Transfer'
  },
  {
    id: 'tx-2',
    type: 'buy_bpc',
    amount: 10000,
    date: '2026-07-08T18:45:00Z',
    status: 'success',
    description: 'BPC Voucher Purchase',
    bpcCodeGenerated: 'BPC-8960-7232-9501'
  },
  {
    id: 'tx-3',
    type: 'redeem_airtime',
    amount: 2500,
    date: '2026-07-08T19:02:00Z',
    status: 'success',
    description: 'Airtime Recharge (MTN 08034567890)',
    bpcCodeUsed: 'BPC-8960-7232-9501'
  },
  {
    id: 'tx-4',
    type: 'bank_transfer_direct',
    amount: 45000,
    date: '2026-07-09T01:15:00Z',
    status: 'success',
    description: 'Transfer to OPay - Adebayo Samuel'
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Welcome to SwiftPay!',
    body: 'Welcome to SwiftPay. Enjoy a faster, more secure, violet-to-teal digital experience!',
    date: '2026-07-09T00:00:00Z',
    unread: true
  },
  {
    id: 'notif-2',
    title: 'Wema Bank Maintenance Notice',
    body: 'Please use other supported banks for funding or manual transfers, as Wema Bank is currently undergoing scheduled system updates.',
    date: '2026-07-09T01:30:00Z',
    unread: true
  }
];

export const FAQS = [
  {
    question: 'What is a BPC (Bill Payment Code)?',
    answer: 'The Bill Payment Code (BPC) is a first-class voucher code purchased on SwiftPay. You pay for it via a secure manual bank transfer. Once generated, it acts as instant store credit or a redeemable token. You can copy this code and redeem it during airtime, data, or bank transfer operations instead of paying from your direct wallet balance.'
  },
  {
    question: 'How do I fund my Naira Wallet?',
    answer: 'You can fund your SwiftPay wallet by clicking "Withdraw" or utilizing any active voucher code, or completing a direct peer bank transfer. Direct balance updates occur instantly after verifying the transaction.'
  },
  {
    question: 'How long does BPC confirmation take?',
    answer: 'BPC validation usually takes under 3 minutes. Once you copy the bank transfer details, execute the transfer from your personal banking app, and click "I have made this bank Transfer", our system auto-reconciles the payment and activates your BPC Code immediately.'
  },
  {
    question: 'Are there any transaction fees?',
    answer: 'No! SwiftPay offers zero charge transfers on BPC generations, and heavily discounted airtime and data bundles compared to direct retail rates.'
  },
  {
    question: 'What happens if a bank is temporarily unavailable?',
    answer: 'If any major partner bank is undergoing service downtime, we display a status alert notification in the BPC screen. We highly recommend transferring to alternative active bank options to ensure instant confirmation.'
  }
];
