import { PaymentProvider, PaymentProviderName, ProviderStatusInfo } from './types';
import { KorapayProvider } from './KorapayProvider';

export class PaymentManager {
  private providers: Map<PaymentProviderName, PaymentProvider> = new Map();

  constructor() {
    const korapay = new KorapayProvider();
    this.providers.set('korapay', korapay);
  }

  getProvider(_name?: string): PaymentProvider {
    const provider = this.providers.get('korapay');
    if (!provider) {
      throw new Error('Korapay payment provider is not initialized.');
    }
    return provider;
  }

  getConfiguredActiveProviderName(): PaymentProviderName {
    return 'korapay';
  }

  setActiveProviderName(_name: PaymentProviderName) {
    // Korapay is the sole supported payment provider
  }

  getActiveProvider(_requestedName?: string): PaymentProvider {
    return this.getProvider('korapay');
  }

  getAllProvidersStatus(): ProviderStatusInfo[] {
    const provider = this.getProvider('korapay');
    const isConfigured = provider.isConfigured();
    return [
      {
        name: 'korapay',
        displayName: provider.displayName,
        isConfigured,
        isActive: true,
        hasSecretKey: isConfigured,
        hasPublicKey: Boolean(provider.getPublicKey()),
        publicKey: provider.getPublicKey() || undefined,
        missingEnvVars: provider.getMissingEnvVars()
      }
    ];
  }
}

// Global Singleton Instance
export const paymentManager = new PaymentManager();
