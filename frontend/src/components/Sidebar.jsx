import { NavLink } from 'react-router-dom';
import { navItems } from '../routes.jsx';
import { Home, MessageCircle, User } from 'lucide-react';
import { useState } from 'react';

const Sidebar = ({ isCollapsed, onToggle }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Always show expanded content when hovered, regardless of collapsed state
  const showExpanded = isHovered;

  return (
    <div 
      className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-full flex flex-col transition-all duration-300 ease-in-out ${
        isHovered ? 'w-64' : 'w-16'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center px-4 lg:px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        {/* Logo - always visible */}
        <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">P</span>
        </div>
        
        {/* Text - only when expanded or hovered */}
        {showExpanded && (
          <span className="font-semibold text-gray-900 dark:text-gray-100 ml-2">Proactive AI</span>
        )}
      </div>

      <nav className="mt-6 px-3 flex-1">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.path}
                className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                <span className="mr-3 text-gray-600 dark:text-gray-300">
                  {item.icon === 'home' && <Home size={20} />}
                  {item.icon === 'message-circle' && <MessageCircle size={20} />}
                  {item.icon === 'settings' && <User size={20} />}
                </span>
                {showExpanded && <span>{item.name}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;