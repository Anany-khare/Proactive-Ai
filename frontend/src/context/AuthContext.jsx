import { createContext, useContext, useState, useEffect, useRef } from 'react';
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

  // Ref to track if we are currently fetching user to prevent duplicate calls
  const fetchingUser = useRef(false);

  // Unified Auth Check
  useEffect(() => {
    const initAuth = async () => {
      // Prevent double invocation (Strict Mode or race conditions)
      if (fetchingUser.current) return;
      fetchingUser.current = true;

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        let tokenToVerify = null;

        if (urlToken) {
          // Store token
          localStorage.setItem('auth_token', urlToken);
          tokenToVerify = urlToken;
          // Clear URL params
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // Check localStorage
          tokenToVerify = localStorage.getItem('auth_token');
        }

        if (tokenToVerify) {
          // Fast-path: Immediately unblock UI if we have cached user data
          const cachedUser = localStorage.getItem('user_cache');
          if (cachedUser) {
            try {
              setUser(JSON.parse(cachedUser));
              setIsAuthenticated(true);
              setIsLoading(false); // Render app immediately
            } catch (e) {}
          }

          // Background verification
          try {
            const response = await authAPI.getCurrentUser();
            setUser(response.data);
            setIsAuthenticated(true);
            localStorage.setItem('user_cache', JSON.stringify(response.data));
          } catch (error) {
            // Only clear if it was an invalid token error, not network error
            if (error.response && error.response.status === 401) {
              localStorage.removeItem('auth_token');
              localStorage.removeItem('user_cache');
              setUser(null);
              setIsAuthenticated(false);
            }
          }
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
        fetchingUser.current = false;
      }
    };

    initAuth();
  }, []); // Run ONCE on mount

  const googleAuth = async () => {
    try {
      setIsLoading(true);
      // Redirect to backend OAuth endpoint
      authAPI.googleLogin();
    } catch (error) {
      console.error('Google auth failed:', error);
      setIsLoading(false);
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_profile');
    localStorage.removeItem('profile_complete');
    localStorage.removeItem('user_cache');
    navigate('/login');
  };

  const completeProfile = async (profileData) => {
    try {
      setIsLoading(true);

      // Get current user if not already loaded
      let currentUser = user;
      if (!currentUser) {
        try {
          const response = await authAPI.getCurrentUser();
          currentUser = response.data;
        } catch (error) {
          console.error('Failed to get user:', error);
        }
      }

      // For now, just mark profile as complete locally
      // In future, you can add a backend endpoint to save profile data
      const updatedUser = {
        ...(currentUser || {}),
        ...profileData,
        profileComplete: true
      };

      setUser(updatedUser);
      setIsAuthenticated(true);

      // Store profile data in localStorage (temporary solution)
      localStorage.setItem('user_profile', JSON.stringify(profileData));
      localStorage.setItem('profile_complete', 'true');

      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true };
    } catch (error) {
      console.error('Profile setup failed:', error);
      return { success: false, error: error.message || 'Profile setup failed' };
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    googleAuth,
    logout,
    completeProfile,
    updateAutoPilot: async (enabled) => {
      try {
        const response = await authAPI.updateProfile({ auto_pilot_enabled: enabled });
        if (response.data.status === 'updated') {
          setUser(prev => ({ ...prev, auto_pilot_enabled: enabled }));
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to update auto-pilot:', err);
        return false;
      }
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
