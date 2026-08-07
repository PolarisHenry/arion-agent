import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      {
        title: 'Dashboard',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        items: [],
        access: { menu: 'dashboard' }
      }
    ]
  },
  {
    label: 'Digital Employees',
    items: [
      {
        title: 'Agents',
        url: '/dashboard/agents',
        icon: 'robot',
        isActive: false,
        items: [],
        access: { menu: 'agents' }
      },
      {
        title: 'Scheduled Tasks',
        url: '/dashboard/triggers',
        icon: 'clock',
        isActive: false,
        items: [],
        access: { menu: 'agents' }
      },
      {
        title: 'LLM Models',
        url: '/dashboard/llm-models',
        icon: 'cpu',
        isActive: false,
        items: [],
        access: { menu: 'llm-models' }
      }
    ]
  },
  {
    label: 'System Settings',
    items: [
      {
        title: 'Users',
        url: '/dashboard/users',
        icon: 'teams',
        shortcut: ['u', 'u'],
        isActive: false,
        items: [],
        access: { menu: 'users' }
      },
      {
        title: 'Roles',
        url: '/dashboard/roles',
        icon: 'shield',
        isActive: false,
        items: [],
        access: { menu: 'roles' }
      }
    ]
  },
  {
    label: 'Demo',
    items: [
      {
        title: 'Product',
        url: '/dashboard/product',
        icon: 'product',
        isActive: false,
        items: [],
        access: { menu: 'product' }
      },
      {
        title: 'Kanban',
        url: '/dashboard/kanban',
        icon: 'kanban',
        shortcut: ['k', 'k'],
        isActive: false,
        items: []
      },
      {
        title: 'Chat',
        url: '/dashboard/chat',
        icon: 'chat',
        shortcut: ['c', 'c'],
        isActive: false,
        items: []
      },
      {
        title: 'Forms',
        url: '#',
        icon: 'forms',
        isActive: true,
        items: [
          {
            title: 'Basic Form',
            url: '/dashboard/forms/basic',
            icon: 'forms',
            shortcut: ['f', 'f']
          },
          { title: 'Multi-Step Form', url: '/dashboard/forms/multi-step', icon: 'forms' },
          { title: 'Sheet & Dialog', url: '/dashboard/forms/sheet-form', icon: 'forms' },
          { title: 'Advanced Patterns', url: '/dashboard/forms/advanced', icon: 'forms' }
        ]
      },
      {
        title: 'React Query',
        url: '/dashboard/react-query',
        icon: 'code',
        isActive: false,
        items: []
      },
      {
        title: 'Icons',
        url: '/dashboard/elements/icons',
        icon: 'palette',
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: '',
    items: [
      {
        title: 'Account',
        url: '#',
        icon: 'account',
        isActive: true,
        items: [
          { title: 'Profile', url: '/dashboard/profile', icon: 'profile', shortcut: ['m', 'm'] },
          {
            title: 'Notifications',
            url: '/dashboard/notifications',
            icon: 'notification',
            shortcut: ['n', 'n']
          },
          { title: 'Billing', url: '/dashboard/billing', icon: 'billing', shortcut: ['b', 'b'] },
          { title: 'Login', shortcut: ['l', 'l'], url: '/', icon: 'login' }
        ]
      }
    ]
  }
];
