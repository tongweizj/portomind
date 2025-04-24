// src/components/Header.jsx
import { NavLink } from "react-router";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white shadow border-b">
      <div className="text-xl font-bold text-blue-600">我的投资组合</div>
      <nav className="space-x-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            isActive ? "text-blue-600 font-semibold" : "text-gray-600"
          }
        >
          首页
        </NavLink>
      </nav>
    </header>
  );
}
