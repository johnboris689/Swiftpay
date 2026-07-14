export interface User {
  fullName: string;
  email: string;
  balance: number;
  dailyTarget: number;
  dailySpent: number;
  pinCreated: boolean;
  pinCode?: string;
  biometricEnabled: boolean;
  phone?: string;
  profilePic?: string;
  isSuspended?: boolean;
  isFrozen?: boolean;
  tier?: number; // Verification tier, e.g. 1, 2, 3
  is2faEnabled?: boolean;
}

export type WdvStatus = 'unused' | 'redeemed';

export interface WdvCode {
  id: string;
  code: string;
  amount: number;
  fullName: string;
  email: string;
  createdAt: string;
  status: WdvStatus;
  redeemedFor?: string; // e.g. "Airtime to 08012345678" or "Bank Transfer"
}

export type TransactionType = 
  | 'deposit'
  | 'withdraw'
  | 'buy_wdv'
  | 'redeem_airtime'
  | 'redeem_data'
  | 'redeem_transfer'
  | 'bank_transfer_direct';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  status: 'pending' | 'success' | 'failed';
  description: string;
  refNum?: string;
  reference?: string;
  wdvCodeUsed?: string;
  wdvCodeGenerated?: string;
  narration?: string;
  senderName?: string;
  recipientName?: string;
  recipientBank?: string;
  recipientAccount?: string;
  charges?: number;
  newBalance?: number;
  network?: string;
  phoneNumber?: string;
  dataPlan?: string;
}

export interface BankAccount {
  accountName: string;
  accountNumber: string;
  bankName: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  date: string;
  unread: boolean;
  type?: 'login' | 'airtime' | 'data' | 'transfer' | 'withdraw' | 'security' | 'system';
}

export interface DeviceSession {
  id: string;
  name: string;
  os: string;
  browser: string;
  loginDate: string;
  lastActivity: string;
  isCurrent: boolean;
}

export interface LoginHistoryItem {
  id: string;
  date: string;
  time: string;
  device: string;
  browser: string;
  ip: string;
  location: string;
  status: 'success' | 'failed' | 'locked';
}

export interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  phone?: string;
  network?: string;
}

export interface SimulatedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  read: boolean;
}
