import React from 'react';
// import './PortfolioCard.css'; // 或者 .module.css
import { ChevronRight } from 'lucide-react';
/**
 * @param {Object} props
 * @param {Object} props.portfolio      投资组合对象，至少包含 { _id, name, description }
 * @param {() => void} props.onClick    点击卡片时调用
 * @param {string} [props.className]    额外的 className，用于样式定制
 */
export function PortfolioCard({ portfolio, onClick, className = '' }) {
  return (
    <div
      className="bg-white shadow rounded-xl p-6 relative cursor-pointer hover:bg-gray-50 transition"
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <h2 className="text-xl font-semibold text-gray-800">{portfolio.name}</h2>
      <p className="text-gray-600 mt-2">{portfolio.description}</p>
      <div className="flex items-center justify-between text-sm text-gray-700 mt-4">
        <span>类型：{portfolio.type}</span>
        <span>币种：{portfolio.currency}</span>
      </div>

      <div
        className="absolute top-4 right-4 text-gray-400"
      /* 点击箭头也触发卡片 onClick */
      >
        <ChevronRight size={24} />
      </div>
    </div>
  );
}
