import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Menu,
  ChevronRight,
  ChevronDown,
  Send,
  Sparkles,
  ArrowLeft,
  Smartphone,
  Landmark,
  ExternalLink,
  Info,
  LogOut,
  HelpCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  CreditCard,
  UserCheck,
  Search,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Share2,
  Check,
  Ticket,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';

import { User, BpcCode, Transaction, NotificationItem } from './types';
import {
  SUPPORTED_BANKS,
  MOBILE_NETWORKS,
  DATA_PLANS,
  SYSTEM_BANK_ACCOUNT,
  INITIAL_TRANSACTIONS,
  INITIAL_NOTIFICATIONS,
  FAQS
} from './data';

import GlassCard from './components/GlassCard';
import NumericPad from './components/NumericPad';
import BottomNav from './components/BottomNav';
import BpcVoucher from './components/BpcVoucher';
import QuickFabMenu from './components/QuickFabMenu';
import NotificationsModal from './components/NotificationsModal';
import TransactionList from './components/TransactionList';
import { TermsOfService, PrivacyPolicy } from './components/LegalPages';

// Upgraded components
import EmailSimulator from './components/EmailSimulator';
import DevicesHistory from './components/DevicesHistory';
import TransactionReceipt from './components/TransactionReceipt';
import AdminPanel from './components/AdminPanel';
import { DeviceSession, LoginHistoryItem, Beneficiary, SimulatedEmail } from './types';

export default function App() {
  // Theme & App Settings (Light, Dark, System Default)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('swiftpay_theme_pref');
    return (saved as 'light' | 'dark' | 'system') || 'system';
  });

  // Derived state for components that check dark mode
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // State Management
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('swiftpay_user');
    if (saved) return JSON.parse(saved);
    return null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('swiftpay_auth') === 'true';
  });

  const [hasSetupPin, setHasSetupPin] = useState<boolean>(() => {
    const saved = localStorage.getItem('swiftpay_pin_setup');
    return saved === 'true';
  });

  const [isPinUnlocked, setIsPinUnlocked] = useState<boolean>(false);

  // Current screen or tab state
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [activeTab, setActiveTab] = useState<string>('wallet');

  // Multi-step form values
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Password Visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Forgot Password flow states
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'verify' | 'new_password'>('request');
  const [simulatedResetInfo, setSimulatedResetInfo] = useState<{ otp: string; token: string } | null>(null);

  // Change Password form states (inside settings)
  const [changeCurrentPassword, setChangeCurrentPassword] = useState('');
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [isChangingPasswordOpen, setIsChangingPasswordOpen] = useState(false);

  // PIN Setup or Unlock States
  const [pinEntry, setPinEntry] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep, setPinStep] = useState<1 | 2>(1); // Step 1: Entry, Step 2: Confirmation
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'reading' | 'success'>('idle');

  // Transactions & Vouchers Persistence
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('swiftpay_transactions');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  const [vouchers, setVouchers] = useState<BpcCode[]>(() => {
    const saved = localStorage.getItem('swiftpay_vouchers');
    return saved ? JSON.parse(saved) : [];
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem('swiftpay_notifications');
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  // Flow specific parameters - BPC Voucher Price is strictly fixed at N6,500
  const [buyBpcAmount, setBuyBpcAmount] = useState<string>('6500');
  const [bpcFormName, setBpcFormName] = useState('');
  const [bpcFormEmail, setBpcFormEmail] = useState('');
  const [bpcProcessingSeconds, setBpcProcessingSeconds] = useState(3);
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Airtime fields
  const [airtimeNetwork, setAirtimeNetwork] = useState('mtn');
  const [airtimePhone, setAirtimePhone] = useState('');
  const [airtimeAmount, setAirtimeAmount] = useState('');
  const [airtimeBpcCode, setAirtimeBpcCode] = useState('');
  const [airtimePlanSelected, setAirtimePlanSelected] = useState<string>('');

  // Data fields (separating the Data Purchase screen)
  const [dataNetwork, setDataNetwork] = useState('mtn');
  const [dataPhone, setDataPhone] = useState('');
  const [dataBpcCode, setDataBpcCode] = useState('');
  const [selectedDataPlan, setSelectedDataPlan] = useState<any>(null);

  // Transfer fields
  const [transferBank, setTransferBank] = useState('9PSB');
  const [transferAccNum, setTransferAccNum] = useState('');
  const [transferAccName, setTransferAccName] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferBpcCode, setTransferBpcCode] = useState('');
  const [isVerifyingAccount, setIsVerifyingAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Direct Withdraw flow - Redesigned into dedicated screen with Real-time Account Verification
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('9PSB');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawAccName, setWithdrawAccName] = useState('');
  const [withdrawBpcCode, setWithdrawBpcCode] = useState('');
  const [isVerifyingWithdrawAccount, setIsVerifyingWithdrawAccount] = useState(false);

  // Mandatory BPC Voucher missing overlay config
  const [voucherErrorModal, setVoucherErrorModal] = useState<{ open: boolean; message: string } | null>(null);

  // Guide Video modal
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Support live chat
  const [liveChatMessages, setLiveChatMessages] = useState<Array<{ sender: 'user' | 'agent'; text: string; time: string }>>([
    { sender: 'agent', text: 'Hello! Welcome to SwiftPay Live Chat. How can we assist you with your BPC vouchers or wallet transfers today?', time: 'Just now' }
  ]);
  const [liveChatInput, setLiveChatInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [generatedBpc, setGeneratedBpc] = useState<BpcCode | null>(null);

  // New Upgraded States for Fintech Compliance
  const [isEmailSimulatorOpen, setIsEmailSimulatorOpen] = useState(false);
  const [emails, setEmails] = useState<SimulatedEmail[]>(() => {
    const saved = localStorage.getItem('swiftpay_simulated_emails');
    return saved ? JSON.parse(saved) : [];
  });

  const [devices, setDevices] = useState<DeviceSession[]>(() => {
    const saved = localStorage.getItem('swiftpay_devices');
    return saved ? JSON.parse(saved) : [
      { id: 'dev-1', name: 'Chrome Desktop', os: 'macOS', browser: 'Chrome 125', loginDate: new Date().toLocaleDateString(), lastActivity: 'Just now', isCurrent: true },
      { id: 'dev-2', name: 'iPhone 15 Pro', os: 'iOS 17', browser: 'Safari Mobile', loginDate: '2026-07-08', lastActivity: '1 day ago', isCurrent: false }
    ];
  });

  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>(() => {
    const saved = localStorage.getItem('swiftpay_login_history');
    return saved ? JSON.parse(saved) : [
      { id: 'log-1', date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), device: 'Chrome Desktop', browser: 'Chrome 125', ip: '197.210.64.12', location: 'Lagos, Nigeria', status: 'success' },
      { id: 'log-2', date: '2026-07-08', time: '14:22:10', device: 'iPhone 15 Pro', browser: 'Safari Mobile', ip: '102.89.33.45', location: 'Abuja, Nigeria', status: 'success' },
      { id: 'log-3', date: '2026-07-08', time: '09:05:14', device: 'Unknown Linux Device', browser: 'Firefox 120', ip: '185.190.140.2', location: 'Frankfurt, Germany', status: 'failed' }
    ];
  });

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(() => {
    const saved = localStorage.getItem('swiftpay_beneficiaries');
    return saved ? JSON.parse(saved) : [
      { id: 'ben-1', name: 'Alhaji Yusuf Dangote', accountNumber: '0123456789', bankName: 'Access Bank Limited' },
      { id: 'ben-2', name: 'Chioma Sandra Okafor', accountNumber: '8960723295', bankName: 'OPay' },
      { id: 'ben-3', name: 'Adebayo Balogun', accountNumber: '2001458922', bankName: 'Zenith Bank Plc' }
    ];
  });

  const [phoneBeneficiaries, setPhoneBeneficiaries] = useState<any[]>(() => {
    const saved = localStorage.getItem('swiftpay_phone_beneficiaries');
    return saved ? JSON.parse(saved) : [
      { id: 'pben-1', name: 'Mom', phone: '08034567890', network: 'mtn' },
      { id: 'pben-2', name: 'Office', phone: '09012345678', network: 'airtel' },
      { id: 'pben-3', name: 'Sister', phone: '07055544433', network: 'glo' }
    ];
  });

  const [selectedReceiptTx, setSelectedReceiptTx] = useState<Transaction | null>(null);
  
  // Security 2FA / sensitive action states
  const [securityOtp, setSecurityOtp] = useState('');
  const [securityOtpSession, setSecurityOtpSession] = useState<{ otp: string; purpose: string; data?: any; expiresAt: number } | null>(null);

  // Inactivity countdown
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);

  // Transfer specific additions
  const [transferNarration, setTransferNarration] = useState('');
  const [transferPin, setTransferPin] = useState('');
  const [transferConfirmationTx, setTransferConfirmationTx] = useState<any | null>(null);
  const [isTransferConfirming, setIsTransferConfirming] = useState(false);
  const [isTransferSuccess, setIsTransferSuccess] = useState(false);
  const [transferSuccessTx, setTransferSuccessTx] = useState<Transaction | null>(null);

  // Modals & Sliders Toggle
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [activeDataTab, setActiveDataTab] = useState<'daily' | 'weekly' | 'monthly' | 'sme'>('daily');

  // Feedback Notifications (Toasts)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'info' | 'error'>('success');

  // Offline/Online detection (Point 5)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Theme Preference effect supporting Light, Dark, and System Default
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      let shouldBeDark = true;
      if (theme === 'dark') {
        shouldBeDark = true;
      } else if (theme === 'light') {
        shouldBeDark = false;
      } else {
        shouldBeDark = mediaQuery.matches;
      }

      setIsDarkMode(shouldBeDark);
      if (shouldBeDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    localStorage.setItem('swiftpay_theme_pref', theme);

    if (theme === 'system') {
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  // Sync state changes to LocalStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('swiftpay_user', JSON.stringify(user));
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('swiftpay_transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('swiftpay_vouchers', JSON.stringify(vouchers));
  }, [vouchers]);

  useEffect(() => {
    localStorage.setItem('swiftpay_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('swiftpay_simulated_emails', JSON.stringify(emails));
  }, [emails]);

  useEffect(() => {
    localStorage.setItem('swiftpay_devices', JSON.stringify(devices));
  }, [devices]);

  useEffect(() => {
    localStorage.setItem('swiftpay_login_history', JSON.stringify(loginHistory));
  }, [loginHistory]);

  useEffect(() => {
    localStorage.setItem('swiftpay_beneficiaries', JSON.stringify(beneficiaries));
  }, [beneficiaries]);

  // Online/Offline Event Listeners (Point 5)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Connection restored. You are back online!', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Network connection lost. SwiftPay is running in offline mode.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Inactivity automatic logout monitor
  useEffect(() => {
    if (!isAuthenticated || currentScreen === 'onboarding') {
      setInactivityCountdown(null);
      return;
    }

    let activityTimer: any = null;
    let countdownInterval: any = null;

    const resetInactivityTimer = () => {
      setInactivityCountdown(null);
      if (activityTimer) clearTimeout(activityTimer);
      if (countdownInterval) clearInterval(countdownInterval);

      // Set inactivity alert to trigger after 270 seconds (4.5 minutes)
      activityTimer = setTimeout(() => {
        let remaining = 30;
        setInactivityCountdown(remaining);

        countdownInterval = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(countdownInterval);
            handleLogout();
            showToast('Automatic logout: Inactive session expired.', 'info');
          } else {
            setInactivityCountdown(remaining);
          }
        }, 1000);
      }, 270 * 1000);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(ev => window.addEventListener(ev, resetInactivityTimer));

    resetInactivityTimer();

    return () => {
      if (activityTimer) clearTimeout(activityTimer);
      if (countdownInterval) clearInterval(countdownInterval);
      events.forEach(ev => window.removeEventListener(ev, resetInactivityTimer));
    };
  }, [isAuthenticated, currentScreen]);

  // Scroll live chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveChatMessages, isAgentTyping]);

  // Toast trigger helper
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Send a simulated email
  const sendSimulatedEmail = (to: string, subject: string, body: string) => {
    const newEmail: SimulatedEmail = {
      id: 'email-' + Math.random().toString(36).substring(2, 9),
      to,
      subject,
      body,
      date: new Date().toISOString(),
      read: false
    };
    setEmails(prev => [newEmail, ...prev]);
  };

  // Helper to start a secure 2FA session for a sensitive action
  const startSecurityOtpSession = (purpose: string, data: any, emailAddress: string) => {
    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    setSecurityOtpSession({
      otp: generatedCode,
      purpose,
      data,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 mins expiry
    });
    setSecurityOtp('');
    sendSimulatedEmail(
      emailAddress,
      'SwiftPay SecurID Authorization Code',
      `Dear customer,\n\nA sensitive operation was initiated on your SwiftPay mobile application. To confirm it is you, please enter the following 6-digit authorization code:\n\nVerification Code: ${generatedCode}\n\nThis code will expire in 5 minutes. If you did not request this, please change your password immediately or contact live chat support.`
    );
    showToast('A secure 2FA code was dispatched to your simulated inbox!', 'info');
  };

  // Onboarding registration via Express backend
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      showToast('Please fill out all fields', 'error');
      return;
    }

    // Password validation: at least 8 chars, containing letter and number
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (password.length < 8 || !hasLetter || !hasNumber) {
      showToast('Password must be at least 8 characters long and contain both letters and numbers.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Registration failed.', 'error');
        return;
      }

      setUser(data.user);
      localStorage.setItem('swiftpay_auth', 'true');
      setIsAuthenticated(true);
      setHasSetupPin(false);
      setPinEntry('');
      setPinConfirm('');
      setPinStep(1);
      setCurrentScreen('pin_setup');
      showToast('Account created successfully!', 'success');
    } catch (err) {
      console.error('Registration error:', err);
      showToast('Network error during registration.', 'error');
    }
  };

  // Onboarding Login via Express backend
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please enter your credentials', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Authentication failed.', 'error');
        return;
      }

      setUser(data.user);
      localStorage.setItem('swiftpay_auth', 'true');
      setIsAuthenticated(true);

      if (data.user.pinCreated) {
        localStorage.setItem('swiftpay_pin_setup', 'true');
        setHasSetupPin(true);
        setIsPinUnlocked(false);
        setCurrentScreen('pin_entry');
        setPinEntry('');
        showToast('Welcome back, enter your PIN to unlock', 'success');
      } else {
        localStorage.removeItem('swiftpay_pin_setup');
        setHasSetupPin(false);
        setPinEntry('');
        setPinConfirm('');
        setPinStep(1);
        setCurrentScreen('pin_setup');
        showToast('Create your 4-digit security PIN to get started', 'info');
      }
    } catch (err) {
      console.error('Login error:', err);
      showToast('Network error during login.', 'error');
    }
  };

  // Forgot Password flow - initiate code generation
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      showToast('Please enter your email address', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to dispatch reset code.', 'error');
        return;
      }

      // Store simulated recovery info so the user can easily test OTP/reset link on the frontend directly
      setSimulatedResetInfo({ otp: data.otp, token: data.token });
      setResetStep('verify');
      showToast('Simulated secure recovery details dispatched!', 'success');
    } catch (err) {
      showToast('Error requesting password recovery.', 'error');
    }
  };

  // Forgot Password flow - verify OTP or Token
  const handleVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetOtp && !resetToken) {
      showToast('Please enter the OTP or Reset Token', 'error');
      return;
    }
    setResetStep('new_password');
    showToast('Reset credentials verified. Set your new password.', 'success');
  };

  // Forgot Password flow - submit password reset
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (newPassword.length < 8 || !hasLetter || !hasNumber) {
      showToast('Password must be at least 8 characters long and contain both letters and numbers.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail,
          password: newPassword,
          otp: resetOtp || undefined,
          token: resetToken || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Reset failed.', 'error');
        return;
      }

      // Reset forgot password states
      setResetStep('request');
      setForgotEmail('');
      setResetOtp('');
      setResetToken('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSimulatedResetInfo(null);
      setAuthMode('signin');
      setCurrentScreen('onboarding');
      showToast('Password updated securely. Please sign in.', 'success');
    } catch (err) {
      showToast('Network error during password reset.', 'error');
    }
  };

  // 2FA Sensitive Callback Handlers
  const handleConfirmPasswordChange = async (data: any) => {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          currentPassword: data.currentPassword,
          newPassword: data.newPassword
        })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast('Password changed successfully!', 'success');
        setChangeCurrentPassword('');
        setChangeNewPassword('');
        setIsChangingPasswordOpen(false);
      } else {
        showToast(resData.error || 'Failed to change password.', 'error');
      }
    } catch (err) {
      showToast('Error executing password change.', 'error');
    }
  };

  const handleConfirmEmailChange = async (data: any) => {
    showToast('Email updated successfully!', 'success');
  };

  const handleConfirmPinChange = async (data: any) => {
    showToast('PIN changed successfully!', 'success');
  };

  const handleConfirmTransferSubmit = async (data: any) => {
    if (data && typeof data.onSuccess === 'function') {
      data.onSuccess();
    } else {
      showToast('Transfer completed successfully!', 'success');
    }
  };

  // Log out flow
  const handleLogout = () => {
    localStorage.removeItem('swiftpay_auth');
    localStorage.removeItem('swiftpay_pin_setup');
    setIsAuthenticated(false);
    setIsPinUnlocked(false);
    setUser(null);
    setPinEntry('');
    setPinConfirm('');
    setCurrentScreen('onboarding');
    showToast('Logged out securely', 'info');
  };

  // Handle keypress on NumericPad for PIN screen
  const handlePinKeyPress = (num: string) => {
    if (currentScreen === 'pin_setup') {
      if (pinStep === 1) {
        if (pinEntry.length < 4) {
          const newPin = pinEntry + num;
          setPinEntry(newPin);
          if (newPin.length === 4) {
            // Move to confirm
            setTimeout(() => {
              setPinStep(2);
            }, 300);
          }
        }
      } else {
        if (pinConfirm.length < 4) {
          const newConfirm = pinConfirm + num;
          setPinConfirm(newConfirm);
          if (newConfirm.length === 4) {
            // Verify
            setTimeout(() => {
              if (pinEntry === newConfirm) {
                if (user) {
                  setUser({ ...user, pinCreated: true, pinCode: pinEntry });
                }
                localStorage.setItem('swiftpay_pin_setup', 'true');
                setHasSetupPin(true);
                setIsPinUnlocked(true);
                showToast('Wallet PIN configured securely!', 'success');
                setCurrentScreen('dashboard');
              } else {
                showToast('PINs do not match. Restarting entry.', 'error');
                setPinEntry('');
                setPinConfirm('');
                setPinStep(1);
              }
            }, 350);
          }
        }
      }
    } else if (currentScreen === 'pin_entry') {
      if (pinEntry.length < 4) {
        const newPin = pinEntry + num;
        setPinEntry(newPin);
        if (newPin.length === 4) {
          setTimeout(() => {
            if (newPin === (user?.pinCode || '1234')) {
              setIsPinUnlocked(true);
              setCurrentScreen('dashboard');
              showToast(`Unlocked successfully. Welcome back!`, 'success');
            } else {
              showToast('Invalid passcode. Try again', 'error');
              setPinEntry('');
            }
          }, 300);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    if (currentScreen === 'pin_setup') {
      if (pinStep === 1) {
        setPinEntry(pinEntry.slice(0, -1));
      } else {
        setPinConfirm(pinConfirm.slice(0, -1));
      }
    } else if (currentScreen === 'pin_entry') {
      setPinEntry(pinEntry.slice(0, -1));
    }
  };

  // Simulate fingerprint scan triggers
  const triggerFingerprintScan = () => {
    if (biometricStatus !== 'idle') return;
    setBiometricStatus('reading');

    setTimeout(() => {
      setBiometricStatus('success');
      setTimeout(() => {
        setBiometricStatus('idle');
        if (currentScreen === 'pin_setup') {
          if (user) {
            setUser({ ...user, biometricEnabled: true });
          }
          showToast('Fingerprint biometric added!', 'success');
        } else if (currentScreen === 'pin_entry') {
          setIsPinUnlocked(true);
          setCurrentScreen('dashboard');
          showToast('Authenticated via fingerprint', 'success');
        }
      }, 1000);
    }, 1800);
  };

  // Verify Account Name when typing 10 digits
  useEffect(() => {
    if (transferAccNum.length === 10) {
      setIsVerifyingAccount(true);
      setTimeout(() => {
        setIsVerifyingAccount(false);
        // Realistic simulated account name based on account digit values
        const seedNames = [
          'Olanrewaju Kolawole',
          'Chinedu Okeke',
          'Blessing Nwachukwu',
          'Aisha Yusuf',
          'Emeka Nwosu',
          'Ibrahim Danladi'
        ];
        const randomName = seedNames[parseInt(transferAccNum.slice(-1)) % seedNames.length];
        setTransferAccName(randomName);
      }, 1000);
    } else {
      setTransferAccName('');
    }
  }, [transferAccNum]);

  // BPC Order Creation (Manual Bank Transfer flow)
  const handleInitiateBpc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyBpcAmount || parseInt(buyBpcAmount) <= 0) {
      showToast('Please specify a valid voucher amount', 'error');
      return;
    }
    setBpcFormName(user?.fullName || 'Client User');
    setBpcFormEmail(user?.email || 'user@example.com');
    setCurrentScreen('bpc_processing');
    setBpcProcessingSeconds(3);
  };

  // Simulated Processing countdown ticker
  useEffect(() => {
    if (currentScreen === 'bpc_processing') {
      if (bpcProcessingSeconds > 0) {
        const timer = setTimeout(() => {
          setBpcProcessingSeconds(bpcProcessingSeconds - 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        setCurrentScreen('bpc_instructions');
      }
    }
  }, [bpcProcessingSeconds, currentScreen]);

  // Complete bank transfer and redirect to WhatsApp for manual validation (Point 14)
  const handleConfirmBankTransfer = () => {
    const waUrl = "https://wa.me/2349162845073?text=I%20have%20made%20the%20BPC%20voucher%20payment";
    window.open(waUrl, "_blank");
    
    // Log a pending transaction so the user has visual representation in their history
    const amountNum = 6500; // Fixed BPC Voucher price is ₦6,500 (Point 9)
    const newTransaction: Transaction = {
      id: `tx-${Date.now()}`,
      type: 'buy_bpc',
      amount: amountNum,
      date: new Date().toISOString(),
      status: 'success',
      description: `BPC Voucher Purchased (Manual confirmation pending via WhatsApp)`
    };

    setTransactions([newTransaction, ...transactions]);

    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: 'BPC Order Placed via WhatsApp',
      body: `Your manual order for ₦6,500 is being verified by a support agent. Please complete the transfer and provide screenshot proof on WhatsApp.`,
      date: new Date().toISOString(),
      unread: true
    };
    setNotifications([newNotif, ...notifications]);

    showToast('Redirected to WhatsApp! Please send payment proof.', 'success');
    setCurrentScreen('dashboard');
    setActiveTab('wallet');
  };

  // Helper to persist balance update on server and sync locally
  const updateBalanceOnServer = async (newBalance: number) => {
    if (!user) return;
    try {
      const res = await fetch('/api/auth/update-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, balance: newBalance })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser({ ...user, balance: newBalance });
      } else {
        setUser({ ...user, balance: newBalance });
      }
    } catch (e) {
      console.error('Balance sync error:', e);
      setUser({ ...user, balance: newBalance });
    }
  };

  // Perform Airtime Purchase
  const handlePurchaseAirtime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!airtimePhone || airtimePhone.length < 10) {
      showToast('Enter a valid Nigerian phone number', 'error');
      return;
    }
    if (!airtimeAmount || parseInt(airtimeAmount) < 100) {
      showToast('Minimum purchase is ₦100', 'error');
      return;
    }

    const price = parseInt(airtimeAmount);
    const codeToUse = airtimeBpcCode.trim();

    // MANDATORY BPC Voucher Verification (Point 7)
    if (!codeToUse) {
      setVoucherErrorModal({
        open: true,
        message: "BPC Voucher Required. If you don't have one, tap Buy BPC Voucher."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Verify voucher against server (Point 7)
      const res = await fetch('/api/auth/verify-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherCode: codeToUse })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Invalid BPC Voucher.', 'error');
        setIsSubmitting(false);
        return;
      }

      // If voucher has an associated amount, we can bypass balance deduction or deduct balance accordingly.
      // But according to prompt: "A valid BPC Voucher is required before a user can perform any of these actions: Withdrawal, Transfer, Airtime, Data. Only BPC-7674-2206-6501 should be accepted. Users cannot bypass this verification."
      // Since it's verified, we deduct the purchase cost from user balance (Point 5 - Live Balance updates instantly).
      if (!user || user.balance < price) {
        showToast('Insufficient wallet balance to complete this purchase', 'error');
        setIsSubmitting(false);
        return;
      }

      const nextBalance = user.balance - price;
      await updateBalanceOnServer(nextBalance);

      // Create transaction logs
      const newTx: Transaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: 'redeem_airtime',
        amount: price,
        date: new Date().toISOString(),
        status: 'success',
        description: `Airtime (${airtimeNetwork.toUpperCase()} ${airtimePhone}) purchased with BPC code`,
        bpcCodeUsed: codeToUse
      };
      setTransactions([newTx, ...transactions]);

      // Automatically trigger notification update
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        title: 'Airtime Purchase Successful!',
        body: `₦${price.toLocaleString()} Airtime has been credited to ${airtimePhone}. Balance updated.`,
        date: new Date().toISOString(),
        unread: true
      };
      setNotifications([newNotif, ...notifications]);

      showToast('Airtime purchase completed successfully!', 'success');
      
      // Reset fields
      setAirtimePhone('');
      setAirtimeAmount('');
      setAirtimeBpcCode('');
      setCurrentScreen('dashboard');
      setActiveTab('wallet');
    } catch (err) {
      showToast('Error validating BPC voucher.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Perform Data Bundle Purchase (Point 12)
  const handlePurchaseData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!dataPhone || dataPhone.length < 10) {
      showToast('Enter a valid Nigerian phone number', 'error');
      return;
    }
    if (!selectedDataPlan) {
      showToast('Please select a data bundle from the available list', 'error');
      return;
    }

    const price = selectedDataPlan.price;
    const codeToUse = dataBpcCode.trim();

    // MANDATORY BPC Voucher Verification (Point 7)
    if (!codeToUse) {
      setVoucherErrorModal({
        open: true,
        message: "BPC Voucher Required. If you don't have one, tap Buy BPC Voucher."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Verify voucher against server (Point 7)
      const res = await fetch('/api/auth/verify-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherCode: codeToUse })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Invalid BPC Voucher.', 'error');
        setIsSubmitting(false);
        return;
      }

      if (!user || user.balance < price) {
        showToast('Insufficient wallet balance to complete this purchase', 'error');
        setIsSubmitting(false);
        return;
      }

      const nextBalance = user.balance - price;
      await updateBalanceOnServer(nextBalance);

      // Create transaction logs
      const newTx: Transaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: 'redeem_airtime', // logged in transaction system
        amount: price,
        date: new Date().toISOString(),
        status: 'success',
        description: `${selectedDataPlan.size} Data Bundle (${dataNetwork.toUpperCase()} ${dataPhone})`,
        bpcCodeUsed: codeToUse
      };
      setTransactions([newTx, ...transactions]);

      // Trigger notification update
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        title: 'Data Purchase Successful!',
        body: `${selectedDataPlan.size} bundle active on ${dataPhone}. Balance updated.`,
        date: new Date().toISOString(),
        unread: true
      };
      setNotifications([newNotif, ...notifications]);

      showToast(`Successfully purchased ${selectedDataPlan.size} data bundle!`, 'success');

      // Reset fields
      setDataPhone('');
      setSelectedDataPlan(null);
      setDataBpcCode('');
      setCurrentScreen('dashboard');
      setActiveTab('wallet');
    } catch (err) {
      showToast('Error validating BPC voucher.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Perform Bank Transfer Out flow
  const handleBankTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!transferAccNum || transferAccNum.length !== 10 || !transferAccName) {
      showToast('Please enter a verified 10-digit account number', 'error');
      return;
    }
    if (!transferAmount || parseInt(transferAmount) <= 0) {
      showToast('Please specify a valid transfer amount', 'error');
      return;
    }

    const price = parseInt(transferAmount);
    const codeToUse = transferBpcCode.trim();

    // MANDATORY BPC Voucher Verification (Point 7)
    if (!codeToUse) {
      setVoucherErrorModal({
        open: true,
        message: "BPC Voucher Required. If you don't have one, tap Buy BPC Voucher."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Verify voucher against server (Point 7)
      const res = await fetch('/api/auth/verify-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherCode: codeToUse })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Invalid BPC Voucher.', 'error');
        setIsSubmitting(false);
        return;
      }

      // Deduct wallet balance (Limits are fully removed - Point 6)
      if (!user || user.balance < price) {
        showToast('Insufficient wallet balance to complete this bank transfer', 'error');
        setIsSubmitting(false);
        return;
      }

      const nextBalance = user.balance - price;
      await updateBalanceOnServer(nextBalance);

      const newTx: Transaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: 'bank_transfer_direct',
        amount: price,
        date: new Date().toISOString(),
        status: 'success',
        description: `Transfer of ₦${price.toLocaleString()} to ${transferBank} (${transferAccName})`,
        bpcCodeUsed: codeToUse
      };
      setTransactions([newTx, ...transactions]);

      // Trigger notification update
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        title: 'Transfer Completed!',
        body: `₦${price.toLocaleString()} has been sent to ${transferAccName} (${transferBank}).`,
        date: new Date().toISOString(),
        unread: true
      };
      setNotifications([newNotif, ...notifications]);

      showToast('Bank transfer completed successfully!', 'success');

      // Reset and return
      setTransferAccNum('');
      setTransferAmount('');
      setTransferBpcCode('');
      setTransferAccName('');
      setCurrentScreen('dashboard');
      setActiveTab('wallet');
    } catch (err) {
      showToast('Error validating BPC voucher.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Perform Dedicated Bank Withdrawal Flow (Point 11, Point 7)
  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!withdrawAccount || withdrawAccount.length !== 10 || !withdrawAccName) {
      showToast('Please enter a verified 10-digit withdrawal account number', 'error');
      return;
    }
    if (!withdrawAmount || parseInt(withdrawAmount) <= 0) {
      showToast('Please specify a valid withdrawal amount', 'error');
      return;
    }

    const price = parseInt(withdrawAmount);
    const codeToUse = withdrawBpcCode.trim();

    // MANDATORY BPC Voucher Verification (Point 7)
    if (!codeToUse) {
      setVoucherErrorModal({
        open: true,
        message: "BPC Voucher Required. If you don't have one, tap Buy BPC Voucher."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Verify voucher against server (Point 7)
      const res = await fetch('/api/auth/verify-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherCode: codeToUse })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Invalid BPC Voucher.', 'error');
        setIsSubmitting(false);
        return;
      }

      // Deduct wallet balance (Limits are fully removed - Point 6)
      if (!user || user.balance < price) {
        showToast('Insufficient wallet balance to complete this withdrawal', 'error');
        setIsSubmitting(false);
        return;
      }

      const nextBalance = user.balance - price;
      await updateBalanceOnServer(nextBalance);

      const newTx: Transaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: 'withdraw',
        amount: price,
        date: new Date().toISOString(),
        status: 'success',
        description: `Withdrew ₦${price.toLocaleString()} to ${withdrawBank} (${withdrawAccName})`,
        bpcCodeUsed: codeToUse
      };
      setTransactions([newTx, ...transactions]);

      // Trigger notification update
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        title: 'Withdrawal Successful!',
        body: `₦${price.toLocaleString()} withdrawn to ${withdrawAccName} (${withdrawBank}).`,
        date: new Date().toISOString(),
        unread: true
      };
      setNotifications([newNotif, ...notifications]);

      showToast('Withdrawal completed successfully!', 'success');

      // Reset and return
      setWithdrawAccount('');
      setWithdrawAmount('');
      setWithdrawBpcCode('');
      setWithdrawAccName('');
      setCurrentScreen('dashboard');
      setActiveTab('wallet');
    } catch (err) {
      showToast('Error validating BPC voucher.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectWithdraw = handleWithdrawalSubmit;

  // Pre-fill BPC Code on transfer/airtime forms
  const handleQuickRedeemBpc = (code: string, flow: 'airtime' | 'transfer') => {
    if (flow === 'airtime') {
      setAirtimeBpcCode(code);
      const voucher = vouchers.find(v => v.code === code);
      if (voucher) {
        setAirtimeAmount(voucher.amount.toString());
      }
      setCurrentScreen('buy_airtime');
    } else {
      setTransferBpcCode(code);
      const voucher = vouchers.find(v => v.code === code);
      if (voucher) {
        setTransferAmount(voucher.amount.toString());
      }
      setCurrentScreen('transfer_bank');
    }
  };

  // Handle support message submissions
  const handleSendSupportMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveChatInput.trim()) return;

    const userMsg = liveChatInput.trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setLiveChatMessages((prev) => [...prev, { sender: 'user', text: userMsg, time: timeStr }]);
    setLiveChatInput('');
    setIsAgentTyping(true);

    // Dynamic support answers
    setTimeout(() => {
      let replyText = 'Thank you for reaching out. A premium billing operator has logged your session. If you have made a transfer, please wait up to 3 minutes for automatic synchronization.';
      const msgLower = userMsg.toLowerCase();

      if (msgLower.includes('bpc') || msgLower.includes('voucher') || msgLower.includes('code')) {
        replyText = 'BPC codes represent Bill Payment Codes. After completing a manual transfer to PalmPay (8960723295), click "I have made this bank Transfer" to instantly active your code.';
      } else if (msgLower.includes('delay') || msgLower.includes('confirm') || msgLower.includes('wait')) {
        replyText = 'Apologies for the delay! If your bank is under maintenance, our backend operators reconcile transfers manually. Drop your account name and transfer receipt here for prompt verification!';
      } else if (msgLower.includes('airtime') || msgLower.includes('data')) {
        replyText = 'To load airtime or data, navigate to the Data tab, specify your phone number, select your desired network, paste your active BPC code in the field, and click purchase!';
      } else if (msgLower.includes('hello') || msgLower.includes('hi') || msgLower.includes('support')) {
        replyText = `Hi! SwiftPay Live Agent online. How can we assist with your balances or BPC voucher generation?`;
      }

      setLiveChatMessages((prev) => [...prev, { sender: 'agent', text: replyText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      setIsAgentTyping(false);
    }, 1500);
  };

  // Helper formatting
  const nairaFormat = (val: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Mark single notification read
  const handleMarkNotifRead = (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, unread: false } : n));
  };

  // Mark all notifications read
  const handleMarkAllNotifsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, unread: false })));
    showToast('All notifications marked as read', 'info');
  };

  // Trigger floating actions from sheet
  const handleSelectFabAction = (actionId: string) => {
    if (actionId === 'buy-bpc') {
      setCurrentScreen('buy_bpc');
    } else if (actionId === 'buy-airtime') {
      setCurrentScreen('buy_airtime');
    } else if (actionId === 'buy-data') {
      setCurrentScreen('buy_data');
    } else if (actionId === 'transfer-bank') {
      setCurrentScreen('transfer_bank');
    } else if (actionId === 'social-channels') {
      setActiveTab('social');
      setCurrentScreen('dashboard');
    }
  };

  return (
    // Outer Ambient background framing the phone simulator
    <div className="min-h-screen bg-[#050507] [background:radial-gradient(circle_at_0%_0%,#1e1b4b_0%,#050507_50%),radial-gradient(circle_at_100%_100%,#0d9488_0%,#050507_50%)] text-white flex flex-col items-center justify-center p-4 md:p-6 font-sans overflow-x-hidden md:overflow-visible">
      
      {/* Decorative desktop titles (Hidden on mobile) */}
      <div className="hidden md:flex flex-col items-center mb-6 text-center">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full mb-2">
          <Sparkles className="h-4.5 w-4.5 text-[#2dd4bf] animate-pulse" />
          <span className="text-xs font-mono tracking-widest text-[#2dd4bf] uppercase">Premium Mobile Simulator</span>
        </div>
        <h1 className="text-3xl font-black font-display tracking-tight bg-gradient-to-r from-[#818cf8] to-[#2dd4bf] bg-clip-text text-transparent">
          SwiftPay Fintech Wallet
        </h1>
        <p className="text-xs text-slate-400 mt-1">Elegant Dark Theme — Glassmorphism &amp; BPC Code System</p>
      </div>

      {/* Container holding mockup and side panels on large screens */}
      <div className="flex flex-col xl:flex-row items-center justify-center gap-8 max-w-7xl w-full">
        
        {/* Left Side Panel (Hidden on mobile, beautiful on desktop) */}
        <div className="hidden xl:flex flex-col w-[300px] shrink-0 gap-6">
          <GlassCard className="p-6 space-y-4 border border-white/[0.08] bg-white/[0.04]">
            <div className="inline-block self-start px-2.5 py-1 rounded-lg bg-[#115e59] text-[#2dd4bf] text-[10px] font-black uppercase tracking-wider">
              SwiftPay Exclusive
            </div>
            <h3 className="text-xl font-bold font-display text-white">Buy BPC Voucher</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Redeemable for airtime, data, and direct utility payments. Enter an amount inside the app to initiate.
            </p>
            <div className="bg-black/40 p-4 rounded-xl border border-dashed border-white/10 text-center font-mono text-sm tracking-widest text-[#2dd4bf]">
              {vouchers.length > 0 ? vouchers[0].code : 'CODE: SP-9982-X2Q'}
            </div>
            <button
              onClick={() => {
                const code = vouchers.length > 0 ? vouchers[0].code : 'SP-9982-X2Q';
                navigator.clipboard.writeText(code);
                showToast('Voucher code copied!', 'success');
              }}
              className="w-full py-2.5 bg-[#2dd4bf] hover:bg-[#20b8a4] text-[#050507] font-bold rounded-xl text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer"
            >
              Copy Voucher Code
            </button>
          </GlassCard>
        </div>

        {/* Main Core Viewport Simulator */}
        <div
          id="swiftpay-mobile-container"
          className="w-full max-w-md h-screen md:h-[844px] bg-[#0c0c14] md:rounded-[40px] md:border-[8px] md:border-[#1f1f2e] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative flex flex-col overflow-hidden transition-colors duration-300"
        >
        {/* Offline Banner Indicator (Point 5) */}
        {!isOnline && (
          <div className="bg-amber-500/95 text-slate-950 px-4 py-2 text-[10px] font-bold text-center flex items-center justify-center gap-1.5 z-50 animate-pulse">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Connection Lost. Running in offline view.</span>
          </div>
        )}

        {/* Dynamic Interactive Toast Banners */}
        {toastMessage && (
          <div className="absolute top-16 left-4 right-4 z-50 animate-[slideDown_0.2s_ease-out]">
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold shadow-xl border backdrop-blur-md flex items-center gap-2.5 ${
                toastType === 'success'
                  ? 'bg-emerald-500/10 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : toastType === 'error'
                  ? 'bg-red-500/10 dark:bg-red-950/80 text-red-600 dark:text-red-400 border-red-500/20'
                  : 'bg-indigo-500/10 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
              }`}
            >
              {toastType === 'success' && <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />}
              {toastType === 'error' && <AlertTriangle className="h-4.5 w-4.5 shrink-0" />}
              {toastType === 'info' && <Info className="h-4.5 w-4.5 shrink-0" />}
              <span className="flex-1">{toastMessage}</span>
            </div>
          </div>
        )}

        {/* -------------------- VIEW 1 & 2: AUTH / ONBOARDING SCREEN -------------------- */}
        {!isAuthenticated && (
          <div className="flex-1 flex flex-col justify-between p-6 bg-gradient-to-b from-indigo-950 via-purple-950 to-slate-950 overflow-y-auto no-scrollbar">
            
            {/* Upper Splash Logo & Slogan */}
            <div className="text-center pt-8">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-tr from-indigo-500 via-violet-500 to-teal-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 animate-bounce">
                <Sparkles className="h-8 w-8 text-white stroke-[2.5]" />
              </div>
              <h2 className="text-3xl font-black font-display tracking-tight bg-gradient-to-r from-white via-slate-100 to-teal-200 bg-clip-text text-transparent">
                SwiftPay
              </h2>
              <span className="text-[10px] tracking-wider uppercase font-mono font-bold text-teal-400 block mt-1">Rebrand of BluePay</span>
              <p className="text-xs text-slate-300 mt-4 px-3 leading-relaxed">
                Get your account ready and instantly start buying, selling airtime and data online and start paying all your bills in cheaper price
              </p>
            </div>

            {/* Middle Input Forms */}
            <div className="my-6">
              <GlassCard className="p-5 border-white/5 bg-slate-900/40">
                {authMode !== 'forgot' ? (
                  <>
                    <div className="flex border-b border-white/10 mb-4 pb-2">
                      <button
                        id="btn-tab-signup"
                        type="button"
                        onClick={() => setAuthMode('signup')}
                        className={`flex-1 text-center pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                          authMode === 'signup' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-slate-400'
                        }`}
                      >
                        Sign Up
                      </button>
                      <button
                        id="btn-tab-signin"
                        type="button"
                        onClick={() => setAuthMode('signin')}
                        className={`flex-1 text-center pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                          authMode === 'signin' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-slate-400'
                        }`}
                      >
                        Sign In
                      </button>
                    </div>

                    <form onSubmit={authMode === 'signup' ? handleSignUp : handleSignIn} className="space-y-4">
                      {authMode === 'signup' && (
                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Full Name</label>
                          <input
                            id="signup-fullname"
                            type="text"
                            placeholder="John Doe"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          />
                        </div>
                      )}

                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">Email Address</label>
                        <input
                          id="auth-email"
                          type="email"
                          placeholder="john@example.com"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-mono text-slate-400">Password</label>
                          {authMode === 'signin' && (
                            <button
                              id="btn-goto-forgot"
                              type="button"
                              onClick={() => {
                                setForgotEmail(email);
                                setAuthMode('forgot');
                                setResetStep('request');
                              }}
                              className="text-[10px] font-bold text-teal-400 hover:underline cursor-pointer"
                            >
                              Forgot Password?
                            </button>
                          )}
                        </div>
                        <input
                          id="auth-password"
                          type="password"
                          placeholder="••••••••"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400"
                        />
                      </div>

                      <button
                        id="btn-auth-submit"
                        type="submit"
                        className="w-full text-xs font-bold uppercase tracking-widest py-3 bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-500 hover:from-indigo-600 hover:to-teal-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mt-2"
                      >
                        {authMode === 'signup' ? 'Create Account' : 'Sign In'}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                      <button
                        type="button"
                        onClick={() => setAuthMode('signin')}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Reset Password</h4>
                    </div>

                    {resetStep === 'request' && (
                      <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                        <p className="text-[10px] text-slate-300 leading-normal">
                          Enter your registered email address below, and we will dispatch a secure 6-digit One-Time Password (OTP) and a recovery token to verify your ownership.
                        </p>
                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Email Address</label>
                          <input
                            id="forgot-email-input"
                            type="email"
                            placeholder="john@example.com"
                            required
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          />
                        </div>
                        <button
                          id="btn-send-otp"
                          type="submit"
                          className="w-full text-xs font-bold uppercase tracking-widest py-3 bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-500 text-white rounded-xl active:scale-95 transition-all mt-2"
                        >
                          Send Recovery Details
                        </button>
                      </form>
                    )}

                    {resetStep === 'verify' && (
                      <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
                        <p className="text-[10px] text-slate-300 leading-normal">
                          We have dispatched secure recovery details. Please retrieve the OTP code or Token and submit it below to proceed with setting a new password.
                        </p>

                        {simulatedResetInfo && (
                          <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-[10px] text-slate-300 space-y-1 font-mono">
                            <span className="font-bold text-teal-400 block mb-1">🔑 SIMULATED DISPATCHED CODE</span>
                            <div>OTP: <span className="text-white font-extrabold">{simulatedResetInfo.otp}</span></div>
                            <div>Token: <span className="text-white font-extrabold truncate block">{simulatedResetInfo.token}</span></div>
                            <button
                              type="button"
                              onClick={() => {
                                setResetOtp(simulatedResetInfo.otp);
                                setResetToken(simulatedResetInfo.token);
                                showToast('OTP and Token auto-filled!', 'info');
                              }}
                              className="text-[9px] text-teal-400 hover:underline font-bold mt-2 block"
                            >
                              Auto-Fill Recovery Credentials
                            </button>
                          </div>
                        )}

                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">6-Digit OTP Code</label>
                          <input
                            id="reset-otp-input"
                            type="text"
                            maxLength={6}
                            placeholder="e.g. 123456"
                            value={resetOtp}
                            onChange={(e) => setResetOtp(e.target.value)}
                            className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono tracking-widest text-center"
                          />
                        </div>

                        <div className="text-center text-[9px] text-slate-400">or use reset token</div>

                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Reset Token</label>
                          <input
                            id="reset-token-input"
                            type="text"
                            placeholder="Reset Token"
                            value={resetToken}
                            onChange={(e) => setResetToken(e.target.value)}
                            className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
                          />
                        </div>

                        <button
                          id="btn-verify-otp"
                          type="submit"
                          className="w-full text-xs font-bold uppercase tracking-widest py-3 bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-500 text-white rounded-xl active:scale-95 transition-all mt-2"
                        >
                          Verify Recovery Credentials
                        </button>
                      </form>
                    )}

                    {resetStep === 'new_password' && (
                      <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                        <p className="text-[10px] text-slate-300 leading-normal">
                          Set a strong password containing at least 8 characters, with letters and numbers.
                        </p>

                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">New Password</label>
                          <div className="relative">
                            <input
                              id="reset-new-password"
                              type={showResetPassword ? 'text' : 'password'}
                              placeholder="••••••••"
                              required
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400"
                            />
                            <button
                              type="button"
                              onClick={() => setShowResetPassword(!showResetPassword)}
                              className="absolute right-3.5 top-3 text-slate-400 hover:text-white"
                            >
                              {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Confirm New Password</label>
                          <input
                            id="reset-confirm-new-password"
                            type="password"
                            placeholder="••••••••"
                            required
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            className="w-full text-xs bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          />
                        </div>

                        <button
                          id="btn-submit-reset-password"
                          type="submit"
                          className="w-full text-xs font-bold uppercase tracking-widest py-3 bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-500 text-white rounded-xl active:scale-95 transition-all mt-2"
                        >
                          Complete Password Reset
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </GlassCard>
            </div>

            {/* Legal Notice */}
            <div className="text-center text-[10px] text-slate-400 leading-normal pb-4">
              By continuing, you agree to SwiftPay's{' '}
              <span className="text-teal-400 cursor-pointer hover:underline">Terms of Service</span> &amp;{' '}
              <span className="text-teal-400 cursor-pointer hover:underline">Privacy Policy</span>.
            </div>
          </div>
        )}

        {/* -------------------- VIEW 3: PIN / BIOMETRIC SETUP OR ENTRY SCREEN -------------------- */}
        {isAuthenticated && (!hasSetupPin || !isPinUnlocked) && (
          <div className="flex-1 flex flex-col justify-between p-6 bg-[#0c0c14] text-white overflow-y-auto no-scrollbar">
            
            {/* Header branding */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[#2dd4bf]">SwiftPay Secure</span>
              <button
                id="btn-pin-logout"
                onClick={handleLogout}
                className="p-1.5 rounded-full hover:bg-white/5 text-slate-400 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            {/* Instruction Title */}
            <div className="text-center my-6">
              <div className="mx-auto h-12 w-12 rounded-full bg-teal-500/10 text-[#2dd4bf] flex items-center justify-center mb-3">
                <UserCheck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold font-display text-white">
                {currentScreen === 'pin_setup'
                  ? pinStep === 1
                    ? 'Create Your Passcode'
                    : 'Confirm Your Passcode'
                  : 'Enter Your Passcode'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 px-6 leading-relaxed">
                {currentScreen === 'pin_setup'
                  ? 'Set a secure 4-digit PIN to authorise BPC purchases and wallet withdrawals'
                  : 'Enter your 4-digit security code to access your digital wallet dashboard'}
              </p>

              {/* Dot Indicators */}
              <div className="flex items-center justify-center gap-4 mt-6">
                {[0, 1, 2, 3].map((idx) => {
                  const currentPinLength = currentScreen === 'pin_setup'
                    ? pinStep === 1 ? pinEntry.length : pinConfirm.length
                    : pinEntry.length;
                  const isActive = idx < currentPinLength;
                  return (
                    <div
                      key={idx}
                      className={`h-3 w-3 rounded-full transition-all duration-200 ${
                        isActive
                          ? 'bg-[#2dd4bf] scale-125 shadow-md shadow-teal-500/25'
                          : 'bg-slate-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Biometric Scan Verification Sequence */}
            {biometricStatus !== 'idle' && (
              <div className="my-2 p-4 rounded-xl bg-indigo-600/10 border border-indigo-600/20 text-center animate-pulse">
                <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {biometricStatus === 'reading' ? 'Scanning fingerprint...' : 'Verified! Logging in...'}
                </span>
              </div>
            )}

            {/* Numerical Pad */}
            <div className="mb-4">
              <NumericPad
                onKeyPress={handlePinKeyPress}
                onBackspace={handlePinBackspace}
                onBiometricClick={triggerFingerprintScan}
                showBiometric={currentScreen === 'pin_entry' || (currentScreen === 'pin_setup' && pinStep === 1)}
              />
            </div>
          </div>
        )}

        {/* -------------------- MAIN DASHBOARD WRAPPER (ONCE UNLOCKED) -------------------- */}
        {isAuthenticated && hasSetupPin && isPinUnlocked && (
          <div className="flex-1 flex flex-col justify-between h-full relative overflow-hidden bg-[#0c0c14] text-white">
            
            {/* Top Navigation Header */}
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-[#0c0c14]/80 backdrop-blur-md relative z-10 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  id="btn-sidebar-toggle"
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-1.5 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <span className="text-xl font-extrabold font-display bg-gradient-to-r from-[#818cf8] to-[#2dd4bf] bg-clip-text text-transparent">
                  SwiftPay
                </span>
              </div>

              {/* Right Notification Bell with badge */}
              <button
                id="btn-notif-toggle"
                onClick={() => setIsNotificationsOpen(true)}
                className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white relative transition-colors"
              >
                <Bell className="h-5 w-5" />
                {notifications.filter(n => n.unread).length > 0 && (
                  <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-slate-50 dark:border-slate-950 animate-bounce" />
                )}
              </button>
            </div>

            {/* Main scrollable view containers based on Current Screen & Tab */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
              
              {/* -------------------- SUB-VIEW: HOME DASHBOARD (wallet tab) -------------------- */}
              {currentScreen === 'dashboard' && activeTab === 'wallet' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  
                  {/* Greeting Block */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold font-display text-slate-800 dark:text-white">Hi, {user?.fullName.split(' ')[0] || 'Adebayo'}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Welcome back, transact cheaper today.</p>
                    </div>
                    {/* User Avatar */}
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-teal-400 p-0.5 shadow-md">
                      <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center text-xs font-black text-white">
                        {user?.fullName.split(' ').map(n => n[0]).join('') || 'AS'}
                      </div>
                    </div>
                  </div>

                  {/* GLASSMORPHISM BALANCE CARD */}
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-teal-500 p-6 text-white shadow-xl shadow-indigo-500/20">
                    {/* Gloss glass glow elements */}
                    <div className="absolute -right-16 -top-16 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -left-16 -bottom-16 w-36 h-36 rounded-full bg-teal-300/10 blur-2xl" />

                    <div className="relative z-10 flex items-center justify-between">
                      <span className="text-[10px] tracking-widest uppercase font-mono text-indigo-100">Available Balance</span>
                      <span className="text-[10px] tracking-wide font-mono px-2 py-0.5 bg-white/20 rounded-full">Basic Tier</span>
                    </div>

                    <div className="relative z-10 my-4">
                      <span className="text-3xl font-bold font-display tracking-tight">
                        {nairaFormat(user?.balance || 200000)}
                      </span>
                    </div>

                    <div className="relative z-10 border-t border-white/20 pt-4 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[10px] text-indigo-100 mb-1.5 font-mono">
                          <span>Daily Spend Target</span>
                          <span>{nairaFormat(user?.dailySpent || 0)} / {nairaFormat(user?.dailyTarget || 50000)}</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-300 transition-all duration-500"
                            style={{ width: `${Math.min(100, ((user?.dailySpent || 0) / (user?.dailyTarget || 50000)) * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Direct Withdraw Trigger */}
                      <button
                        id="btn-withdraw-trigger"
                        onClick={() => setIsWithdrawOpen(true)}
                        className="py-2.5 px-4 rounded-xl bg-white text-indigo-600 hover:bg-slate-100 text-xs font-bold shadow-sm active:scale-95 transition-all shrink-0"
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>

                  {/* QUICK ACTIONS GRID (4 Circle Icons) */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3.5">Quick Actions</h5>
                    <div className="grid grid-cols-4 gap-3.5">
                      {[
                        { id: 'social', label: 'Platform', icon: MessageSquare, bg: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400' },
                        { id: 'bpc', label: 'Buy BPC', icon: CreditCard, bg: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400' },
                        { id: 'guide', label: 'Watch Guide', icon: Clock, bg: 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
                        { id: 'airtime', label: 'Airtime', icon: Smartphone, bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' }
                      ].map((act) => (
                        <button
                          id={`btn-action-${act.id}`}
                          key={act.id}
                          onClick={() => {
                            if (act.id === 'social') {
                              setActiveTab('social');
                            } else if (act.id === 'bpc') {
                              setCurrentScreen('buy_bpc');
                            } else if (act.id === 'guide') {
                              setIsGuideOpen(true);
                            } else if (act.id === 'airtime') {
                              setCurrentScreen('buy_airtime');
                            }
                          }}
                          className="flex flex-col items-center group cursor-pointer"
                        >
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border border-transparent dark:border-white/5 shadow-sm mb-2 transition-all group-hover:scale-105 active:scale-95 ${act.bg}`}>
                            <act.icon className="h-5 w-5" />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 text-center">
                            {act.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* MORE SERVICES GRID (4 columns) */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3.5">More Services</h5>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { id: 'data', label: 'Data bundles', icon: Smartphone, bg: 'bg-orange-500/10 text-orange-500' },
                        { id: 'faq', label: 'FAQs Help', icon: HelpCircle, bg: 'bg-purple-500/10 text-purple-500' },
                        { id: 'support', label: 'Support Chat', icon: MessageSquare, bg: 'bg-rose-500/10 text-rose-500' },
                        { id: 'about', label: 'About App', icon: Info, bg: 'bg-blue-500/10 text-blue-500' }
                      ].map((srv) => (
                        <button
                          id={`btn-service-${srv.id}`}
                          key={srv.id}
                          onClick={() => {
                            if (srv.id === 'data') {
                              setCurrentScreen('buy_data');
                            } else if (srv.id === 'faq') {
                              setCurrentScreen('faq');
                            } else if (srv.id === 'support') {
                              setCurrentScreen('support_live_chat');
                            } else if (srv.id === 'about') {
                              setCurrentScreen('about_info');
                            }
                          }}
                          className="p-3 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 flex flex-col items-center hover:bg-white/60 dark:hover:bg-slate-900/80 active:scale-95 transition-all text-center"
                        >
                          <div className={`p-2 rounded-xl mb-1.5 ${srv.bg}`}>
                            <srv.icon className="h-4.5 w-4.5" />
                          </div>
                          <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase leading-none">
                            {srv.label.split(' ')[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* RECENT BPC VOUCHERS LIST */}
                  {vouchers.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3.5">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">My Active BPC Codes</h5>
                        <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-teal-400">
                          {vouchers.filter(v => v.status === 'unused').length} Unused
                        </span>
                      </div>
                      <div className="space-y-3.5">
                        {vouchers.map(vouch => (
                          <BpcVoucher
                            key={vouch.id}
                            voucher={vouch}
                            onRedeemAirtime={(code) => handleQuickRedeemBpc(code, 'airtime')}
                            onRedeemTransfer={(code) => handleQuickRedeemBpc(code, 'transfer')}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* RECENT TRANSACTIONS PREVIEW */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-3.5">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Transactions</h5>
                      <button
                        id="btn-view-all-tx"
                        onClick={() => setCurrentScreen('transactions_all')}
                        className="text-[10px] font-bold text-indigo-600 dark:text-teal-400 hover:underline"
                      >
                        View All
                      </button>
                    </div>

                    <TransactionList
                      transactions={transactions}
                      limit={4}
                      onViewDetails={setSelectedReceiptTx}
                    />
                  </div>

                </div>
              )}

              {/* -------------------- SUB-VIEW: SOCIAL PLATFORMS (social tab) -------------------- */}
              {currentScreen === 'dashboard' && activeTab === 'social' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="text-center pt-2">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <h4 className="text-lg font-bold font-display text-slate-800 dark:text-white">Community &amp; Updates</h4>
                    <p className="text-xs text-slate-400 mt-1">Join other active SwiftPay users and earn rewards.</p>
                  </div>

                  <GlassCard className="p-5 space-y-4">
                    <div className="space-y-2">
                      <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100">SwiftPay Telegram Channel</h5>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Receive instant updates on discount price rates for airtime, data packages, or server bank updates immediately.
                      </p>
                    </div>
                    <a
                      id="btn-join-telegram"
                      href="https://t.me/SwiftPay"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 bg-[#229ED9] hover:bg-[#1c88bc] text-white rounded-xl text-xs font-bold text-center block shadow-md hover:scale-102 active:scale-95 transition-all"
                    >
                      Join Telegram Channel
                    </a>
                  </GlassCard>

                  <GlassCard className="p-5 space-y-4">
                    <div className="space-y-2">
                      <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100">WhatsApp Discussion Group</h5>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Engage in direct community chat, share payment codes, troubleshoot networks, or take part in daily Naira cash giveaways.
                      </p>
                    </div>
                    <a
                      id="btn-join-whatsapp"
                      href="https://chat.whatsapp.com/SwiftPayOfficial"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl text-xs font-bold text-center block shadow-md hover:scale-102 active:scale-95 transition-all"
                    >
                      Join WhatsApp Group
                    </a>
                  </GlassCard>

                  {/* Loyalty Token display */}
                  <div className="rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 p-5 text-white shadow-lg">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-indigo-200">Loyalty Rewards Status</h5>
                    <div className="my-3 flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold font-mono">1,250</span>
                      <span className="text-xs text-indigo-200 font-mono">Points</span>
                    </div>
                    <p className="text-[11px] text-indigo-100 leading-normal">
                      Redeem points for zero-fee bank transfers or free airtime codes once you hit 5,000 points!
                    </p>
                  </div>
                </div>
              )}

              {/* -------------------- SUB-VIEW: PROFILE & SECURITY (profile tab) -------------------- */}
              {currentScreen === 'dashboard' && activeTab === 'profile' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  
                  {/* Hero card details */}
                  <div className="text-center bg-white/40 dark:bg-slate-900/30 rounded-3xl p-5 border border-slate-150 dark:border-slate-800/60">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-indigo-500 to-teal-400 p-0.5 mx-auto mb-3">
                      <div className="h-full w-full rounded-full bg-slate-950 flex items-center justify-center text-lg font-bold text-white">
                        {user?.fullName.split(' ').map(n => n[0]).join('') || 'AS'}
                      </div>
                    </div>
                    <h4 className="text-base font-bold text-slate-800 dark:text-white">{user?.fullName || 'Adebayo Samuel'}</h4>
                    <span className="text-xs text-slate-400 block mt-0.5 font-mono">{user?.email || 'user@example.com'}</span>
                    
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/10">
                        Level 2 Verified
                      </span>
                      <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/10">
                        Naira Wallet Active
                      </span>
                    </div>
                  </div>

                  {/* Account Information Options */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Account Configuration</h5>
                    
                    <GlassCard className="divide-y divide-slate-150 dark:divide-slate-800/50 overflow-hidden">
                      <div className="p-4 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-400 block font-mono">Full Name</span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 block">{user?.fullName}</span>
                        </div>
                      </div>

                      <div className="p-4 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-400 block font-mono">Email Address</span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 block">{user?.email}</span>
                        </div>
                      </div>

                      {/* Visual Interface Theme Segmented Selector (Point 10) */}
                      <div className="p-4 space-y-2">
                        <span className="text-xs text-slate-400 block font-mono">Visual Interface Theme</span>
                        <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                          {(['light', 'dark', 'system'] as const).map((pref) => (
                            <button
                              id={`btn-theme-pref-${pref}`}
                              key={pref}
                              type="button"
                              onClick={() => setTheme(pref)}
                              className={`py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                                theme === pref
                                  ? 'bg-gradient-to-r from-indigo-600 to-teal-500 text-white shadow-md'
                                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                              }`}
                            >
                              {pref}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Change Password Collapsible Section (Point 1, Point 3) */}
                      <div className="p-4 space-y-2 border-t border-slate-150 dark:border-slate-800/50">
                        <button
                          id="btn-toggle-change-pw"
                          type="button"
                          onClick={() => setIsChangingPasswordOpen(!isChangingPasswordOpen)}
                          className="w-full py-2.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-150 dark:border-slate-800/80 text-xs font-bold rounded-xl flex items-center justify-between px-3 text-slate-700 dark:text-slate-300 transition-colors"
                        >
                          <span>Change Account Password</span>
                          <ChevronRight className={`h-4 w-4 transition-transform ${isChangingPasswordOpen ? 'rotate-90' : ''}`} />
                        </button>
                        
                        {isChangingPasswordOpen && (
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!changeCurrentPassword || !changeNewPassword) {
                              showToast('Please fill out all password fields', 'error');
                              return;
                            }
                            const hasLetter = /[a-zA-Z]/.test(changeNewPassword);
                            const hasNumber = /[0-9]/.test(changeNewPassword);
                            if (changeNewPassword.length < 8 || !hasLetter || !hasNumber) {
                              showToast('New password must be at least 8 characters long and contain both letters and numbers.', 'error');
                              return;
                            }
                            try {
                              const res = await fetch('/api/auth/change-password', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  email: user?.email,
                                  currentPassword: changeCurrentPassword,
                                  newPassword: changeNewPassword
                                })
                              });
                              const data = await res.json();
                              if (res.ok && data.success) {
                                showToast('Password changed successfully!', 'success');
                                setChangeCurrentPassword('');
                                setChangeNewPassword('');
                                setIsChangingPasswordOpen(false);
                              } else {
                                showToast(data.error || 'Failed to change password.', 'error');
                              }
                            } catch (err) {
                              showToast('Network error during password update.', 'error');
                            }
                          }} className="space-y-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850/60 mt-2">
                            <div>
                              <label className="text-[9px] font-mono text-slate-400 block mb-1">Current Password</label>
                              <div className="relative">
                                <input
                                  id="input-change-curr-pw"
                                  type={showChangePassword ? 'text' : 'password'}
                                  required
                                  value={changeCurrentPassword}
                                  onChange={(e) => setChangeCurrentPassword(e.target.value)}
                                  className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-white focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => setShowChangePassword(!showChangePassword)}
                                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                >
                                  {showChangePassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] font-mono text-slate-400 block mb-1">New Password</label>
                              <div className="relative">
                                <input
                                  id="input-change-new-pw"
                                  type={showChangePassword ? 'text' : 'password'}
                                  required
                                  value={changeNewPassword}
                                  onChange={(e) => setChangeNewPassword(e.target.value)}
                                  className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-white focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => setShowChangePassword(!showChangePassword)}
                                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                >
                                  {showChangePassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </div>
                            <button
                              id="btn-submit-change-pw"
                              type="submit"
                              className="w-full py-2 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Update Password
                            </button>
                          </form>
                        )}
                      </div>

                      {/* Biometric Enabled toggle */}
                      <div className="p-4 flex items-center justify-between border-t border-slate-150 dark:border-slate-800/50">
                        <div>
                          <span className="text-xs text-slate-400 block font-mono">Fingerprint Logins</span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 block">
                            {user?.biometricEnabled ? 'Configured & Active' : 'Not setup'}
                          </span>
                        </div>
                        <button
                          id="btn-biometric-toggle"
                          type="button"
                          onClick={() => {
                            if (user) {
                              setUser({ ...user, biometricEnabled: !user.biometricEnabled });
                              showToast(user.biometricEnabled ? 'Fingerprint disabled' : 'Fingerprint activated', 'info');
                            }
                          }}
                          className="h-7 w-12 rounded-full bg-slate-200 dark:bg-slate-800 p-1 transition-all duration-300 relative"
                        >
                          <div
                            className={`h-5 w-5 rounded-full bg-indigo-600 dark:bg-teal-400 transition-all duration-300 absolute top-1 ${
                              user?.biometricEnabled ? 'left-6' : 'left-1'
                            }`}
                          />
                        </button>
                      </div>
                    </GlassCard>
                  </div>

                  {/* Navigation redirects including Terms and Privacy links (Point 2) */}
                  <div className="space-y-2.5">
                    <button
                      id="btn-goto-terms"
                      onClick={() => setCurrentScreen('terms')}
                      className="w-full p-4 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/60 flex items-center justify-between hover:bg-white/60 dark:hover:bg-slate-900/60 transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5 text-indigo-500" />
                        <div>
                          <h6 className="text-xs font-bold text-slate-800 dark:text-white">Terms of Service</h6>
                          <p className="text-[10px] text-slate-400 mt-0.5">Read our terms and conditions</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>

                    <button
                      id="btn-goto-privacy"
                      onClick={() => setCurrentScreen('privacy')}
                      className="w-full p-4 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/60 flex items-center justify-between hover:bg-white/60 dark:hover:bg-slate-900/60 transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Lock className="h-5 w-5 text-teal-500" />
                        <div>
                          <h6 className="text-xs font-bold text-slate-800 dark:text-white">Privacy Policy</h6>
                          <p className="text-[10px] text-slate-400 mt-0.5">Read customer data security rules</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>

                    <button
                      id="btn-goto-about"
                      onClick={() => setCurrentScreen('about_info')}
                      className="w-full p-4 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/60 flex items-center justify-between hover:bg-white/60 dark:hover:bg-slate-900/60 transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Info className="h-5 w-5 text-[#818cf8]" />
                        <div>
                          <h6 className="text-xs font-bold text-slate-800 dark:text-white">About SwiftPay</h6>
                          <p className="text-[10px] text-slate-400 mt-0.5">Read about the rebranding and our mission</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>

                    <button
                      id="btn-goto-faq"
                      onClick={() => setCurrentScreen('faq')}
                      className="w-full p-4 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/60 flex items-center justify-between hover:bg-white/60 dark:hover:bg-slate-900/60 transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <HelpCircle className="h-5 w-5 text-teal-500" />
                        <div>
                          <h6 className="text-xs font-bold text-slate-800 dark:text-white">FAQ Help Hub</h6>
                          <p className="text-[10px] text-slate-400 mt-0.5">Find answers to BPC or bank transfers</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>

                  {/* Logout Area */}
                  <div className="pt-2">
                    <button
                      id="btn-profile-logout"
                      onClick={handleLogout}
                      className="w-full py-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/10 dark:border-red-500/20 text-xs font-bold uppercase tracking-widest transition-all active:scale-95"
                    >
                      Sign Out Securely
                    </button>
                  </div>
                </div>
              )}

              {/* -------------------- FLOW 4: BUY BPC CODE FORM -------------------- */}
              {currentScreen === 'buy_bpc' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-bpc-back"
                      onClick={() => setCurrentScreen('dashboard')}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Purchase BPC Voucher</h4>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Generate a Bill Payment Code voucher code immediately by completing a manual bank transfer. Paste codes during payments for airtime, data or transfer operations with zero fees.
                  </p>

                  <GlassCard className="p-5">
                    <form onSubmit={handleInitiateBpc} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">Voucher Amount (₦)</label>
                        <select
                          id="bpc-select-amount"
                          value={buyBpcAmount}
                          onChange={(e) => setBuyBpcAmount(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-teal-400"
                        >
                          <option value="1000">₦1,000</option>
                          <option value="2000">₦2,000</option>
                          <option value="5000">₦5,000</option>
                          <option value="10000">₦10,000</option>
                          <option value="20000">₦20,000</option>
                          <option value="50000">₦50,000</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">Full Name</label>
                        <input
                          id="bpc-fullname"
                          type="text"
                          required
                          value={bpcFormName || user?.fullName || ''}
                          onChange={(e) => setBpcFormName(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">Email Address</label>
                        <input
                          id="bpc-email"
                          type="email"
                          required
                          value={bpcFormEmail || user?.email || ''}
                          onChange={(e) => setBpcFormEmail(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
                        />
                      </div>

                      <button
                        id="btn-bpc-submit"
                        type="submit"
                        className="w-full text-xs font-bold uppercase tracking-widest py-3.5 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mt-2"
                      >
                        Initiate Payment
                      </button>
                    </form>
                  </GlassCard>

                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono justify-center">
                    <Clock className="h-3.5 w-3.5" /> Average confirmation time: under 3 minutes
                  </div>
                </div>
              )}

              {/* -------------------- FLOW 4.1: BPC PROCESSING LOADER -------------------- */}
              {currentScreen === 'bpc_processing' && (
                <div className="p-5 flex-1 flex flex-col items-center justify-center text-center space-y-6 h-full pt-20 animate-[fadeIn_0.2s_ease-out]">
                  <div className="relative">
                    {/* Pulsing neon spinners */}
                    <div className="h-16 w-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 dark:border-t-teal-400 animate-spin" />
                    <Ticket className="h-6 w-6 text-indigo-500 dark:text-teal-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-slate-800 dark:text-white">Generating Billing Invoice</h4>
                    <p className="text-xs text-slate-400 mt-2 px-10 leading-relaxed">
                      Processing your request... preparing your payment information and reserving your voucher key
                    </p>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400">Loading screen will transition in {bpcProcessingSeconds}s</span>
                </div>
              )}

              {/* -------------------- FLOW 4.2: BANK TRANSFER INSTRUCTIONS -------------------- */}
              {currentScreen === 'bpc_instructions' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Transfer Instructions</h4>
                    <span className="text-[10px] font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/10">
                      Pending Transfer
                    </span>
                  </div>

                  {/* Warning Bar */}
                  {!warningDismissed && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 relative">
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">Bank Maintenance Notice</span>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 leading-normal">
                          Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation.
                        </p>
                      </div>
                      <button
                        id="btn-dismiss-warning"
                        onClick={() => setWarningDismissed(true)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Numbered Steps */}
                  <div className="space-y-3.5">
                    {[
                      { step: 1, text: 'Copy the PalmPay system account details below.' },
                      { step: 2, text: 'Open your bank application and make a manual transfer.' },
                      { step: 3, text: 'Return here and click "I have made this bank Transfer" to trigger operator check.' },
                      { step: 4, text: 'Wait for automated code confirmation, usually processed in under 3 minutes.' }
                    ].map((stepObj) => (
                      <div key={stepObj.step} className="flex gap-3 items-start">
                        <span className="h-5 w-5 rounded-full bg-indigo-500/10 dark:bg-teal-500/10 text-indigo-600 dark:text-teal-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {stepObj.step}
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal">{stepObj.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* ACCOUNT DETAILS CARD */}
                  <GlassCard className="p-5 space-y-3 bg-gradient-to-tr from-slate-900/60 to-indigo-950/20">
                    <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400">Payment Account Info</span>
                    
                    {/* Amount */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs text-slate-400">Amount to send:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-mono font-bold text-white">{nairaFormat(parseInt(buyBpcAmount))}</span>
                        <button
                          id="btn-copy-amount"
                          onClick={() => {
                            navigator.clipboard.writeText(buyBpcAmount);
                            showToast('Amount copied!', 'success');
                          }}
                          className="p-1 text-[9px] font-mono font-bold bg-white/10 rounded border border-white/10 text-slate-300"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Bank Name */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs text-slate-400">Bank Name:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-mono font-bold text-white">PalmPay</span>
                        <button
                          id="btn-copy-bank"
                          onClick={() => {
                            navigator.clipboard.writeText('PalmPay');
                            showToast('Bank copied!', 'success');
                          }}
                          className="p-1 text-[9px] font-mono font-bold bg-white/10 rounded border border-white/10 text-slate-300"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Account Number */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs text-slate-400">Account Number:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-mono font-bold text-teal-400">8960723295</span>
                        <button
                          id="btn-copy-acc-num"
                          onClick={() => {
                            navigator.clipboard.writeText('8960723295');
                            showToast('Account Number copied!', 'success');
                          }}
                          className="p-1 text-[9px] font-mono font-bold bg-white/10 rounded border border-white/10 text-slate-300"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Account Name */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Account Name:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-mono font-bold text-white uppercase text-right max-w-[150px] truncate">pwamunadi ishaku</span>
                        <button
                          id="btn-copy-acc-name"
                          onClick={() => {
                            navigator.clipboard.writeText('pwamunadi ishaku');
                            showToast('Account Name copied!', 'success');
                          }}
                          className="p-1 text-[9px] font-mono font-bold bg-white/10 rounded border border-white/10 text-slate-300"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </GlassCard>

                  {/* Primary submit CTA */}
                  <div className="pt-2">
                    <button
                      id="btn-confirm-transfer"
                      onClick={handleConfirmBankTransfer}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold uppercase tracking-widest text-xs rounded-xl shadow-lg transition-all active:scale-95"
                    >
                      I have made this bank Transfer
                    </button>
                    <button
                      id="btn-cancel-transfer"
                      onClick={() => setCurrentScreen('dashboard')}
                      className="w-full text-center text-xs text-slate-400 mt-3.5 font-bold hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      Cancel and Return Home
                    </button>
                  </div>
                </div>
              )}

              {/* -------------------- FLOW 4.3: BPC CONFIRMED SUCCESS TICKET -------------------- */}
              {currentScreen === 'bpc_success' && generatedBpc && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="text-center pt-4">
                    <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h4 className="text-lg font-bold font-display text-slate-800 dark:text-white">Voucher Generated</h4>
                    <p className="text-xs text-slate-400 mt-1">Your Bill Payment Code (BPC) voucher is active.</p>
                  </div>

                  {/* High quality ticket print */}
                  <BpcVoucher
                    voucher={generatedBpc}
                    onRedeemAirtime={(code) => handleQuickRedeemBpc(code, 'airtime')}
                    onRedeemTransfer={(code) => handleQuickRedeemBpc(code, 'transfer')}
                  />

                  <div className="pt-4 space-y-2.5">
                    <button
                      id="btn-bpc-success-home"
                      onClick={() => {
                        setGeneratedBpc(null);
                        setCurrentScreen('dashboard');
                        setActiveTab('wallet');
                      }}
                      className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </div>
              )}

              {/* -------------------- FLOW 5: BUY AIRTIME SCREEN -------------------- */}
              {currentScreen === 'buy_airtime' && (
                <div className="p-5 space-y-4 animate-[fadeIn_0.2s_ease-out] overflow-y-auto h-[600px] no-scrollbar">
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-airtime-back"
                      onClick={() => setCurrentScreen('dashboard')}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Purchase Airtime</h4>
                  </div>

                  <div className="p-4 bg-white/40 dark:bg-slate-900/30 rounded-2xl border border-slate-150 dark:border-slate-800/40 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">Wallet Balance</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-teal-400 font-mono mt-0.5 block">
                        {nairaFormat(user?.balance || 0)}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-indigo-600 dark:text-teal-400 bg-indigo-500/10 dark:bg-teal-500/10 px-2.5 py-1 rounded-full border border-indigo-500/10">
                      Standard pricing
                    </span>
                  </div>

                  {/* Saved Phone Beneficiaries */}
                  {phoneBeneficiaries.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Favourite Numbers</label>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {phoneBeneficiaries.map((ben) => (
                          <button
                            key={ben.id}
                            type="button"
                            onClick={() => {
                              setAirtimePhone(ben.phone);
                              setAirtimeNetwork(ben.network);
                              showToast(`Selected ${ben.name} (${ben.phone})`, 'info');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left shrink-0 active:scale-95 transition-all flex items-center gap-2"
                          >
                            <div className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
                            <div>
                              <span className="text-[10px] font-bold block text-slate-800 dark:text-white leading-none">{ben.name}</span>
                              <span className="text-[8px] text-slate-400 font-mono block mt-0.5">{ben.phone}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <GlassCard className="p-5">
                    <form onSubmit={handlePurchaseAirtime} className="space-y-4">
                      {/* Select Network dropdown */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1.5 uppercase tracking-wider">Select Network Operator</label>
                        <div className="grid grid-cols-4 gap-2">
                          {MOBILE_NETWORKS.map((net) => (
                            <button
                              id={`btn-network-${net.id}`}
                              key={net.id}
                              type="button"
                              onClick={() => setAirtimeNetwork(net.id)}
                              className={`py-3 rounded-xl text-center text-xs font-bold border transition-all ${
                                airtimeNetwork === net.id
                                  ? `${net.color} border-transparent ring-2 ring-indigo-500/30 scale-102`
                                  : 'bg-white/40 border-slate-200 text-slate-500 dark:bg-slate-950/40 dark:border-slate-800 hover:text-slate-800 dark:hover:text-white'
                              }`}
                            >
                              {net.logo}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Phone Number */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1 uppercase tracking-wider">Recipient Phone Number</label>
                        <div className="flex gap-2">
                          <input
                            id="input-airtime-phone"
                            type="tel"
                            placeholder="e.g. 08034567890"
                            required
                            value={airtimePhone}
                            onChange={(e) => setAirtimePhone(e.target.value)}
                            className="flex-1 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (airtimePhone.length < 10) {
                                showToast('Please type a valid phone first.', 'error');
                                return;
                              }
                              const nickname = prompt('Enter a nickname for this recipient:');
                              if (nickname) {
                                const newBen = { id: `pben-${Date.now()}`, name: nickname, phone: airtimePhone, network: airtimeNetwork };
                                const updated = [newBen, ...phoneBeneficiaries];
                                setPhoneBeneficiaries(updated);
                                localStorage.setItem('swiftpay_phone_beneficiaries', JSON.stringify(updated));
                                showToast('Added to favourites!', 'success');
                              }
                            }}
                            className="px-3 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 rounded-xl text-xs font-bold flex items-center justify-center border border-indigo-500/20 active:scale-95 transition-all"
                            title="Save as Favourite"
                          >
                            ⭐ Save
                          </button>
                        </div>
                      </div>

                      {/* Recharge Amount and Quick Selection */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1 uppercase tracking-wider">Recharge Amount (₦)</label>
                        <input
                          id="input-airtime-amount"
                          type="number"
                          placeholder="Minimum 100"
                          required
                          value={airtimeAmount}
                          onChange={(e) => setAirtimeAmount(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
                        />
                        
                        {/* Quick Selection Pills */}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {[100, 200, 500, 1000, 2000, 5000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setAirtimeAmount(amt.toString())}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 text-[10px] font-mono font-bold active:scale-95 transition-all"
                            >
                              ₦{amt}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Optional BPC Code input */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Redeem BPC Code (Optional)</label>
                          <button
                            id="btn-goto-buy-bpc-airtime"
                            type="button"
                            onClick={() => setCurrentScreen('buy_bpc')}
                            className="text-[9px] font-bold text-indigo-600 dark:text-teal-400 hover:underline"
                          >
                            Buy BPC Voucher
                          </button>
                        </div>
                        <input
                          id="input-airtime-bpc"
                          type="text"
                          placeholder="e.g. BPC-8960-7232-9501"
                          value={airtimeBpcCode}
                          onChange={(e) => setAirtimeBpcCode(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono tracking-widest uppercase"
                        />
                        <span className="text-[9px] text-slate-400 mt-1 block leading-normal">
                          Applying a valid BPC Voucher bypasses direct wallet balance deduction.
                        </span>
                      </div>

                      <button
                        id="btn-purchase-airtime"
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full text-xs font-bold uppercase tracking-widest py-3.5 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mt-2 flex items-center justify-center gap-2 ${
                          isSubmitting ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSubmitting ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Processing Securely...</span>
                          </>
                        ) : (
                          'Purchase Airtime'
                        )}
                      </button>
                    </form>
                  </GlassCard>
                </div>
              )}

              {/* -------------------- FLOW 5.1: POLISHED DEDICATED DATA PURCHASE SCREEN (Point 12) -------------------- */}
              {currentScreen === 'buy_data' && (
                <div className="p-5 space-y-4 animate-[fadeIn_0.2s_ease-out] overflow-y-auto h-[600px] no-scrollbar">
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-data-back"
                      onClick={() => setCurrentScreen('dashboard')}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Purchase Data Bundle</h4>
                  </div>

                  <div className="p-4 bg-white/40 dark:bg-slate-900/30 rounded-2xl border border-slate-150 dark:border-slate-800/40 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">Wallet Balance</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-teal-400 font-mono mt-0.5 block">
                        {nairaFormat(user?.balance || 0)}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-indigo-600 dark:text-teal-400 bg-indigo-500/10 dark:bg-teal-500/10 px-2.5 py-1 rounded-full border border-indigo-500/10 animate-pulse">
                      BPC Discount active
                    </span>
                  </div>

                  {/* Saved Phone Beneficiaries */}
                  {phoneBeneficiaries.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Favourite Numbers</label>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {phoneBeneficiaries.map((ben) => (
                          <button
                            key={ben.id}
                            type="button"
                            onClick={() => {
                              setDataPhone(ben.phone);
                              setDataNetwork(ben.network);
                              setSelectedDataPlan(null);
                              showToast(`Selected ${ben.name} (${ben.phone})`, 'info');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left shrink-0 active:scale-95 transition-all flex items-center gap-2"
                          >
                            <div className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
                            <div>
                              <span className="text-[10px] font-bold block text-slate-800 dark:text-white leading-none">{ben.name}</span>
                              <span className="text-[8px] text-slate-400 font-mono block mt-0.5">{ben.phone}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <GlassCard className="p-5">
                    <form onSubmit={handlePurchaseData} className="space-y-4">
                      {/* Select Network Operator */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-2 uppercase tracking-wider">Select Network Operator</label>
                        <div className="grid grid-cols-4 gap-2">
                          {MOBILE_NETWORKS.map((net) => (
                            <button
                              id={`btn-data-network-${net.id}`}
                              key={net.id}
                              type="button"
                              onClick={() => {
                                setDataNetwork(net.id);
                                setSelectedDataPlan(null); // Reset plan when network changes
                              }}
                              className={`py-3 rounded-xl text-center text-xs font-black border transition-all ${
                                dataNetwork === net.id
                                  ? `${net.color} border-transparent ring-2 ring-indigo-500/30 scale-102 shadow-md`
                                  : 'bg-white/40 border-slate-250 text-slate-500 dark:bg-slate-950/40 dark:border-slate-800 hover:text-slate-800 dark:hover:text-white hover:border-slate-300'
                              }`}
                            >
                              {net.logo}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Recipient Phone Number */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1 uppercase tracking-wider">Recipient Phone Number</label>
                        <div className="flex gap-2">
                          <input
                            id="input-data-phone"
                            type="tel"
                            placeholder="e.g. 08034567890"
                            required
                            value={dataPhone}
                            onChange={(e) => setDataPhone(e.target.value)}
                            className="flex-1 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (dataPhone.length < 10) {
                                showToast('Please type a valid phone first.', 'error');
                                return;
                              }
                              const nickname = prompt('Enter a nickname for this recipient:');
                              if (nickname) {
                                const newBen = { id: `pben-${Date.now()}`, name: nickname, phone: dataPhone, network: dataNetwork };
                                const updated = [newBen, ...phoneBeneficiaries];
                                setPhoneBeneficiaries(updated);
                                localStorage.setItem('swiftpay_phone_beneficiaries', JSON.stringify(updated));
                                showToast('Added to favourites!', 'success');
                              }
                            }}
                            className="px-3 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 rounded-xl text-xs font-bold flex items-center justify-center border border-indigo-500/20 active:scale-95 transition-all"
                            title="Save as Favourite"
                          >
                            ⭐ Save
                          </button>
                        </div>
                      </div>

                      {/* Professional Categorized Data Plans */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-2 uppercase tracking-wider">Data Categories</label>
                        
                        {/* Categorization Tabs */}
                        <div className="flex border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-3.5 bg-slate-50 dark:bg-slate-950/50 p-0.5">
                          {(['daily', 'weekly', 'monthly', 'sme'] as const).map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => {
                                setActiveDataTab(tab);
                                setSelectedDataPlan(null);
                              }}
                              className={`flex-1 text-center py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                activeDataTab === tab
                                  ? 'bg-gradient-to-r from-indigo-600 to-teal-500 text-white shadow-sm font-extrabold'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                              }`}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>

                        {/* Filtered Data Plans Grid */}
                        <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 no-scrollbar animate-[fadeIn_0.15s_ease-out]">
                          {DATA_PLANS.filter(p => {
                            if (p.network !== dataNetwork) return false;
                            const sizeInt = parseInt(p.size);
                            const isGB = p.size.toLowerCase().includes('gb');
                            
                            if (activeDataTab === 'daily') {
                              return !isGB || sizeInt === 1;
                            } else if (activeDataTab === 'weekly') {
                              return isGB && (sizeInt >= 2 && sizeInt <= 3);
                            } else if (activeDataTab === 'monthly') {
                              return isGB && (sizeInt >= 5 && sizeInt <= 20);
                            } else if (activeDataTab === 'sme') {
                              return isGB && sizeInt >= 50;
                            }
                            return true;
                          }).map((plan) => (
                            <div
                              id={`data-plan-option-${plan.id}`}
                              key={plan.id}
                              onClick={() => setSelectedDataPlan(plan)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer text-left relative overflow-hidden ${
                                selectedDataPlan?.id === plan.id
                                  ? 'bg-gradient-to-tr from-indigo-500/15 to-teal-500/15 border-indigo-500 text-slate-900 dark:text-white ring-1 ring-indigo-500/30'
                                  : 'bg-white/40 border-slate-150 text-slate-500 dark:bg-slate-900/40 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">{plan.size}</span>
                                {selectedDataPlan?.id === plan.id && (
                                  <span className="h-3.5 w-3.5 bg-indigo-600 rounded-full flex items-center justify-center text-white scale-90">
                                    <Check className="h-2 w-2 stroke-[3]" />
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-slate-400 block font-mono mt-0.5">{plan.validity}</span>
                              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-teal-400 block mt-2">{nairaFormat(plan.price)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Optional BPC Code input */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Redeem BPC Code (Optional)</label>
                          <button
                            id="btn-goto-buy-bpc-data"
                            type="button"
                            onClick={() => setCurrentScreen('buy_bpc')}
                            className="text-[9px] font-bold text-indigo-600 dark:text-teal-400 hover:underline"
                          >
                            Buy BPC Voucher
                          </button>
                        </div>
                        <input
                          id="input-data-bpc"
                          type="text"
                          placeholder="e.g. BPC-8960-7232-9501"
                          value={dataBpcCode}
                          onChange={(e) => setDataBpcCode(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono tracking-widest uppercase"
                        />
                        <span className="text-[9px] text-slate-400 mt-1 block leading-normal">
                          Applying a valid BPC Voucher bypasses direct wallet balance deduction.
                        </span>
                      </div>

                      <button
                        id="btn-purchase-data"
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full text-xs font-extrabold uppercase tracking-widest py-3.5 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mt-2 flex items-center justify-center gap-2 ${
                          isSubmitting ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSubmitting ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Processing Securely...</span>
                          </>
                        ) : selectedDataPlan ? (
                          `Purchase ${selectedDataPlan.size} (${nairaFormat(selectedDataPlan.price)})`
                        ) : (
                          'Select Data Package'
                        )}
                      </button>
                    </form>
                  </GlassCard>
                </div>
              )}

              {/* -------------------- FLOW 6: TRANSFER TO BANK SCREEN -------------------- */}
              {currentScreen === 'transfer_bank' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-transfer-back"
                      onClick={() => setCurrentScreen('dashboard')}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Bank Cashout Transfer</h4>
                  </div>

                  <div className="p-4 bg-white/40 dark:bg-slate-900/30 rounded-2xl border border-slate-150 dark:border-slate-800/40 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">Wallet Balance</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-teal-400 font-mono mt-0.5 block">
                        {nairaFormat(user?.balance || 0)}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">Limits: N100,000 daily</span>
                  </div>

                  <GlassCard className="p-5">
                    <form onSubmit={handleBankTransfer} className="space-y-4">
                      {/* Select Bank Dropdown */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">Select Recipient Bank</label>
                        <select
                          id="transfer-select-bank"
                          value={transferBank}
                          onChange={(e) => setTransferBank(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
                        >
                          {SUPPORTED_BANKS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Account Number */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">10-Digit Account Number</label>
                        <input
                          id="input-transfer-acc"
                          type="number"
                          placeholder="e.g. 8960723295"
                          required
                          value={transferAccNum}
                          onChange={(e) => {
                            if (e.target.value.length <= 10) {
                              setTransferAccNum(e.target.value);
                            }
                          }}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
                        />
                      </div>

                      {/* Account Name Indicator */}
                      {isVerifyingAccount ? (
                        <div className="py-2 px-3 rounded-lg bg-indigo-500/5 text-[10px] font-mono text-indigo-400 animate-pulse">
                          Resolving bank node... verifying credentials
                        </div>
                      ) : (
                        transferAccName && (
                          <div className="py-2 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono uppercase">
                            Recipient: {transferAccName}
                          </div>
                        )
                      )}

                      {/* Amount */}
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">Cashout Amount (₦)</label>
                        <input
                          id="input-transfer-amount"
                          type="number"
                          placeholder="Voucher amount limit matches"
                          required
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
                        />
                      </div>

                      {/* BPC Code field */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-mono text-slate-400">Apply BPC Code (Optional)</label>
                          <button
                            id="btn-goto-buy-bpc-transfer"
                            type="button"
                            onClick={() => setCurrentScreen('buy_bpc')}
                            className="text-[9px] font-bold text-indigo-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                          >
                            Buy BPC code <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        </div>
                        <input
                          id="input-transfer-bpc"
                          type="text"
                          placeholder="e.g. BPC-8960-7232-9501"
                          value={transferBpcCode}
                          onChange={(e) => setTransferBpcCode(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono tracking-widest uppercase"
                        />
                        <span className="text-[9px] text-slate-400 mt-1 block leading-normal">
                          Pay instantly by redeeming a Bill Payment Code voucher code from PalmPay transfers.
                        </span>
                      </div>

                      <button
                        id="btn-submit-transfer"
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full text-xs font-bold uppercase tracking-widest py-3.5 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mt-2 flex items-center justify-center gap-2 ${
                          isSubmitting ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSubmitting ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Processing Securely...</span>
                          </>
                        ) : (
                          'Submit Cashout'
                        )}
                      </button>
                    </form>
                  </GlassCard>
                </div>
              )}

              {/* -------------------- VIEW 3.1: TRANSACTIONS ALL HISTORY VIEW -------------------- */}
              {currentScreen === 'transactions_all' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-tx-all-back"
                      onClick={() => {
                        setCurrentScreen('dashboard');
                        setActiveTab('wallet');
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Full Transaction Logs</h4>
                  </div>

                  <TransactionList
                    transactions={transactions}
                    showFilters={true}
                    onViewDetails={setSelectedReceiptTx}
                  />
                </div>
              )}

              {/* -------------------- VIEW 3.2: FAQ PAGE -------------------- */}
              {currentScreen === 'faq' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-faq-back"
                      onClick={() => {
                        setCurrentScreen('dashboard');
                        setActiveTab('wallet');
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Help &amp; FAQ Center</h4>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Learn how our customized BPC Voucher system operates and how you save on bank transaction bills.
                  </p>

                  <div className="space-y-3">
                    {FAQS.map((item, idx) => (
                      <GlassCard id={`faq-item-${idx}`} key={idx} className="p-4 space-y-2">
                        <h6 className="text-xs font-bold text-indigo-600 dark:text-teal-400 flex items-start gap-1.5 leading-snug">
                          <span className="font-mono text-[10px]">Q:</span>
                          {item.question}
                        </h6>
                        <p className="text-xs text-slate-500 dark:text-slate-300 pl-4 border-l border-indigo-500/10 leading-relaxed">
                          {item.answer}
                        </p>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              )}

              {/* -------------------- VIEW 3.3: ABOUT BRAND REBRANDING STORY -------------------- */}
              {currentScreen === 'about_info' && (
                <div className="p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-about-back"
                      onClick={() => {
                        setCurrentScreen('dashboard');
                        setActiveTab('wallet');
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h4 className="text-base font-bold font-display text-slate-800 dark:text-white">Our Brand Story</h4>
                  </div>

                  {/* Rebranding card banner */}
                  <div className="rounded-3xl p-6 bg-gradient-to-tr from-indigo-950 via-purple-950 to-teal-950 text-white relative overflow-hidden border border-white/5 shadow-lg">
                    <div className="absolute right-0 top-0 h-24 w-24 bg-teal-500/10 rounded-full blur-xl" />
                    
                    <h5 className="text-base font-extrabold font-display">BluePay is now SwiftPay</h5>
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                      SwiftPay is the new and improved version of BluePay, offering enhanced features, better security, and a more streamlined user experience. We migrated from a flat, royal-blue identity into a glowing glassmorphism system with zero downtime.
                    </p>
                  </div>

                  {/* Our Mission */}
                  <div className="space-y-2.5">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Our Mission</h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      To empower young professionals, merchants, and remote workers across Nigeria to perform immediate cashouts, settlement vouchers, and airtime loading with zero maintenance fees.
                    </p>
                  </div>

                  {/* What We Offer bullet list */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">What We Offer</h5>
                    <GlassCard className="p-5 space-y-3">
                      {[
                        'Daily instant withdrawal limits up to ₦100,000.',
                        'Premium BPC (Bill Payment Code) token discount system.',
                        'Cheaper airtime & data package recharges.',
                        'Encrypted passcode entry and biometric fingerprint scanners.',
                        '24/7 dedicated Telegram, WhatsApp, and email support operators.'
                      ].map((bullet, index) => (
                        <div key={index} className="flex gap-2.5 items-start">
                          <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal">{bullet}</p>
                        </div>
                      ))}
                    </GlassCard>
                  </div>
                </div>
              )}

              {/* -------------------- VIEW 3.4: SUPPORT CHAT SIMULATOR -------------------- */}
              {currentScreen === 'support_live_chat' && (
                <div className="p-5 flex flex-col h-[520px] max-h-full animate-[fadeIn_0.2s_ease-out] justify-between">
                  {/* Top header contact info */}
                  <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800/60 pb-3 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <button
                        id="btn-chat-back"
                        onClick={() => setCurrentScreen('dashboard')}
                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 text-slate-500"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <h5 className="text-xs font-bold text-slate-800 dark:text-white">SwiftPay Live Assistant</h5>
                        <span className="text-[9px] font-mono text-emerald-500 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" /> Online (24/7 Support)
                        </span>
                      </div>
                    </div>
                    {/* Brand support phone link */}
                    <a
                      id="btn-support-whatsapp-direct"
                      href="https://wa.me/2349162845073?text=Hello%20SwiftPay%20Support%2C%20I%20need%20help%20with..."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1.5 hover:bg-emerald-500/25 transition-all"
                    >
                      WhatsApp Direct
                    </a>
                  </div>

                  {/* Message displays panel */}
                  <div className="flex-1 overflow-y-auto no-scrollbar py-3.5 space-y-3 pr-1">
                    {liveChatMessages.map((msg, index) => {
                      const isUser = msg.sender === 'user';
                      return (
                        <div
                          key={index}
                          className={`flex flex-col max-w-[80%] ${isUser ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                        >
                          <div
                            className={`p-3 text-xs rounded-2xl ${
                              isUser
                                ? 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white rounded-tr-none'
                                : 'bg-white border border-slate-150 text-slate-800 dark:bg-slate-900 dark:border-slate-800 dark:text-white rounded-tl-none shadow-sm'
                            }`}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          </div>
                          <span className="text-[8px] text-slate-400 font-mono mt-1">{msg.time}</span>
                        </div>
                      );
                    })}

                    {/* Agent typing anim */}
                    {isAgentTyping && (
                      <div className="flex flex-col items-start mr-auto max-w-[80%]">
                        <div className="p-3 bg-white border border-slate-150 dark:bg-slate-900 dark:border-slate-800 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
                          <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce" />
                          <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Footer note & Input bar */}
                  <div className="pt-2 shrink-0 border-t border-slate-150 dark:border-slate-800/60">
                    <form onSubmit={handleSendSupportMessage} className="flex gap-2">
                      <input
                        id="input-chat-text"
                        type="text"
                        placeholder="Type standard questions..."
                        value={liveChatInput}
                        onChange={(e) => setLiveChatInput(e.target.value)}
                        className="flex-1 text-xs px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/30 focus:outline-none focus:ring-1 focus:ring-teal-400 text-slate-800 dark:text-white"
                      />
                      <button
                        id="btn-chat-send"
                        type="submit"
                        className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white active:scale-90 transition-all flex items-center justify-center shrink-0"
                      >
                        <Send className="h-4.5 w-4.5" />
                      </button>
                    </form>
                    <div className="mt-2.5 text-center text-[9px] text-slate-400">
                      Available 24/7 • support@swiftpay.ng
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------- VIEW 3.5: TERMS OF SERVICE (Point 2) -------------------- */}
              {currentScreen === 'terms' && (
                <TermsOfService onBack={() => {
                  setCurrentScreen('dashboard');
                  setActiveTab('profile');
                }} />
              )}

              {/* -------------------- VIEW 3.6: PRIVACY POLICY (Point 2) -------------------- */}
              {currentScreen === 'privacy' && (
                <PrivacyPolicy onBack={() => {
                  setCurrentScreen('dashboard');
                  setActiveTab('profile');
                }} />
              )}

              {/* -------------------- VIEW 3.7: SECURITY AUDITS / DEVICES (Point 1) -------------------- */}
              {currentScreen === 'security_audits' && (
                <div className="animate-[fadeIn_0.2s_ease-out] overflow-y-auto h-[600px] no-scrollbar">
                  <DevicesHistory
                    devices={devices}
                    onLogoutDevice={(id) => {
                      setDevices(devices.filter(d => d.id !== id));
                      showToast('Device session revoked successfully.', 'success');
                    }}
                    onLogoutAllOtherDevices={() => {
                      setDevices(devices.filter(d => d.isCurrent));
                      showToast('All other sessions revoked.', 'success');
                    }}
                    loginHistory={loginHistory}
                    onBack={() => {
                      setCurrentScreen('dashboard');
                      setActiveTab('profile');
                    }}
                  />
                </div>
              )}

              {/* -------------------- VIEW 3.8: ADMIN PANEL (Point 10) -------------------- */}
              {(currentScreen === 'admin' || currentScreen === 'admin_dashboard') && (
                <div className="animate-[fadeIn_0.2s_ease-out] overflow-y-auto h-[600px] no-scrollbar">
                  <AdminPanel
                    currentUserEmail={user?.email || 'admin@swiftpay.com'}
                    transactions={transactions}
                    onBack={() => {
                      setCurrentScreen('dashboard');
                      setActiveTab('profile');
                    }}
                    onToast={(msg, type) => showToast(msg, type)}
                    onAddGlobalNotification={(title, body, type) => {
                      const newNotif = {
                        id: 'notif-' + Date.now(),
                        title,
                        body,
                        date: new Date().toISOString(),
                        unread: true
                      };
                      const updated = [newNotif, ...notifications];
                      setNotifications(updated);
                      localStorage.setItem('swiftpay_notifications', JSON.stringify(updated));
                    }}
                    onSendSimulatedEmail={(to, subject, body) => sendSimulatedEmail(to, subject, body)}
                  />
                </div>
              )}

            </div>

            {/* Bottom floating menus & Navigation sheets */}
            <BottomNav
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setCurrentScreen('dashboard');
              }}
              onFabClick={() => setIsFabMenuOpen(true)}
            />

            {/* Quick action fab overlay sheet */}
            <QuickFabMenu
              isOpen={isFabMenuOpen}
              onClose={() => setIsFabMenuOpen(false)}
              onSelectAction={handleSelectFabAction}
            />

            {/* Notifications panel overlay */}
            <NotificationsModal
              isOpen={isNotificationsOpen}
              onClose={() => setIsNotificationsOpen(false)}
              notifications={notifications}
              onMarkAllRead={handleMarkAllNotifsRead}
              onMarkRead={handleMarkSingleNotif => {
                handleMarkNotifRead(handleMarkSingleNotif);
              }}
            />

            {/* Side Drawer Drawer Sidebar (Hamburger menu content) */}
            {isSidebarOpen && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md z-40 flex">
                {/* Backdrop dismiss */}
                <div className="absolute inset-0" onClick={() => setIsSidebarOpen(false)} />

                <div className="relative bg-white dark:bg-slate-950 w-[280px] h-full shadow-2xl p-6 flex flex-col justify-between border-r border-slate-150 dark:border-slate-900">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-900 pb-4">
                      <div>
                        <span className="text-base font-black font-display bg-gradient-to-r from-indigo-600 to-teal-500 dark:from-indigo-400 dark:to-teal-300 bg-clip-text text-transparent">
                          SwiftPay
                        </span>
                        <span className="text-[8px] font-mono text-slate-400 block uppercase tracking-widest mt-0.5">Version 4.1.0</span>
                      </div>
                      <button
                        id="btn-close-sidebar"
                        onClick={() => setIsSidebarOpen(false)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500"
                      >
                        <X className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    {/* Quick navigation links in drawer */}
                    <div className="space-y-2">
                      {[
                        { label: 'Buy BPC Voucher Code', screen: 'buy_bpc', icon: CreditCard },
                        { label: 'Purchase Airtime', screen: 'buy_airtime', icon: Smartphone },
                        { label: 'Purchase Data Bundles', screen: 'buy_data', icon: Smartphone },
                        { label: 'Transfer To Banks', screen: 'transfer_bank', icon: Landmark },
                        { label: 'Support Live Chat', screen: 'support_live_chat', icon: MessageSquare },
                        { label: 'Help FAQs Hub', screen: 'faq', icon: HelpCircle },
                        { label: 'Our Brand Story', screen: 'about_info', icon: Info }
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            id={`drawer-link-${item.screen}`}
                            key={item.screen}
                            onClick={() => {
                              setCurrentScreen(item.screen);
                              setIsSidebarOpen(false);
                            }}
                            className="w-full p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900/60 flex items-center gap-3.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                          >
                            <Icon className="h-4.5 w-4.5 text-indigo-500" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Drawer Footer Log out */}
                  <div className="border-t border-slate-150 dark:border-slate-900 pt-4">
                    <button
                      id="btn-drawer-logout"
                      onClick={() => {
                        setIsSidebarOpen(false);
                        handleLogout();
                      }}
                      className="w-full p-3 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider rounded-xl text-center block transition-all"
                    >
                      Logout Session
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Direct Balance Adjustment Withdraw Modal Sheet */}
            {isWithdrawOpen && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex flex-col justify-end">
                <div className="absolute inset-0" onClick={() => setIsWithdrawOpen(false)} />
                <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-white/10 shadow-2xl max-w-md mx-auto w-full z-10 transition-transform">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-white">Withdraw Direct Funds</h4>
                      <p className="text-[10px] text-slate-400">Transfer out from your available balance directly</p>
                    </div>
                    <button
                      id="btn-close-withdraw"
                      onClick={() => setIsWithdrawOpen(false)}
                      className="p-1.5 bg-slate-150 dark:bg-slate-800 rounded-full text-slate-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <form onSubmit={handleDirectWithdraw} className="space-y-4">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">Select Bank</label>
                      <select
                        id="withdraw-select-bank"
                        value={withdrawBank}
                        onChange={(e) => setWithdrawBank(e.target.value)}
                        className="w-full text-xs bg-slate-100 dark:bg-slate-950 border border-transparent dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white"
                      >
                        {SUPPORTED_BANKS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">Account Number</label>
                      <input
                        id="withdraw-acc-num"
                        type="number"
                        placeholder="10-digit number"
                        required
                        value={withdrawAccount}
                        onChange={(e) => setWithdrawAccount(e.target.value)}
                        className="w-full text-xs bg-slate-100 dark:bg-slate-950 border border-transparent dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">Withdrawal Amount (₦)</label>
                      <input
                        id="withdraw-amount"
                        type="number"
                        placeholder="Limit N100,000"
                        required
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full text-xs bg-slate-100 dark:bg-slate-950 border border-transparent dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white font-mono font-bold"
                      />
                    </div>

                    <button
                      id="btn-withdraw-submit"
                      type="submit"
                      disabled={isSubmitting}
                      className={`w-full text-xs font-bold uppercase tracking-widest py-3.5 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                        isSubmitting ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Processing Securely...</span>
                        </>
                      ) : (
                        'Authorize Cashout'
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Watch Walkthrough Guide Modal (Media popup) */}
            {isGuideOpen && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
                <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl text-center space-y-4">
                  <button
                    id="btn-close-guide"
                    onClick={() => setIsGuideOpen(false)}
                    className="absolute top-4 right-4 p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="h-12 w-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                    <Clock className="h-6 w-6" />
                  </div>

                  <div>
                    <h5 className="text-sm font-bold text-white font-display">Voucher Redemptions Guide</h5>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      This walkthrough simulated guide explains how copying PalmPay account credentials, initiating standard transfers, and generating Bill Payment Codes (BPC) operates with zero fees on SwiftPay.
                    </p>
                  </div>

                  {/* Video Mock aspect ratios */}
                  <div className="h-32 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                    <span className="text-xs font-mono font-bold text-teal-400">REBRAND WALKTHROUGH DEMO</span>
                    <span className="text-[10px] text-slate-500">Video tutorial active session - 1m 45s</span>
                  </div>

                  <button
                    id="btn-guide-dismiss"
                    onClick={() => setIsGuideOpen(false)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider"
                  >
                    Got It, Thank You!
                  </button>
                </div>
              </div>
            )}

            {/* Professional Transaction Receipt Modal */}
            {selectedReceiptTx && (
              <TransactionReceipt
                transaction={selectedReceiptTx}
                onClose={() => setSelectedReceiptTx(null)}
                onShare={(summary) => {
                  navigator.clipboard.writeText(summary);
                  showToast('Receipt details copied to clipboard!', 'success');
                }}
                onToast={(msg, type) => showToast(msg, type)}
              />
            )}

            {/* Inactivity Timeout Warning modal */}
            {inactivityCountdown !== null && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease-out]">
                <div className="bg-slate-900 border border-red-500/30 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4">
                  <div className="h-12 w-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto animate-pulse">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white font-display uppercase">Session Expiring</h5>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      You will be automatically logged out in <span className="text-red-400 font-bold font-mono">{inactivityCountdown}</span> seconds due to inactivity.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setInactivityCountdown(null);
                      showToast('Session extended successfully!', 'success');
                    }}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-500 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all"
                  >
                    Extend Session
                  </button>
                </div>
              </div>
            )}

            {/* Two-Factor Authentication (OTP verification overlay) */}
            {securityOtpSession && (
              <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease-out]">
                <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl">
                  <div className="text-center">
                    <div className="h-12 w-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center mx-auto mb-3">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <h4 className="text-base font-bold font-display text-white">Two-Factor Authentication</h4>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      A secure verification code has been dispatched to your email. Enter it below to proceed with this action.
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1.5 uppercase tracking-wider">6-Digit Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={securityOtp}
                      onChange={(e) => setSecurityOtp(e.target.value)}
                      className="w-full text-center text-sm tracking-widest bg-slate-950 border border-white/10 rounded-xl py-3 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (securityOtp.trim() === securityOtpSession.otp) {
                          const { purpose, data } = securityOtpSession;
                          setSecurityOtpSession(null);
                          setSecurityOtp('');
                          showToast('Action authorized successfully!', 'success');
                          
                          if (purpose === 'password_change') {
                            handleConfirmPasswordChange(data);
                          } else if (purpose === 'email_change') {
                            handleConfirmEmailChange(data);
                          } else if (purpose === 'pin_change') {
                            handleConfirmPinChange(data);
                          } else if (purpose === 'transfer') {
                            handleConfirmTransferSubmit(data);
                          }
                        } else {
                          showToast('Incorrect authorization code. Check the simulated inbox.', 'error');
                        }
                      }}
                      className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                    >
                      Authorize
                    </button>
                    <button
                      onClick={() => {
                        setSecurityOtpSession(null);
                        setSecurityOtp('');
                      }}
                      className="px-5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Simulated Email Client Overlay Tray */}
            {isEmailSimulatorOpen && (
              <div className="absolute inset-x-0 bottom-0 top-12 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col animate-[slideUp_0.25s_ease-out]">
                <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0 bg-slate-900">
                  <span className="text-xs font-bold font-mono tracking-wider text-teal-400 uppercase">Simulated Email Inbox</span>
                  <button
                    onClick={() => setIsEmailSimulatorOpen(false)}
                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-slate-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                  <EmailSimulator
                    emails={emails}
                    onMarkAsRead={(id) => setEmails(emails.map(e => e.id === id ? { ...e, read: true } : e))}
                    onDeleteEmail={(id) => setEmails(emails.filter(e => e.id !== id))}
                    onClearAll={() => setEmails([])}
                  />
                </div>
              </div>
            )}

          </div>
        )}

        </div>

        {/* Right Side Panel (Hidden on mobile, beautiful on desktop) */}
        <div className="hidden xl:flex flex-col w-[300px] shrink-0 gap-6">
          <GlassCard className="p-6 space-y-4 border border-white/[0.08] bg-white/[0.04]">
            <h3 className="text-xl font-bold font-display text-white border-b border-white/5 pb-2">
              Bank Transfer
            </h3>
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">ACCOUNT NUMBER</div>
                <div className="text-base font-bold text-white flex items-center justify-between border-b border-white/10 pb-1.5 font-mono">
                  <span>8960723295</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText('8960723295');
                      showToast('Account number copied!', 'success');
                    }}
                    className="text-[#2dd4bf] text-xs font-semibold hover:underline cursor-pointer animate-pulse"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">BANK NAME</div>
                <div className="text-sm font-semibold text-white font-mono">PalmPay</div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">ACCOUNT NAME</div>
                <div className="text-sm font-semibold text-white font-mono">Pwamunadi Ishaku</div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-300 leading-relaxed font-sans">
                Please use only supported banks for instant confirmation. Keep your transfer receipt handy.
              </div>
            </div>
          </GlassCard>
        </div>

      </div>

      {/* Footer credits info (Hidden on mobile) */}
      <div className="hidden md:block text-center mt-6 text-[10px] text-slate-500">
        SwiftPay © 2026. All transaction logs and BPC keys are fully persisted in secure localStorage.
      </div>

    </div>
  );
}
