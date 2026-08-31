// ✅ 文件：src/layout/AppLayout.jsx
import { Outlet, useNavigate } from 'react-router';
import { Bell, Search, User } from 'lucide-react';
import Sidebar from './Sidebar';
import { useUnreadAlertCount } from '../../hooks/useAlerts';

export default function AppLayout() {
  const navigate = useNavigate();
  const { count } = useUnreadAlertCount();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      {/* ✅ 加上 ml-64 避开 Sidebar */}
      <div className="flex-1 flex flex-col ml-64">
        {/* 顶部导航栏 */}
        <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-gray-200 shadow-sm">
  {/* 左侧 Logo + 名称 */}
  <div className="flex items-center gap-2 text-blue-600 font-bold text-lg tracking-wide">
    <span className="text-xl">💰</span>
    ETF Portfolio
  </div>
  
  {/* 右侧搜索栏 + 铃铛 + 用户 */}
  <div className="flex items-center gap-6">
    <div className="relative">
      <input
        type="text"
        placeholder="搜索..."
        className="pl-10 pr-4 py-2 w-64 rounded-md bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
    </div>

    {/* 提醒中心入口：未读徽标（PRD AL-07 / FAM-03） */}
    <button
      type="button"
      onClick={() => navigate('/')}
      title="提醒中心"
      className="relative w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition"
    >
      <Bell className="w-5 h-5 text-gray-600" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>

    <button className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition">
      <User className="w-5 h-5 text-gray-600" />
    </button>
  </div>
</header>


        {/* 主体内容区域 */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
