import { useParams } from "react-router-dom";

export default function LiveView() {
  const { sessionId } = useParams();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">即時監控</h1>
      <p className="text-gray-600">Session: {sessionId}</p>
    </div>
  );
}
