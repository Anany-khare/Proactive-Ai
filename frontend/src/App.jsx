import React, { useState, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Sidebar from './components/Sidebar.jsx'
import Navbar from './components/Navbar.jsx'
import { routes } from './routes.jsx'

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Chat = lazy(() => import('./pages/Chat.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Signup = lazy(() => import('./pages/Signup.jsx'))
const ProfileSetup = lazy(() => import('./pages/ProfileSetup.jsx'))
const Emails = lazy(() => import('./pages/Emails.jsx'))
const Meetings = lazy(() => import('./pages/Meetings.jsx'))

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Define public routes that shouldn't show sidebar/navbar
  const publicRoutes = ['/login', '/signup', '/profile-setup', '/auth/callback'];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // If it's a public route, render without sidebar/navbar
  if (isPublicRoute) {
    return (
      <div className="min-h-screen">
        <Suspense fallback={<div className="text-gray-600 dark:text-gray-300">Loading...</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/profile-setup" element={<ProfileSetup />} />
            <Route path="/auth/callback" element={<Login />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  // For authenticated routes, render with navbar and sidebar below
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={toggleMobileMenu}
        />
      )}

      {/* Navbar - Top */}
      <div className="w-full">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          <button
            onClick={toggleMobileMenu}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Proactive AI</span>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">JD</span>
          </div>
        </div>

        {/* Desktop Navbar */}
        <div className="hidden lg:block">
          <Navbar />
        </div>
      </div>

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex min-w-0 transition-all duration-300 ease-in-out">
        {/* Sidebar - Below Navbar */}
        <div className={`fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto lg:flex-shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } transition-all duration-300 ease-in-out`}>
          <Sidebar 
            isCollapsed={true} 
            onToggle={toggleSidebar}
          />
        </div>

        {/* Routed Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Suspense fallback={<div className="text-gray-600 dark:text-gray-300">Loading...</div>}>
            <Routes>
              {/* Protected Routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/chat" element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/emails" element={
                <ProtectedRoute>
                  <Emails />
                </ProtectedRoute>
              } />
              <Route path="/emails/:id" element={
                <ProtectedRoute>
                  <Emails />
                </ProtectedRoute>
              } />
              <Route path="/meetings" element={
                <ProtectedRoute>
                  <Meetings />
                </ProtectedRoute>
              } />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;