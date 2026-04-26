import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  BookOpen,
  Bot,
  CloudSun,
  HelpCircle,
  Keyboard,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  RotateCcw,
  Send,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  Wrench,
  User
} from "lucide-react";
import type { ChatMessage, ChatOptions, ChatRequest, ChatStreamEvent, HealthResponse } from "../../shared/types";

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type AppSettings = {
  model: string;
  systemPrompt: string;
  temperature: number;
};

type Status = {
  tone: "idle" | "ok" | "warn" | "error";
  text: string;
};

type WorkspaceView = "chat" | "help";

const CONVERSATIONS_KEY = "chatgemma.conversations.v1";
const ACTIVE_CONVERSATION_KEY = "chatgemma.activeConversation.v1";
const SETTINGS_KEY = "chatgemma.settings.v1";

const defaultSettings: AppSettings = {
  model: "gemma4:latest",
  systemPrompt: "あなたは日本語で簡潔かつ正確に答えるローカルAIアシスタントです。",
  temperature: 0.7
};

function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeConversationId, setActiveConversationId] = useState<string>(() => loadActiveId());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Ollama 接続を確認中" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (!activeConversation && conversations.length === 0) {
      const conversation = createConversation();
      setConversations([conversation]);
      setActiveConversationId(conversation.id);
    }
  }, [activeConversation, conversations.length]);

  useEffect(() => {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversation?.id) {
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, activeConversation.id);
    }
  }, [activeConversation?.id]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    void refreshHealth();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages, isGenerating]);

  async function refreshHealth() {
    try {
      const response = await fetch("/api/health");
      const health = (await response.json()) as HealthResponse;

      if (health.ok) {
        setStatus({ tone: "ok", text: `${health.model} に接続済み` });
        return;
      }

      if (health.ollama.reachable) {
        setStatus({
          tone: "warn",
          text: `${health.model} が Ollama に見つかりません`
        });
        return;
      }

      setStatus({ tone: "error", text: "Ollama に接続できません" });
    } catch {
      setStatus({ tone: "error", text: "API サーバーに接続できません" });
    }
  }

  function startNewConversation() {
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setWorkspaceView("chat");
    setInput("");
  }

  function deleteConversation(id: string) {
    setConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== id);

      if (id === activeConversationId) {
        const fallback = next[0] ?? createConversation();
        setActiveConversationId(fallback.id);
        return next.length > 0 ? next : [fallback];
      }

      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const content = input.trim();
    if (!content || isGenerating || !activeConversation) {
      return;
    }

    setInput("");
    await sendMessages(activeConversation, [
      ...activeConversation.messages,
      createMessage("user", content)
    ]);
  }

  async function retryLastMessage() {
    if (!activeConversation || isGenerating) {
      return;
    }

    const messages = [...activeConversation.messages];
    if (messages[messages.length - 1]?.role === "assistant") {
      messages.pop();
    }

    if (!messages.some((message) => message.role === "user")) {
      return;
    }

    await sendMessages(activeConversation, messages);
  }

  async function sendMessages(conversation: Conversation, nextMessages: ChatMessage[]) {
    const assistantMessage = createMessage("assistant", "");
    const conversationId = conversation.id;
    const messagesWithPlaceholder = [...nextMessages, assistantMessage];

    setIsGenerating(true);
    setStatus({ tone: "idle", text: "Gemma4 が生成中" });
    updateConversation(conversationId, messagesWithPlaceholder);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const request: ChatRequest = {
        conversationId,
        model: settings.model,
        messages: buildPromptMessages(nextMessages, settings.systemPrompt),
        options: { temperature: settings.temperature } satisfies ChatOptions
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        const details = await response.text();
        throw new Error(details || `API returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          assistantContent = handleStreamLine(conversationId, assistantMessage.id!, line, assistantContent);
        }
      }

      if (buffer.trim()) {
        assistantContent = handleStreamLine(conversationId, assistantMessage.id!, buffer, assistantContent);
      }

      updateAssistantMessage(conversationId, assistantMessage.id!, assistantContent.trim() || "応答が空でした。");
      setStatus({ tone: "ok", text: `${settings.model} に接続済み` });
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      updateAssistantMessage(
        conversationId,
        assistantMessage.id!,
        aborted ? "生成を停止しました。" : `エラー: ${getErrorMessage(error)}`
      );
      setStatus({ tone: aborted ? "warn" : "error", text: aborted ? "生成を停止しました" : "生成に失敗しました" });
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }

  function stopGenerating() {
    abortRef.current?.abort();
  }

  function updateConversation(id: string, messages: ChatMessage[]) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              title: getConversationTitle(messages),
              messages,
              updatedAt: new Date().toISOString()
            }
          : conversation
      )
    );
  }

  function updateAssistantMessage(conversationId: string, messageId: string, content: string) {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const messages = conversation.messages.map((message) =>
          message.id === messageId ? { ...message, content } : message
        );

        return {
          ...conversation,
          title: getConversationTitle(messages),
          messages,
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  function handleStreamLine(conversationId: string, assistantMessageId: string, line: string, currentContent: string) {
    const event = parseStreamEvent(line);

    if (!event) {
      const nextContent = currentContent + line;
      updateAssistantMessage(conversationId, assistantMessageId, nextContent);
      return nextContent;
    }

    if (event.type === "content") {
      const nextContent = currentContent + event.content;
      updateAssistantMessage(conversationId, assistantMessageId, nextContent);
      return nextContent;
    }

    if (event.type === "tool_call") {
      upsertToolMessage(conversationId, assistantMessageId, {
        id: event.call.id,
        role: "tool",
        toolName: event.call.name,
        content: `${event.call.name} を実行中...\narguments: ${JSON.stringify(event.call.arguments)}`
      });
      return currentContent;
    }

    if (event.type === "tool_result") {
      upsertToolMessage(conversationId, assistantMessageId, {
        id: event.result.callId,
        role: "tool",
        toolName: event.result.name,
        content: event.result.ok
          ? formatToolResult(event.result.content)
          : `ツール実行に失敗しました: ${event.result.error ?? "Unknown error"}`
      });
      return currentContent;
    }

    const nextContent = currentContent + `\nエラー: ${event.error}`;
    updateAssistantMessage(conversationId, assistantMessageId, nextContent);
    return nextContent;
  }

  function upsertToolMessage(conversationId: string, assistantMessageId: string, toolMessage: ChatMessage) {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const existingIndex = conversation.messages.findIndex((message) => message.id === toolMessage.id);

        if (existingIndex >= 0) {
          const messages = conversation.messages.map((message, index) =>
            index === existingIndex ? { ...message, ...toolMessage } : message
          );

          return { ...conversation, messages, updatedAt: new Date().toISOString() };
        }

        const assistantIndex = conversation.messages.findIndex((message) => message.id === assistantMessageId);
        const insertIndex = assistantIndex >= 0 ? assistantIndex : conversation.messages.length;
        const messages = [
          ...conversation.messages.slice(0, insertIndex),
          { ...toolMessage, createdAt: new Date().toISOString() },
          ...conversation.messages.slice(insertIndex)
        ];

        return { ...conversation, messages, updatedAt: new Date().toISOString() };
      })
    );
  }

  const canRetry = activeConversation?.messages.some((message) => message.role === "user") ?? false;

  return (
    <main className={`app-shell ${sidebarOpen ? "is-sidebar-open" : "is-sidebar-collapsed"}`}>
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">Local LLM</p>
            <h1>chatGemma</h1>
          </div>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="会話一覧を閉じる">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button className="new-chat-button" onClick={startNewConversation}>
          <MessageSquarePlus size={18} />
          New chat
        </button>

        <nav className="conversation-list" aria-label="会話一覧">
          {conversations.map((conversation) => (
            <button
      key={conversation.id}
              className={`conversation-item ${
                workspaceView === "chat" && conversation.id === activeConversation?.id ? "is-active" : ""
              }`}
              onClick={() => {
                setActiveConversationId(conversation.id);
                setWorkspaceView("chat");
                setSidebarOpen(false);
              }}
            >
              <span>{conversation.title}</span>
              <small>{formatDate(conversation.updatedAt)}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`help-button ${workspaceView === "help" ? "is-active" : ""}`}
            onClick={() => {
              setWorkspaceView("help");
              setSidebarOpen(false);
            }}
          >
            <HelpCircle size={18} />
            <span>Help</span>
          </button>
        </div>
      </aside>

      <section className="chat-workspace">
        <header className="topbar">
          <button
            className="icon-button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "会話一覧を閉じる" : "会話一覧を開く"}
            aria-pressed={sidebarOpen}
          >
            <Menu size={20} />
          </button>

          <div className="status-group">
            <span className={`status-dot ${status.tone}`} />
            <span>{status.text}</span>
          </div>

          <div className="topbar-actions">
            <button className="icon-button" onClick={() => void refreshHealth()} aria-label="接続を再確認">
              <RotateCcw size={18} />
            </button>
            <button className="icon-button" onClick={() => setSettingsOpen((open) => !open)} aria-label="設定">
              <Settings size={18} />
            </button>
          </div>
        </header>

        {workspaceView === "help" ? (
          <HelpPage />
        ) : (
          <>
            <div className="conversation-surface">
              {activeConversation && activeConversation.messages.length > 0 ? (
                <div className="message-list">
                  {activeConversation.messages.map((message) => (
                    <article key={message.id} className={`message-row ${message.role}`}>
                      <div className="avatar" aria-hidden="true">
                    {message.role === "user" ? (
                      <User size={17} />
                    ) : message.role === "tool" ? (
                      <CloudSun size={17} />
                    ) : (
                      <Bot size={17} />
                    )}
                  </div>
                  <div className="message-body">
                    {message.role !== "user" ? (
                      <div className="message-meta">{message.role === "tool" ? `Tool: ${message.toolName}` : "Gemma4"}</div>
                    ) : null}
                    <MarkdownMessage content={message.content || (message.role === "assistant" && isGenerating ? "生成中..." : "")} />
                  </div>
                </article>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="empty-state">
                  <Bot size={40} />
                  <h2>Gemma4 と会話を始める</h2>
                  <p>ローカルの Ollama モデルに接続して、日本語でそのまま質問できます。</p>
                </div>
              )}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <div className="composer-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={retryLastMessage}
                  disabled={!canRetry || isGenerating}
                >
                  <RotateCcw size={16} />
                  再送信
                </button>
                {activeConversation && activeConversation.messages.length > 0 ? (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => deleteConversation(activeConversation.id)}
                    disabled={isGenerating}
                  >
                    <Trash2 size={16} />
                    削除
                  </button>
                ) : null}
              </div>

              <div className="input-row">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmit(event);
                    }
                  }}
                  placeholder="Gemma4 にメッセージを送信"
                  rows={1}
                  disabled={isGenerating}
                />
                {isGenerating ? (
                  <button type="button" className="send-button" onClick={stopGenerating} aria-label="生成を停止">
                    <Square size={18} />
                  </button>
                ) : (
                  <button type="submit" className="send-button" disabled={!input.trim()} aria-label="送信">
                    <Send size={18} />
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </section>

      <aside className={`settings-panel ${settingsOpen ? "is-open" : ""}`}>
        <div className="settings-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Model controls</h2>
          </div>
          <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="設定を閉じる">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <label className="field">
          <span>Model</span>
          <input
            value={settings.model}
            onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}
          />
        </label>

        <label className="field">
          <span>Temperature: {settings.temperature.toFixed(1)}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(event) =>
              setSettings((current) => ({ ...current, temperature: Number(event.target.value) }))
            }
          />
        </label>

        <label className="field">
          <span>System prompt</span>
          <textarea
            value={settings.systemPrompt}
            onChange={(event) => setSettings((current) => ({ ...current, systemPrompt: event.target.value }))}
            rows={8}
          />
        </label>

        <div className="tooling-note">
          <AlertCircle size={18} />
          <p>Tool Calling の型は共有層に用意済みです。実行ループは次フェーズで追加します。</p>
        </div>
      </aside>
    </main>
  );
}

function HelpPage() {
  return (
    <div className="help-surface">
      <section className="help-hero">
        <p className="eyebrow">Help</p>
        <h2>chatGemma の使い方</h2>
        <p>
          chatGemma は Ollama 上の Gemma4 と会話するためのローカルチャット画面です。
          会話履歴はこのブラウザに保存されます。
        </p>
      </section>

      <section className="help-section" aria-labelledby="help-start">
        <div className="help-section-heading">
          <BookOpen size={20} />
          <h3 id="help-start">基本操作</h3>
        </div>
        <ol className="help-steps">
          <li>左側の New chat で新しい会話を作成します。</li>
          <li>画面下の入力欄に質問を書き、送信ボタンまたは Enter で送信します。</li>
          <li>生成中は停止ボタンで応答を中断できます。</li>
          <li>必要に応じて再送信で直近の回答を作り直します。</li>
        </ol>
      </section>

      <section className="help-section" aria-labelledby="help-features">
        <div className="help-section-heading">
          <SlidersHorizontal size={20} />
          <h3 id="help-features">現在使える機能</h3>
        </div>
        <div className="feature-list">
          <p>会話一覧から履歴を切り替えられます。</p>
          <p>会話履歴と設定はブラウザに自動保存されます。</p>
          <p>設定から model、temperature、system prompt を調整できます。</p>
          <p>Ollama 接続状態は上部バーで確認できます。</p>
        </div>
      </section>

      <section className="help-section" aria-labelledby="help-shortcuts">
        <div className="help-section-heading">
          <Keyboard size={20} />
          <h3 id="help-shortcuts">入力の操作</h3>
        </div>
        <dl className="shortcut-list">
          <div>
            <dt>Enter</dt>
            <dd>メッセージを送信します。</dd>
          </div>
          <div>
            <dt>Shift + Enter</dt>
            <dd>入力欄で改行します。</dd>
          </div>
        </dl>
      </section>

      <section className="help-section" aria-labelledby="help-next">
        <div className="help-section-heading">
          <Wrench size={20} />
          <h3 id="help-next">今後追加予定の拡張</h3>
        </div>
        <p className="help-copy">
          Function Calling / Tool Calling 用の型はすでに共有層にあります。
          次フェーズではツール定義、実行ログ、AI エージェント風の実行ループを追加できます。
        </p>
      </section>
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown remarkPlugins={[remarkGfm, relaxedStrongPlugin]}>{content}</ReactMarkdown>
    </div>
  );
}

function loadConversations(): Conversation[] {
  const raw = localStorage.getItem(CONVERSATIONS_KEY);

  if (!raw) {
    return [createConversation()];
  }

  try {
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.length > 0 ? parsed : [createConversation()];
  } catch {
    return [createConversation()];
  }
}

function loadActiveId() {
  return localStorage.getItem(ACTIVE_CONVERSATION_KEY) ?? "";
}

function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);

  if (!raw) {
    return defaultSettings;
  }

  try {
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaultSettings;
  }
}

function createConversation(): Conversation {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function buildPromptMessages(messages: ChatMessage[], systemPrompt: string): ChatMessage[] {
  const trimmedSystemPrompt = systemPrompt.trim();

  if (!trimmedSystemPrompt) {
    return messages;
  }

  return [
    {
      role: "system",
      content: trimmedSystemPrompt
    },
    ...messages
  ];
}

function getConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();

  if (!firstUserMessage) {
    return "New chat";
  }

  return firstUserMessage.length > 34 ? `${firstUserMessage.slice(0, 34)}...` : firstUserMessage;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseStreamEvent(line: string): ChatStreamEvent | null {
  try {
    return JSON.parse(line) as ChatStreamEvent;
  } catch {
    return null;
  }
}

function relaxedStrongPlugin() {
  return (tree: MarkdownNode) => {
    rewriteStrongText(tree);
  };
}

type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
};

function rewriteStrongText(node: MarkdownNode) {
  if (!node.children) {
    return;
  }

  node.children = node.children.flatMap((child) => {
    if (child.type === "text" && typeof child.value === "string") {
      return splitRelaxedStrongText(child.value);
    }

    rewriteStrongText(child);
    return [child];
  });
}

function splitRelaxedStrongText(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  const strongPattern = /\*\*\s*([^*\n]+?)\s*\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = strongPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    nodes.push({
      type: "strong",
      children: [{ type: "text", value: match[1] }]
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}

function formatToolResult(content: string) {
  try {
    const weather = JSON.parse(content) as {
      location?: string;
      observedAt?: string;
      temperatureCelsius?: number;
      windSpeedKmh?: number;
      windDirectionDegrees?: number;
      condition?: string;
    };

    return [
      `${weather.location ?? "Location"} の現在天気を取得しました。`,
      `観測時刻: ${weather.observedAt ?? "unknown"}`,
      `気温: ${weather.temperatureCelsius ?? "unknown"} ℃`,
      `状態: ${weather.condition ?? "unknown"}`,
      `風速: ${weather.windSpeedKmh ?? "unknown"} km/h`,
      `風向: ${weather.windDirectionDegrees ?? "unknown"}°`
    ].join("\n");
  } catch {
    return content;
  }
}

export default App;
