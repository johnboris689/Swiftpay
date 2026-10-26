import { PaymentProvider, PaymentProviderName, ProviderStatusInfo } from './types';
import { KorapayProvider } from './KorapayProvider';
import { PaystackProvider } from './PaystackProvider';

export class PaymentManager {
  private providers: Map<PaymentProviderName, PaymentProvider> = new Map();
  private preferredActiveProvider: PaymentProviderName = 'korapay';

  constructor() {
    const korapay = new KorapayProvider();
    const paystack = new PaystackProvider();
    this.providers.set('korapay', korapay);
    this.providers.set('paystack', paystack);
  }

  getProvider(name?: string): PaymentProvider {
    const key = (name || '').toLowerCase().trim() as PaymentProviderName;
    if (key && this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    // Default to configured provider
    const configured = this.getAvailableProviders();
    if (configured.length > 0) {
      const preferred = configured.find(p => p.name === this.preferredActiveProvider);
      return preferred || configured[0];
    }

    // Fallback to korapay
    const defaultProvider = this.providers.get('korapay');
    if (defaultProvider) return defaultProvider;

    throw new Error(`Payment provider "${name || 'default'}" not found.`);
  }

  getAvailableProviders(): PaymentProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isConfigured());
  }

  getConfiguredActiveProviderName(): PaymentProviderName | 'both' | 'none' {
    const available = this.getAvailableProviders();
    if (available.length >= 2) return 'both';
    if (available.length === 1) return available[0].name;
    return 'none';
  }

  setActiveProviderName(name: PaymentProviderName) {
    if (this.providers.has(name)) {
      this.preferredActiveProvider = name;
    }
  }

  getActiveProvider(requestedName?: string): PaymentProvider {
    return this.getProvider(requestedName);
  }

  getAllProvidersStatus(): ProviderStatusInfo[] {
    return Array.from(this.providers.values()).map(provider => {
      const isConfigured = provider.isConfigured();
      return {
        name: provider.name,
        displayName: provider.displayName,
        isConfigured,
        isActive: isConfigured,
        hasSecretKey: isConfigured,
        hasPublicKey: Boolean(provider.getPublicKey()),
        publicKey: provider.getPublicKey() || undefined,
        missingEnvVars: provider.getMissingEnvVars()
      };
    });
  }
}

// Global Singleton Instance
export const paymentManager = new PaymentManager();
