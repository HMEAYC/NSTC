import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

interface ReportData {
  id: string;
  session_id: string;
  report_type: string;
  markdown: string;
}

export default function Report() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback((sid: string) => {
    setLoading(true);
    setError(null);

    // Try GET first; if 404, generate then fetch
    api.getSessionReport(sid)
      .then((data) => {
        setReport(data);
        setLoading(false);
      })
      .catch(() => {
        // Report doesn't exist yet — generate it
        api.generateReport(sid)
          .then(() => api.getSessionReport(sid))
          .then((data) => {
            setReport(data);
            setLoading(false);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "產生報告失敗");
            setLoading(false);
          });
      });
  }, []);

  useEffect(() => {
    if (sessionId) fetchReport(sessionId);
  }, [sessionId, fetchReport]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">← 返回</button>
          <h1 className="text-2xl font-bold text-gray-800">分析報告</h1>
        </div>
        <LoadingSpinner text="產生報告中…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">← 返回</button>
          <h1 className="text-2xl font-bold text-gray-800">分析報告</h1>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error}
          <button onClick={() => fetchReport(sessionId || "")} className="ml-2 underline">重試</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">← 返回</button>
          <h1 className="text-2xl font-bold text-gray-800">分析報告</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchReport(sessionId || "")}
            className="text-xs text-blue-600 hover:underline"
          >
            重新產生
          </button>
          {report && (
            <span className="text-xs text-gray-400 font-mono">{report.id.slice(0, 8)}</span>
          )}
        </div>
      </div>
      {report ? (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700">
            <RenderMarkdown markdown={report.markdown} />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-400">無報告內容</p>
        </div>
      )}
    </div>
  );
}

function boldToHtml(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.+?\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <b key={i}>{part.slice(2, -2)}</b>;
    }
    return part;
  });
}

function RenderMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={i} className="bg-gray-100 rounded p-3 overflow-x-auto text-sm my-2">
            <code>{codeBuffer.join("\n")}</code>
          </pre>,
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-xl font-bold mt-6 mb-2 pb-1 border-b">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-lg font-semibold mt-5 mb-2">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold mt-4 mb-1">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={i} className="ml-4 text-gray-700">
          {line.slice(2)}
        </li>,
      );
    } else if (line.startsWith("| ")) {
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      if (!line.includes("---")) {
        elements.push(
          <div key={i} className="flex gap-2 text-sm text-gray-700 border-b border-gray-100 py-1">
            {cells.map((c, j) => (
              <span key={j} className="flex-1" style={{ fontWeight: j === 0 ? 600 : 400 }}>
                {boldToHtml(c)}
              </span>
            ))}
          </div>,
        );
      }
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-gray-300 pl-3 py-1 my-2 text-sm text-gray-600 bg-gray-50 rounded-r">
          {boldToHtml(line.slice(2))}
        </blockquote>,
      );
    } else if (line.startsWith("---")) {
      elements.push(<hr key={i} className="my-4 border-gray-200" />);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-gray-700">{boldToHtml(line)}</p>,
      );
    }
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre key="last-code" className="bg-gray-100 rounded p-3 overflow-x-auto text-sm my-2">
        <code>{codeBuffer.join("\n")}</code>
      </pre>,
    );
  }

  return <div>{elements}</div>;
}
