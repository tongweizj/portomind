export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">欢迎回来 👋</h1>

      {/* 欢迎卡片 */}
      <div className="bg-white rounded-xl shadow-md p-6 text-gray-800">
        <p className="text-lg font-medium mb-2">这是你的个人理财投资组合管理平台。你可以在左侧菜单中：</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li>查看并管理你的 <strong className="text-gray-900">投资组合</strong></li>
          <li>记录每一笔 <strong className="text-gray-900">交易流水</strong></li>
          <li>维护每日关注的 <strong className="text-gray-900">资产列表</strong></li>
          <li>查看价格 <strong className="text-gray-900">同步日志</strong></li>
        </ul>
      </div>

      {/* TODO: 后续可以放总资产、今日盈亏等统计卡片 */}
    </div>
  );
}