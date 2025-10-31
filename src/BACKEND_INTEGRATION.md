# Hemascan Backend Integration Guide

This document provides comprehensive instructions for connecting the Hemascan frontend to your backend services.

## Overview

The Hemascan application has 4 main integration points marked in the code with detailed comments:
1. **Image Analysis API** - Leukemia detection from blood smear images
2. **Grad CAM Generation API** - AI model visualization
3. **Save Results API** - Persist analysis results
4. **AI Chat API** - Interactive chatbot for medical insights

## Workflow Features

### Clear All Functionality
The application includes a "Clear All" feature that allows doctors to:
- Reset the interface for a new analysis
- Clear uploaded images and all results
- Reset the chat conversation
- Start fresh with a new patient analysis

This feature is essential for medical workflows where multiple analyses are performed in sequence.

## API Endpoints Required

### 1. Authentication Endpoint
```
POST /api/auth/login
```
**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```
**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "username": "string",
    "role": "medical_professional"
  }
}
```

### 2. Image Analysis Endpoint
```
POST /api/analyze
```
**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data
```
**Request Body (FormData):**
- `image`: File (JPEG, PNG, or TIFF)

**Response:**
```json
{
  "diagnosis": "string",
  "confidence": 89.5,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Backend Implementation Note:**
The backend loads the PyTorch model (`leukemia_best.pt`) using `torch.load()` and performs inference on the uploaded image. Ensure the model is in evaluation mode and image preprocessing matches the training pipeline.

### 3. Grad CAM Generation Endpoint
```
POST /api/generate-gradcam
```
**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data
```
**Request Body (FormData):**
- `image`: File (original image)
- `analysisId`: string (optional, if tracking analysis sessions)

**Response:**
```json
{
  "heatmapImageUrl": "https://your-domain.com/gradcam/heatmap_123.png",
  "overlayImageUrl": "https://your-domain.com/gradcam/overlay_123.png",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 4. Save Results Endpoint
```
POST /api/save-result
```
**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```
**Request Body:**
```json
{
  "analysisResult": {
    "diagnosis": "string",
    "confidence": 89.5,
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "gradCAMResult": {
    "heatmapImageUrl": "string",
    "overlayImageUrl": "string",
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "patientId": "optional_patient_id",
  "timestamp": "2024-01-01T12:00:00Z"
}
```
**Response:**
```json
{
  "success": true,
  "recordId": "saved_record_id"
}
```

### 5. AI Chat Endpoint
```
POST /api/chat
```
**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```
**Request Body:**
```json
{
  "message": "string",
  "context": {
    "analysisResult": {
      "diagnosis": "string",
      "confidence": 89.5
    },
    "gradCAMResult": {
      "heatmapImageUrl": "string",
      "overlayImageUrl": "string"
    },
    "conversationHistory": [
      {
        "id": "string",
        "sender": "user|ai",
        "message": "string",
        "timestamp": "2024-01-01T12:00:00Z"
      }
    ]
  }
}
```
**Response:**
```json
{
  "message": "AI response string"
}
```

## Implementation Steps

### Step 1: Update Login Component
In `/components/Login.tsx`, replace the mock authentication:

```typescript
// Replace the handleSubmit function
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (username && password) {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();
      
      // Store the JWT token
      localStorage.setItem('authToken', data.token);
      
      setIsLoading(false);
      onLogin(username, password); // This will now always return true
      
    } catch (error) {
      setIsLoading(false);
      setError('Invalid credentials. Please try again.');
    }
  }
};
```

### Step 2: Update App.tsx for Token Management
In `/App.tsx`, add token management:

```typescript
import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Check for existing token on app load
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = (username: string, password: string) => {
    // This will be handled by the Login component now
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      setIsLoggedIn(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setAuthToken(null);
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard onLogout={handleLogout} authToken={authToken} />;
}
```

### Step 3: Update Dashboard Component
In `/components/Dashboard.tsx`, uncomment the TODO sections and replace with actual API calls. The code already contains the complete implementation examples in comments.

### Step 4: Environment Configuration
Create a `.env` file for your API configuration:

```env
REACT_APP_API_BASE_URL=https://your-api-domain.com
REACT_APP_AUTH_ENDPOINT=/api/auth/login
REACT_APP_ANALYZE_ENDPOINT=/api/analyze
REACT_APP_GRADCAM_ENDPOINT=/api/generate-gradcam
REACT_APP_SAVE_ENDPOINT=/api/save-result
REACT_APP_CHAT_ENDPOINT=/api/chat
```

## Security Considerations

1. **HTTPS Only**: All API communications must use HTTPS
2. **JWT Token Security**: Implement proper token expiration and refresh mechanisms
3. **Input Validation**: Validate all file uploads on the backend
4. **Rate Limiting**: Implement rate limiting on all endpoints
5. **HIPAA Compliance**: Ensure all patient data handling complies with HIPAA regulations
6. **File Size Limits**: Implement appropriate file size limits (recommended: 10MB max)
7. **Image Format Validation**: Only accept JPEG, PNG, and TIFF files

## Error Handling

The frontend handles these error scenarios:
- Network connectivity issues
- Invalid file formats
- File size too large
- Authentication failures
- API server errors
- Timeout errors

Ensure your backend returns appropriate HTTP status codes and error messages.

## Testing

Before deployment, test all integration points:
1. Login with valid/invalid credentials
2. Upload various image formats and sizes
3. Test analysis with different types of blood smear images
4. Verify Grad CAM generation
5. Test result saving functionality
6. Test AI chat with various queries
7. Test logout functionality

## Performance Recommendations

1. **Image Optimization**: Compress images before processing
2. **Caching**: Implement appropriate caching for analysis results
3. **Async Processing**: Use background jobs for computationally intensive tasks
4. **Progress Indicators**: Provide real-time progress updates for long-running operations
5. **CDN**: Use a CDN for serving generated Grad CAM images

## Monitoring and Logging

Implement logging for:
- Authentication attempts
- Image analysis requests
- API response times
- Error rates
- User activity patterns

This will help with debugging and compliance requirements.