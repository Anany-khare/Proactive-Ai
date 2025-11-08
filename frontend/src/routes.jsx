// Central routes configuration (no JSX here)
export const routes = [
  { path: '/dashboard', name: 'Home', icon: 'home' },
  { path: '/emails', name: 'Emails', icon: 'mail' },
  { path: '/meetings', name: 'Meetings', icon: 'calendar' },
  { path: '/chat', name: 'Chat', icon: 'message-circle' },
  { path: '/settings', name: 'Profile', icon: 'settings' },
];

export const navItems = routes.map(({ path, name, icon }) => ({ path, name, icon }));

