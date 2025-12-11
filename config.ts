
// Safe environment variable access helper
const getEnv = (key: string, defaultValue: string = ''): string => {
  // Cast import.meta to any to safely access Vite's 'env' property without type errors
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return ((import.meta as any).env[key] as string) || defaultValue;
  }
  return defaultValue;
};

const config = {
  // Backend API URL - This connects to your Vercel Backend
  API_BASE_URL: getEnv('VITE_API_BASE_URL', 'http://localhost:5000/api'),
  
  // Cloudinary Configuration
  CLOUDINARY: {
    CLOUD_NAME: getEnv('VITE_CLOUDINARY_CLOUD_NAME', ''),
    UPLOAD_PRESET: getEnv('VITE_CLOUDINARY_UPLOAD_PRESET', ''),
  },

  // Localization
  CURRENCY: {
    SYMBOL: '₹',
    CODE: 'INR',
    LOCALE: 'en-IN'
  }
};

// Helper for Indian Currency Formatting (Lakhs/Crores)
export const formatCurrency = (value: number): string => {
  if (value >= 10000000) {
    return `${config.CURRENCY.SYMBOL}${(value / 10000000).toFixed(2)} Cr`;
  } else if (value >= 100000) {
    return `${config.CURRENCY.SYMBOL}${(value / 100000).toFixed(2)} L`;
  }
  return new Intl.NumberFormat(config.CURRENCY.LOCALE, {
    style: 'currency',
    currency: config.CURRENCY.CODE,
    maximumFractionDigits: 0
  }).format(value);
};

export const CURRENCY_SYMBOL = config.CURRENCY.SYMBOL;
export default config;
