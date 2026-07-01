import { Link } from "react-router-dom";

export default function Landing() {
  const cards = [
    {
      title: "即時監控",
      desc: "即時檢視 IMU 數據圖表與連線狀態",
      to: "/dashboard/live/test",
      color: "bg-blue-500",
    },
    {
      title: "歷史課程",
      desc: "瀏覽過去所有運動課程紀錄",
      to: "/dashboard/history",
      color: "bg-green-500",
    },
    {
      title: "報告管理",
      desc: "檢視與管理課程分析報告",
      to: "/dashboard/report/test",
      color: "bg-purple-500",
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">儀表板</h1>
        <p className="text-gray-500 mt-1">HMEAYC 運動健康管理系統</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
          >
            <div className={`h-2 ${card.color}`} />
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-800">
                {card.title}
              </h2>
              <p className="text-gray-500 mt-2 text-sm">{card.desc}</p>
              <span className="inline-block mt-4 text-sm text-blue-600 font-medium">
                前往 →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
