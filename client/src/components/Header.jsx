// src/components/Header.jsx
import React from 'react';

export default function Header({ title = "我的基金投资管理系统" }) {
  return (
    <div style={{
      padding: '15px 20px',
      borderBottom: '1px solid #ddd',
      backgroundColor: '#f9f9f9',
      fontWeight: 'bold',
      fontSize: '18px'
    }}>
      {title}
    </div>
  );
}
