// API Configuration
// Uses environment variables for different environments

const getApiUrl = (): string => {
  // In production, use environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Default to localhost for development
  return 'http://localhost:8000';
};

export const API_URL = getApiUrl();

// API Endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_URL}/api/auth/login`,
  },
  ANALYSIS: {
    ANALYZE: `${API_URL}/api/analyze`,
    GRAD_CAM: `${API_URL}/api/generate-gradcam`,
  },
  CHAT: `${API_URL}/api/chat`,
  HEALTH: `${API_URL}/`,
};

// AWS API Gateway for Vital Signs (already configured)
export const VITAL_SIGNS_API = 'https://wbqi1yjvy2.execute-api.eu-north-1.amazonaws.com/prod/vitals';

console.log('API Configuration:', {
  API_URL,
  ENVIRONMENT: import.meta.env.MODE,
});

