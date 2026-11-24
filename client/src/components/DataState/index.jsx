// 通用数据状态原语；文案可由调用方覆盖，未传时保持既有默认值。
export function LoadingState({ children }) {
  return (
    <div className="rounded bg-gray-50 p-6 text-center text-gray-500">
      {children || '数据加载中…'}
    </div>
  );
}

export function EmptyState({ children }) {
  return (
    <div className="rounded border border-dashed p-6 text-center text-gray-500">
      {children || '暂无数据'}
    </div>
  );
}

export function ErrorState({ children }) {
  return (
    <div className="rounded bg-red-50 p-6 text-center text-red-700">
      {children || '数据加载失败，请稍后重试'}
    </div>
  );
}
