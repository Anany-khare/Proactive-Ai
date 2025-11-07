# Proactive AI Dashboard

A modern, responsive dashboard UI for a personal AI assistant built with React, Vite, and TailwindCSS.

## Features

- **Collapsible Sidebar**: Navigation with logo, menu items, and user profile
- **Top Navbar**: Search bar, notifications, and user profile
- **Agent Cards**: Three main dashboard cards for different AI agents
  - Calendar Agent: Upcoming events and schedule management
  - Health Agent: Steps, water intake, and health reminders
  - Communication Agent: Unread messages across platforms
- **Responsive Design**: Works on desktop and mobile devices
- **Clean UI**: Minimal, professional design with subtle colors and shadows

## Project Structure

```
src/
├── components/
│   ├── Sidebar.jsx             # Collapsible sidebar navigation
│   ├── Navbar.jsx              # Top navigation bar
│   ├── CalendarAgentCard.jsx   # Calendar events card
│   ├── HealthAgentCard.jsx     # Health tracking card
│   └── CommunicationAgentCard.jsx # Messages card
├── utils/
│   └── api.jsx                 # API integration utilities
├── App.jsx                     # Main application component
├── main.jsx                    # Application entry point
└── index.css                   # Global styles with TailwindCSS
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint for code quality

## API Integration

The dashboard is designed to work with a FastAPI backend. The `src/utils/api.jsx` file contains placeholder functions for all API endpoints:

- **Calendar API**: Event management and scheduling
- **Health API**: Health data tracking and reminders
- **Communication API**: Message management across platforms
- **User API**: Profile and preferences management
- **Search API**: Global and agent-specific search
- **Notification API**: Notification management

### Environment Variables

Create a `.env` file in the root directory:

```env
REACT_APP_API_URL=http://localhost:8000/api
```

## Customization

### Colors

The color scheme can be customized in `tailwind.config.js`:

```javascript
colors: {
  primary: {
    // Customize primary colors
  },
  gray: {
    // Customize gray colors
  }
}
```

### Components

Each component is modular and can be easily customized:

- **Sidebar**: Modify navigation items in the `navigationItems` array
- **Cards**: Update placeholder data and styling
- **Layout**: Adjust grid layouts and responsive breakpoints

## Responsive Design

The dashboard is fully responsive with breakpoints:

- **Mobile**: `< 1024px` - Collapsible sidebar with overlay
- **Desktop**: `>= 1024px` - Fixed sidebar with toggle

## Future Enhancements

- Real-time data updates
- Dark mode support
- Advanced filtering and sorting
- Drag and drop functionality
- Customizable dashboard widgets
- Multi-language support

## Technologies Used

- **React 18**: Frontend framework
- **Vite**: Fast build tool and development server
- **TailwindCSS**: Utility-first CSS framework
- **Inter Font**: Modern typography
- **SVG Icons**: Scalable vector icons

## License

This project is licensed under the MIT License.