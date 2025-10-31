import { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Handle login with specific credentials (a/a)
  const handleLogin = (username: string, password: string) => {
    // TODO: Replace with actual backend authentication
    // For now, accepting a/a as valid credentials
    if (username === 'a' && password === 'a') {
      setIsLoggedIn(true);
      return true;
    }
    return false;
  };

  // Handle logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    // TODO: Call backend logout endpoint to invalidate session
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard onLogout={handleLogout} />;
}