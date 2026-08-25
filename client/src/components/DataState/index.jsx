export function LoadingState() {
  return <div className="rounded bg-gray-50 p-6 text-center text-gray-500">数据加载中…</div>;
}

export function EmptyState() {
  return <div className="rounded border border-dashed p-6 text-center text-gray-500">暂无数据</div>;
}

export function ErrorState() {
  return <div className="rounded bg-red-50 p-6 text-center text-red-700">数据加载失败，请稍后重试</div>;
}
