// src/components/Sidebar.jsx
import { Link, useLocation } from 'react-router';

export default function Sidebar() {
    const location = useLocation();
  
    // ✅ 判断当前路径是否高亮
    const isActive = (path) => location.pathname === path;
  
    // ✅ 根据当前路径返回样式
    const linkStyle = (path) => ({
      display: 'block',
      padding: '10px 0',
      textDecoration: 'none',
      color: isActive(path) ? 'red' : '#333',
      fontWeight: isActive(path) ? 'bold' : 'normal',
    });
  
    return (
      <div style={{ width: '200px', borderRight: '1px solid #ccc', padding: '20px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '30px' }}>💼 我的基金</div>
  
        <Link to="/" style={linkStyle('/')}>📋 交易记录清单</Link>
        <Link to="/add" style={linkStyle('/add')}>➕ 添加交易记录</Link>
  
        <div style={{ marginTop: '30px', color: '#888' }}>📌 占位导航</div>
        <Link to="/portfolio" style={linkStyle('/portfolio')}>📊 投资组合概览（占位）</Link>
        <Link to="/report" style={linkStyle('/report')}>📈 报告分析（占位）</Link>
      </div>
    );
  }
