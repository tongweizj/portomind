// src/components/layout/Sidebar.jsx
import { NavLink } from 'react-router';
import {
  LayoutDashboard, Folder, FileBarChart, ListOrdered, Coins, LogOut
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/prices', icon: Folder, label: '价格' },
  { to: '/portfolios', icon: Folder, label: '组合管理' },
  { to: '/transactions', icon: ListOrdered, label: '交易记录' },
  { to: '/assets', icon: Coins, label: '资产管理' },
  { to: '/logs', icon: FileBarChart, label: '日志' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen fixed top-0 left-0 z-30">
      <div className="p-6 font-bold text-xl text-blue-600"><img src="/logo.png" alt="PortoMind" className="h-8" /></div>
      <nav className="mt-6 space-y-1 px-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2 rounded-lg transition hover:bg-blue-50 text-sm font-medium ${isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-4 left-4 right-4">
        <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-red-500 transition">
          <LogOut size={18} />
          退出登录
        </button>
      </div>
    </aside>
  );
}
