import React from 'react';
import './ButtonGroup.css';

/**
 * @param {Object} props
 * @param {Array<{ label: string, onClick: () => void, type?: string }>} props.buttons
 *   按钮列表，每项包含要显示的 label、点击回调、可选的 type (如 'primary' | 'danger' 等)
 * @param {string} [props.className]    额外的 className，用于样式定制
 */
export function ButtonGroup({ buttons, className = '' }) {
  return (
    <div className={`button-group ${className}`}>
      {buttons.map(({ label, onClick, type = 'default' }, idx) => (
        <button
          key={idx}
          className={`btn btn--${type}`}
          onClick={onClick}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
