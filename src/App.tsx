import { useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { Toaster } from './components/ui/sonner';
import { Card, CardContent } from './components/ui/card';
import { Alert, AlertDescription } from './components/ui/alert';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Get Google OAuth Client ID from environment
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // Check for existing session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUserInfo = localStorage.getItem('userInfo');
    
    if (storedToken && storedUserInfo) {
      setAuthToken(storedToken);
      setUserInfo(JSON.parse(storedUserInfo));
      setIsLoggedIn(true);
    }
  }, []);

  // Handle Google login
  const handleLogin = (token: string, user: any) => {
    setAuthToken(token);
    setUserInfo(user);
    setIsLoggedIn(true);
    
    // Store in localStorage for persistence
    localStorage.setItem('authToken', token);
    localStorage.setItem('userInfo', JSON.stringify(user));
  };

  // Handle logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    setAuthToken(null);
    setUserInfo(null);
    
    // Clear localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
  };

  // If Google Client ID is not configured, show error
  if (!googleClientId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Card className="border-0 shadow-xl bg-white/95 backdrop-blur-sm max-w-md">
          <CardContent className="p-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                Google OAuth is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      {!isLoggedIn ? (
        <>
          <Login onLogin={handleLogin} />
          <Toaster />
        </>
      ) : (
        <>
          <Dashboard onLogout={handleLogout} userInfo={userInfo} />
          <Toaster />
        </>
      )}
    </GoogleOAuthProvider>
  );
}