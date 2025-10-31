import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Shield, Lock, User } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, password: string) => boolean;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username && password) {
      setIsLoading(true);
      setError('');
      
      // Simulate authentication delay
      setTimeout(() => {
        const success = onLogin(username, password);
        setIsLoading(false);
        if (!success) {
          setError('Invalid credentials. Please try again.');
        }
      }, 1500);
    }
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

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-slate-700">
                    Username
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                    required
                    disabled={isLoading}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
                  disabled={!username || !password || isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Authenticating...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <Lock className="w-4 h-4" />
                      <span>Secure Login</span>
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}