import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Shield, User } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

interface LoginProps {
  onLogin: (token: string, userInfo: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSuccess = async (response: any) => {
    setIsLoading(true);
    setError('');
    
    try {
      // GoogleLogin returns credential (JWT), not access_token
      // We need to decode it or use useGoogleLogin hook instead
      // For now, let's decode the JWT to get user info
      
      if (!response.credential) {
        throw new Error('No credential received from Google. Please try again.');
      }

      // Decode JWT to get user info (simple base64 decode)
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      
      const userInfo = JSON.parse(jsonPayload);
      
      // Check if user info is valid
      if (!userInfo.email) {
        throw new Error('Unable to retrieve user email. Please make sure you are added as a test user.');
      }
      
      // Send credential to backend for verification
      const apiUrl = import.meta.env.VITE_API_URL || 'http://13.49.57.101:8000';
      const verifyResponse = await fetch(`${apiUrl}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: response.credential,
          user_info: userInfo
        }),
      });

      if (!verifyResponse.ok) {
        const errorText = await verifyResponse.text();
        throw new Error(`Authentication failed: ${errorText}`);
      }

      const authData = await verifyResponse.json();
      
      // Call parent's onLogin with credential and user info
      onLogin(response.credential, {
        ...userInfo,
        ...authData.user
      });
      
      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      let errorMessage = err.message || 'Authentication failed. Please try again.';
      
      // Provide helpful error messages
      if (errorMessage.includes('test user')) {
        errorMessage = 'Please add your email as a test user in Google Cloud Console → OAuth consent screen → Test users';
      } else if (errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to Google. Please check your internet connection and try again.';
      }
      
      setError(errorMessage);
      console.error('Google OAuth error:', err);
    }
  };

  const handleGoogleError = () => {
    setError('Google authentication failed. Please try again.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Professional Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Hemascan</h1>
              <p className="text-xs text-slate-600">leukemia Detection And Diagnosis System</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Login Area */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl bg-white/95 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle className="text-xl text-slate-900">Login Page</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-800 text-sm">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-4">
                    Sign in with your Google account to access HemaScan
                  </p>
                </div>

                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  logo_alignment="left"
                  width="100%"
                  scope="openid email profile"
                />

                {isLoading && (
                  <div className="flex items-center justify-center space-x-2 text-sm text-slate-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Authenticating...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}