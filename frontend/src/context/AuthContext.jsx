import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Check for token in URL (OAuth callback)
    const urlParams = new URLSearchParams(location.search);
    const token = urlParams.get('token');
    
    if (token) {
      // Handle OAuth callback
      authAPI.handleCallback(token);
      // Fetch user info after storing token
      authAPI.getCurrentUser()
        .then(response => {
          setUser(response.data);
          setIsAuthenticated(true);
        })
        .catch(error => {
          console.error('Failed to get user info:', error);
        });
      // Clear URL params
      window.history.replaceState({}, document.title, location.pathname);
    }
    
    // Check for existing authentication
    const checkAuth = async () => {
      try {
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken) {
          // Verify token by fetching user info
          const response = await authAPI.getCurrentUser();
          setUser(response.data);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('auth_token');
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [location]);

  const googleAuth = async () => {
    try {
      setIsLoading(true);
      // Redirect to backend OAuth endpoint
      authAPI.googleLogin();
    } catch (error) {
      console.error('Google auth failed:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  const completeProfile = async (profileData) => {
    try {
      console.log('completeProfile called with:', profileData);
      setIsLoading(true);
      
      // Get current user if not already loaded
      let currentUser = user;
      if (!currentUser) {
        console.log('User not loaded, fetching from API...');
        try {
          const response = await authAPI.getCurrentUser();
          currentUser = response.data;
          console.log('User fetched:', currentUser);
          setUser(currentUser);
        } catch (error) {
          console.error('Failed to get user:', error);
          // Continue anyway with empty user
        }
      } else {
        console.log('User already loaded:', currentUser);
      }
      
      // For now, just mark profile as complete locally
      // In future, you can add a backend endpoint to save profile data
      const updatedUser = {
        ...(currentUser || {}),
        ...profileData,
        profileComplete: true
      };
      console.log('Updated user:', updatedUser);
      setUser(updatedUser);
      setIsAuthenticated(true);
      
      // Store profile data in localStorage (temporary solution)
      localStorage.setItem('user_profile', JSON.stringify(profileData));
      localStorage.setItem('profile_complete', 'true');
      
      // Force a small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('Profile setup completed successfully');
      return { success: true };
    } catch (error) {
      console.error('Profile setup failed:', error);
      return { success: false, error: error.message || 'Profile setup failed' };
    } finally {
      setIsLoading(false);
      console.log('completeProfile finished, isLoading set to false');
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    googleAuth,
    logout,
    completeProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
