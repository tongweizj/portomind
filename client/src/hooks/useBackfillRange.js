// client/src/hooks/useBackfillRange.js
//
// TASK-072/074：单资产与批量补采共用的年份/区间选择状态。
import { useState } from 'react';

function todayString() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

export function useBackfillRange() {
  const today = todayString();
  const currentYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, index) => String(currentYear - index));
  const [year, setYear] = useState(String(currentYear));
  const [from, setFrom] = useState(`${currentYear}-01-01`);
  const [to, setTo] = useState(today);

  const changeYear = (value) => {
    setYear(value);
    if (!value) return;
    setFrom(`${value}-01-01`);
    setTo(Number(value) === currentYear ? today : `${value}-12-31`);
  };

  const changeFrom = (value) => {
    setFrom(value);
    setYear('');
  };

  const changeTo = (value) => {
    setTo(value);
    setYear('');
  };

  return { today, currentYear, years, year, from, to, changeYear, changeFrom, changeTo };
}
