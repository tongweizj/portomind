// src/pages/Portfolio/rebalanceTabContext.js
// 「再平衡」主 Tab 的子模块切换 context。
// 单独成文件以避开 react-refresh 的 only-export-components 约束。
import { createContext } from 'react';

export const RebalanceTabContext = createContext({ switchSubTab: () => {} });
