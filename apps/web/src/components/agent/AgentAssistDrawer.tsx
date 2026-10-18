"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Sparkles, User, ShieldCheck, CheckCircle2 } from "lucide-react";
import { sendAgentMessage } from "@/hooks/useAirQuality";

interface AgentAssistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cityContext: string;
  cityName: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// BỘ PARSER & RENDER MARKDOWN CHUYÊN BIỆT — LOẠI BỎ TRIỆT ĐỂ DẤU **
function FormattedMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");

  const parseInline = (text: string) => {
    // Tách các đoạn **in đậm** thành thẻ strong, loại bỏ dấu **
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-bold text-white tracking-wide">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-neutral-200 font-sans">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Tiêu đề ###
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-sm text-sky-400 mt-2 mb-1 flex items-center space-x-1.5">
              <span>{parseInline(trimmed.replace(/^###\s+/, ""))}</span>
            </h4>
          );
        }

        // Danh sách gạch đầu dòng * hoặc -
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          const itemText = trimmed.replace(/^[\*\-]\s+/, "");
          return (
            <div key={idx} className="flex items-start space-x-2 pl-1 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1 text-neutral-300">{parseInline(itemText)}</div>
            </div>
          );
        }

        // Đoạn văn thông thường
        return <p key={idx}>{parseInline(line)}</p>;
      })}
    </div>
  );
}

export default function AgentAssistDrawer({
  isOpen,
  onClose,
  cityContext,
  cityName,
}: AgentAssistDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Chào bạn! Tôi là người bạn đồng hành theo dõi không khí tại **${cityName}**.\n\nHôm nay bạn cần tôi chia sẻ thông tin gì nào?\n- 🏃 **Mấy giờ chạy bộ hoặc tập thể dục ngoài trời là thoáng đãng nhất**\n- 🏠 **Hôm nay có nên mở cửa đón gió hay cần đeo khẩu trang khi ra đường**\n- 🔮 **Dự báo chiều tối nay không khí có dễ chịu hơn không**`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([
    `Hôm nay chạy bộ ở ${cityName} lúc mấy giờ tốt nhất?`,
    "Hôm nay ra đường có cần đeo khẩu trang không?",
    "Dự báo chiều tối nay thế nào?",
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!isOpen) return null;

  async function handleSend(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await sendAgentMessage(newMessages, cityContext);
      setMessages([...newMessages, { role: "assistant", content: res.reply }]);
      if (res.suggested_actions && res.suggested_actions.length > 0) {
        setSuggestedActions(res.suggested_actions);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "Xin lỗi bạn, đường truyền kết nối AI đang tạm thời gián đoạn. Bạn thử bấm lại hoặc chọn các câu hỏi gợi ý bên dưới giúp tôi nhé.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[450px] bg-slate-950/95 backdrop-blur-2xl border-l border-neutral-800 shadow-2xl flex flex-col transition-all duration-300 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800/80 bg-neutral-900/40">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-neutral-800 border border-neutral-700 text-sky-400 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Trợ lý AirSense AI</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-neutral-800 text-sky-400 border border-neutral-700">
                Gemini AI
              </span>
            </h2>
            <p className="text-[11px] text-neutral-400">Đồng hành cùng sức khỏe & không khí sạch ({cityName})</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition"
          aria-label="Đóng bảng chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start space-x-2.5 ${
              m.role === "user" ? "flex-row-reverse space-x-reverse" : ""
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs ${
                m.role === "user"
                  ? "bg-sky-500 text-neutral-950 font-bold"
                  : "bg-neutral-900 text-sky-400 border border-neutral-800"
              }`}
            >
              {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-sky-600 text-white rounded-tr-none shadow-md"
                  : "bg-neutral-900/90 border border-neutral-800 rounded-tl-none shadow-md"
              }`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : (
                <FormattedMarkdown content={m.content} />
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-xs text-neutral-400 p-2">
            <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <span>AI đang tổng hợp số liệu quan trắc thời gian thực...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Pills */}
      <div className="px-4 py-2.5 bg-neutral-950/60 border-t border-neutral-800/60">
        <p className="text-[10px] font-semibold text-neutral-400 mb-1.5 flex items-center space-x-1">
          <Sparkles className="w-3 h-3 text-sky-400" />
          <span>Gợi ý câu hỏi nhanh:</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {suggestedActions.map((act, i) => (
            <button
              key={i}
              onClick={() => handleSend(act)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition text-left"
            >
              {act}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-neutral-950 border-t border-neutral-800 flex items-center space-x-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Hỏi về chất lượng không khí tại ${cityName}...`}
          disabled={isLoading}
          className="flex-1 px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-700 transition"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Gửi tin nhắn"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
