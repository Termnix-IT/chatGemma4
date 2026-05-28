import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  Bot,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Copy,
  HelpCircle,
  Keyboard,
  Menu,
  MessageSquarePlus,
  Moon,
  Pencil,
  PanelLeftClose,
  Pin,
  RotateCcw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  User,
  Wrench,
  X
} from "lucide-react";
import type {
  AgentToolSummary,
  AgentToolsResponse,
  ChatMessage,
  ChatMode,
  ChatOptions,
  ChatRequest,
  ChatStreamEvent,
  HealthResponse
} from "../../shared/types";

type Conversation = {
  id: string;
  title: string;
  titleEdited: boolean;
  mode: ChatMode;
  messages: ChatMessage[];
  pinned: boolean;
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
const THEME_KEY = "chatgemma.theme.v1";

type Theme = "light" | "dark";
const MASCOT_IDLE_DELAY_MS = 20_000;
const MASCOT_AVATAR_SHEET_SRC = "/mascot/bunny-bot-sheet.png";
const MASCOT_CHAT_JUMP_SHEET_SRC = "/mascot/bunny-bot-chat-jump-sheet.png";
const MASCOT_MAIN_SRC = "/mascot/bunny-bot-main.png";

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
  const [conversationSearch, setConversationSearch] = useState("");
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Ollama 接続を確認中" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentTools, setAgentTools] = useState<AgentToolSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const [isMascotIdle, setIsMascotIdle] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const markActivity = useCallback(() => {
    setLastActivityAt(Date.now());
    setIsMascotIdle(false);
  }, []);

  const activeConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  }, [activeConversationId, conversations]);

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    const matched = !query
      ? conversations
      : conversations.filter((conversation) => {
          const searchableText = [
            conversation.title,
            conversation.mode,
            ...conversation.messages.map((message) => message.content)
          ]
            .join("\n")
            .toLowerCase();

          return searchableText.includes(query);
        });

    return [...matched].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [conversationSearch, conversations]);

  const conversationGroups = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

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
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void refreshHealth();
    void refreshAgentTools();
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", markActivity);
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("touchstart", markActivity);

    return () => {
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("touchstart", markActivity);
    };
  }, [markActivity]);

  useEffect(() => {
    if (workspaceView !== "chat" || isGenerating) {
      setIsMascotIdle(false);
      return;
    }

    const timerId = window.setTimeout(() => {
      setIsMascotIdle(true);
    }, MASCOT_IDLE_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [isGenerating, lastActivityAt, workspaceView]);

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

  async function refreshAgentTools() {
    try {
      const response = await fetch("/api/tools");
      const data = (await response.json()) as AgentToolsResponse;
      setAgentTools(data.tools);
    } catch {
      setAgentTools([]);
    }
  }

  function startNewConversation() {
    markActivity();
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setWorkspaceView("chat");
    setInput("");
  }

  function updateConversationMode(id: string, mode: ChatMode) {
    markActivity();
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              mode,
              updatedAt: new Date().toISOString()
            }
          : conversation
      )
    );
  }

  function beginTitleEdit(conversation: Conversation) {
    markActivity();
    setEditingConversationId(conversation.id);
    setEditingTitle(conversation.title);
  }

  function cancelTitleEdit() {
    markActivity();
    setEditingConversationId(null);
    setEditingTitle("");
  }

  function saveTitleEdit() {
    markActivity();

    if (!editingConversationId) {
      return;
    }

    const title = editingTitle.trim() || "New chat";
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === editingConversationId
          ? {
              ...conversation,
              title,
              titleEdited: true,
              updatedAt: new Date().toISOString()
            }
          : conversation
      )
    );
    setEditingConversationId(null);
    setEditingTitle("");
  }

  function toggleConversationPinned(id: string) {
    markActivity();
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, pinned: !conversation.pinned } : conversation
      )
    );
  }

  function deleteConversation(id: string) {
    markActivity();
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
    markActivity();

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
    markActivity();

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
    markActivity();
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
        mode: conversation.mode ?? "chat",
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
    markActivity();
    abortRef.current?.abort();
  }

  function updateConversation(id: string, messages: ChatMessage[]) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              title: conversation.titleEdited ? conversation.title : getConversationTitle(messages),
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
          title: conversation.titleEdited ? conversation.title : getConversationTitle(messages),
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
        content: formatToolCall(event.call.name, event.call.arguments, event.call.startedAt)
      });
      return currentContent;
    }

    if (event.type === "tool_result") {
      upsertToolMessage(conversationId, assistantMessageId, {
        id: event.result.callId,
        role: "tool",
        toolName: event.result.name,
        content: event.result.ok
          ? formatToolResult(event.result.name, event.result.content, event.result)
          : formatToolFailure(event.result.name, event.result.error, event.result)
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

  const lastAssistantId = useMemo(() => {
    if (!activeConversation) {
      return null;
    }

    for (let i = activeConversation.messages.length - 1; i >= 0; i -= 1) {
      if (activeConversation.messages[i].role === "assistant") {
        return activeConversation.messages[i].id ?? null;
      }
    }

    return null;
  }, [activeConversation]);

  return (
    <main className={`app-shell ${sidebarOpen ? "is-sidebar-open" : "is-sidebar-collapsed"}`}>
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-header">
          <button
            className="sidebar-toggle desktop-only"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "サイドバーを折りたたむ" : "サイドバーを展開"}
            aria-expanded={sidebarOpen}
            title={sidebarOpen ? "折りたたむ" : "展開"}
          >
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="sidebar-header-text">
            <p className="eyebrow">Local LLM</p>
            <h1>chatGemma</h1>
          </div>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="サイドバーを閉じる">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button className="new-chat-button" onClick={startNewConversation} title="新しいチャット">
          <MessageSquarePlus size={18} />
          <span>New chat</span>
        </button>

        <label className="conversation-search">
          <Search size={16} />
          <input
            value={conversationSearch}
            onChange={(event) => {
              markActivity();
              setConversationSearch(event.target.value);
            }}
            placeholder="会話を検索"
          />
        </label>

        <nav className="conversation-list" aria-label="会話一覧">
          {filteredConversations.length > 0 ? (
            conversationGroups.map((group) => (
              <section className="conversation-group" key={group.label}>
                <h3 className="conversation-group-heading">{group.label}</h3>
                {group.items.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`conversation-item ${
                      workspaceView === "chat" && conversation.id === activeConversation?.id ? "is-active" : ""
                    } ${conversation.pinned ? "is-pinned" : ""}`}
                  >
                    {editingConversationId === conversation.id ? (
                  <div className="conversation-edit">
                    <input
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveTitleEdit();
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelTitleEdit();
                        }
                      }}
                      autoFocus
                      aria-label="会話タイトル"
                    />
                    <button type="button" onClick={saveTitleEdit} aria-label="タイトルを保存">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={cancelTitleEdit} aria-label="タイトル編集をキャンセル">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="conversation-select"
                      onClick={() => {
                        markActivity();
                        setActiveConversationId(conversation.id);
                        setWorkspaceView("chat");
                      }}
                    >
                      <span>{conversation.title}</span>
                      <small className="conversation-meta">
                        <span>{formatDate(conversation.updatedAt)}</span>
                        <span>{conversation.mode === "agent" ? "Agent" : "Chat"}</span>
                      </small>
                    </button>
                    <button
                      type="button"
                      className={`conversation-pin-button ${conversation.pinned ? "is-active" : ""}`}
                      onClick={() => toggleConversationPinned(conversation.id)}
                      aria-label={conversation.pinned ? "会話のピン留めを解除" : "会話をピン留め"}
                      title={conversation.pinned ? "ピン留めを解除" : "ピン留め"}
                    >
                      <Pin size={14} />
                    </button>
                    <button
                      type="button"
                      className="conversation-edit-button"
                      onClick={() => beginTitleEdit(conversation)}
                      aria-label="会話タイトルを編集"
                      title="タイトルを編集"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="conversation-delete-button"
                      onClick={() => deleteConversation(conversation.id)}
                      aria-label="会話を削除"
                      title="会話を削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                  </div>
                ))}
              </section>
            ))
          ) : (
            <p className="conversation-empty">一致する会話がありません</p>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`help-button ${workspaceView === "help" ? "is-active" : ""}`}
            onClick={() => {
              markActivity();
              setWorkspaceView("help");
            }}
          >
            <HelpCircle size={18} />
            <span>ヘルプ</span>
          </button>
        </div>
      </aside>

      <section className="chat-workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
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
            <button
              className="icon-button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
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
                  {activeConversation.messages.map((message) => {
                    const isAssistant = message.role === "assistant";
                    const isTool = message.role === "tool";
                    const isUser = message.role === "user";
                    const displayContent =
                      message.content || (isAssistant && isGenerating ? "生成中..." : "");

                    return (
                      <article key={message.id} className={`message-row ${message.role}`}>
                        <div className="avatar" aria-hidden="true">
                          {isUser ? (
                            <User size={15} />
                          ) : isTool ? (
                            <Wrench size={15} />
                          ) : (
                            <PixelMascot variant="avatar" />
                          )}
                        </div>
                        <div className="message-body">
                          {isTool ? (
                            <ToolBlock
                              toolName={message.toolName}
                              content={displayContent}
                            />
                          ) : (
                            <>
                              {isAssistant ? (
                                <div className="message-meta">Gemma4</div>
                              ) : null}
                              <MarkdownMessage content={displayContent} />
                              {isAssistant && message.content ? (
                                <div className="message-actions">
                                  <CopyButton text={message.content} />
                                  {message.id === lastAssistantId && canRetry && !isGenerating ? (
                                    <button
                                      type="button"
                                      className="message-action-button"
                                      onClick={retryLastMessage}
                                      aria-label="再生成"
                                      title="再生成"
                                    >
                                      <RotateCcw size={14} />
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="empty-state">
                  <PixelMascot variant="empty" />
                  <h2>Gemma4 と会話を始める</h2>
                  <p>ローカルの Ollama モデルに接続して、日本語でそのまま質問できます。</p>
                  <div className="suggestion-pills" role="list">
                    {getSuggestionPrompts(activeConversation?.mode ?? "chat").map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        role="listitem"
                        className="suggestion-pill"
                        onClick={() => {
                          markActivity();
                          setInput(prompt);
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  {activeConversation?.mode === "agent" && agentTools.length > 0 ? (
                    <div className="tool-chips" aria-label="利用可能なツール">
                      {agentTools.map((tool) => (
                        <span key={tool.name} className="tool-chip">
                          <Wrench size={12} />
                          {tool.displayName}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              {isMascotIdle ? (
                <div className="idle-mascot" aria-hidden="true">
                  <PixelMascot variant="idle" />
                </div>
              ) : null}
              <div className="composer-card">
                <textarea
                  value={input}
                  onChange={(event) => {
                    markActivity();
                    setInput(event.target.value);
                  }}
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
                <div className="composer-bottom">
                  {activeConversation ? (
                    <div className="mode-toggle" aria-label="チャットモード">
                      <button
                        type="button"
                        className={activeConversation.mode !== "agent" ? "is-active" : ""}
                        onClick={() => updateConversationMode(activeConversation.id, "chat")}
                        disabled={isGenerating}
                        aria-pressed={activeConversation.mode !== "agent"}
                      >
                        <MessageSquarePlus size={14} />
                        チャット
                      </button>
                      <button
                        type="button"
                        className={activeConversation.mode === "agent" ? "is-active" : ""}
                        onClick={() => updateConversationMode(activeConversation.id, "agent")}
                        disabled={isGenerating}
                        aria-pressed={activeConversation.mode === "agent"}
                      >
                        <Bot size={14} />
                        エージェント
                      </button>
                    </div>
                  ) : null}
                  <span className="composer-hint" aria-hidden="true">
                    Enter で送信 / Shift + Enter で改行
                  </span>
                  {isGenerating ? (
                    <button type="button" className="send-button" onClick={stopGenerating} aria-label="生成を停止">
                      <Square size={16} />
                    </button>
                  ) : (
                    <button type="submit" className="send-button" disabled={!input.trim()} aria-label="送信">
                      <Send size={16} />
                    </button>
                  )}
                </div>
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
          <small>Ollama に用意されているモデル名を指定します。変更後は上部の再確認ボタンで接続状態を確認できます。</small>
          <input
            value={settings.model}
            onChange={(event) => {
              markActivity();
              setSettings((current) => ({ ...current, model: event.target.value }));
            }}
          />
        </label>

        <label className="field">
          <span>Temperature: {settings.temperature.toFixed(1)}</span>
          <small>低いほど安定した回答になり、高いほど表現や発想の幅が広がります。普段使いは 0.7 前後が目安です。</small>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(event) => {
              markActivity();
              setSettings((current) => ({ ...current, temperature: Number(event.target.value) }));
            }}
          />
        </label>

        <label className="field">
          <span>System prompt</span>
          <small>回答の口調、役割、優先する方針を指定します。空にすると追加指示なしで会話します。</small>
          <textarea
            value={settings.systemPrompt}
            onChange={(event) => {
              markActivity();
              setSettings((current) => ({ ...current, systemPrompt: event.target.value }));
            }}
            rows={8}
          />
        </label>

        <div className="tooling-note">
          <AlertCircle size={18} />
          <div>
            <p>Tool Calling はエージェントモードでのみ有効です。通常チャットではツールを使わずに回答します。</p>
            <p>設定と会話履歴はこのブラウザの localStorage に保存されます。別のブラウザや端末には共有されません。</p>
          </div>
        </div>

        {agentTools.length > 0 ? (
          <section className="tool-list-panel" aria-labelledby="agent-tools-heading">
            <h3 id="agent-tools-heading">Agent tools</h3>
            <div className="tool-list">
              {agentTools.map((tool) => (
                <div key={tool.name} className="tool-list-item">
                  <strong>{tool.displayName}</strong>
                  <span>{tool.name}</span>
                  <p>{tool.description}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </main>
  );
}

function PixelMascot({ variant }: { variant: "avatar" | "empty" | "idle" }) {
  if (variant === "empty") {
    return (
      <span aria-hidden="true" className="pixel-mascot pixel-mascot-empty">
        <img src={MASCOT_MAIN_SRC} alt="" draggable={false} />
      </span>
    );
  }

  const source = variant === "idle" ? MASCOT_CHAT_JUMP_SHEET_SRC : MASCOT_AVATAR_SHEET_SRC;

  return (
    <span
      aria-hidden="true"
      className={`pixel-mascot pixel-mascot-sprite pixel-mascot-${variant}`}
      style={{ backgroundImage: `url(${source})` }}
    />
  );
}

function HelpPage() {
  return (
    <div className="help-surface">
      <section className="help-hero">
        <p className="eyebrow">ヘルプ</p>
        <h2>chatGemma の使い方</h2>
        <p>
          chatGemma は Ollama 上の Gemma4 と会話するためのローカルチャット画面です。
          会話履歴と設定はこのブラウザに保存されます。
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
          <p>会話タイトルは編集でき、検索欄でタイトルと本文を絞り込めます。</p>
          <p>会話履歴と設定はブラウザに自動保存されます。</p>
          <p>通常チャットではモデルとの会話だけを行います。</p>
          <p>エージェントモードでは日時、単位変換、現在天気、天気予報のツールを使えます。</p>
          <p>Ollama 接続状態は上部バーで確認できます。</p>
        </div>
      </section>

      <section className="help-section" aria-labelledby="help-settings">
        <div className="help-section-heading">
          <Settings size={20} />
          <h3 id="help-settings">Model controls</h3>
        </div>
        <div className="feature-list">
          <p>Model では Ollama で使用するモデル名を指定します。</p>
          <p>Temperature では回答の自由度を調整できます。低いほど安定し、高いほど多様になります。</p>
          <p>System prompt では会話全体に適用する振る舞いや回答方針を指定できます。</p>
          <p>変更した設定はブラウザに保存され、次回以降も引き継がれます。</p>
        </div>
      </section>

      <section className="help-section" aria-labelledby="help-modes">
        <div className="help-section-heading">
          <Bot size={20} />
          <h3 id="help-modes">チャットモードの違い</h3>
        </div>
        <div className="feature-list">
          <p>通常チャットは会話履歴と System prompt だけをモデルへ送り、ツールは使いません。</p>
          <p>エージェントモードは質問に応じて日時、単位変換、天気ツールを呼び出します。</p>
          <p>ツールを使った回答では、実行ログを開いて引数、結果、所要時間を確認できます。</p>
          <p>外部通信を伴う天気取得は Open-Meteo を使い、ファイル操作や shell 実行は行いません。</p>
        </div>
      </section>

      <section className="help-section" aria-labelledby="help-storage">
        <div className="help-section-heading">
          <MessageSquarePlus size={20} />
          <h3 id="help-storage">保存される内容</h3>
        </div>
        <p className="help-copy">
          会話履歴、選択中の会話、Model controls、テーマ設定はブラウザの localStorage に保存されます。
          サーバー側のデータベースやアカウント同期はありません。ブラウザのサイトデータを削除すると、保存済みの会話も消えます。
        </p>
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

      <section className="help-section" aria-labelledby="help-weather">
        <div className="help-section-heading">
          <CloudSun size={20} />
          <h3 id="help-weather">天気情報の取得</h3>
        </div>
        <p className="help-copy">
          エージェントモードで「東京の天気を教えて」や「明日の大阪の天気は？」のように場所を含めて質問すると、現在天気や日別予報を取得して表示します。
        </p>
      </section>
    </div>
  );
}

function ToolBlock({ toolName, content }: { toolName?: string; content: string }) {
  const label = `Tool: ${getToolLabel(toolName)}`;
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const summary = lines[0] ?? "実行中…";

  return (
    <details className="tool-details">
      <summary>
        <span className="tool-summary-text">
          <span className="message-meta">{label}</span>
          <span className="tool-summary-line">{summary}</span>
        </span>
        <ChevronDown size={16} className="tool-chevron" aria-hidden="true" />
      </summary>
      <div className="tool-details-body">
        <MarkdownMessage content={content} />
      </div>
    </details>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={`message-action-button ${copied ? "is-confirmed" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // クリップボード API が拒否された場合は無視
        }
      }}
      aria-label={copied ? "コピーしました" : "コピー"}
      title={copied ? "コピーしました" : "コピー"}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
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
    return parsed.length > 0 ? parsed.map(normalizeConversation) : [createConversation()];
  } catch {
    return [createConversation()];
  }
}

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    titleEdited: Boolean(conversation.titleEdited),
    mode: conversation.mode === "agent" ? "agent" : "chat",
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    pinned: Boolean(conversation.pinned)
  };
}

function loadActiveId() {
  return localStorage.getItem(ACTIVE_CONVERSATION_KEY) ?? "";
}

function loadTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);

  if (stored === "light" || stored === "dark") {
    return stored;
  }

  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
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
    titleEdited: false,
    mode: "chat",
    messages: [],
    pinned: false,
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

function groupConversationsByDate(conversations: Conversation[]): Array<{ label: string; items: Conversation[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const sevenDaysAgo = startOfToday - 6 * 86_400_000;

  const pinned: Conversation[] = [];
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const week: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conversation of conversations) {
    if (conversation.pinned) {
      pinned.push(conversation);
      continue;
    }

    const updated = new Date(conversation.updatedAt).getTime();

    if (updated >= startOfToday) {
      today.push(conversation);
    } else if (updated >= startOfYesterday) {
      yesterday.push(conversation);
    } else if (updated >= sevenDaysAgo) {
      week.push(conversation);
    } else {
      older.push(conversation);
    }
  }

  return [
    { label: "ピン留め", items: pinned },
    { label: "今日", items: today },
    { label: "昨日", items: yesterday },
    { label: "過去 7 日", items: week },
    { label: "それ以前", items: older }
  ].filter((group) => group.items.length > 0);
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

function getSuggestionPrompts(mode: ChatMode): string[] {
  if (mode === "agent") {
    return [
      "今の日時を教えて",
      "東京の天気を教えて",
      "明日の大阪の天気予報は？",
      "100kmはマイルでいくつ？"
    ];
  }

  return [
    "TypeScript と JavaScript の違いを簡単に教えて",
    "Python でフィボナッチ数列のコードを書いて",
    "短い俳句をひとつ作って",
    "美味しいパスタの作り方を教えて"
  ];
}

function getToolLabel(name?: string) {
  const labels: Record<string, string> = {
    get_current_datetime: "現在日時",
    convert_units: "単位変換",
    get_current_weather: "現在天気",
    get_weather_forecast: "天気予報"
  };

  return name ? labels[name] ?? name : "Unknown tool";
}

function formatToolCall(name: string, args: Record<string, unknown>, startedAt?: string) {
  const argumentText = Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : "{}";

  return [
    `${getToolLabel(name)} を実行中です。`,
    `開始: ${formatToolTimestamp(startedAt)}`,
    "arguments:",
    argumentText
  ].join("\n");
}

function formatToolResult(name: string, content: string, result: { completedAt?: string; durationMs?: number }) {
  const metadata = formatToolMetadata(result);
  let formattedContent = content;

  if (name === "get_current_datetime") {
    formattedContent = formatDatetimeToolResult(content);
  } else if (name === "convert_units") {
    formattedContent = formatUnitConversionToolResult(content);
  } else if (name === "get_current_weather") {
    formattedContent = formatWeatherToolResult(content);
  } else if (name === "get_weather_forecast") {
    formattedContent = formatWeatherForecastToolResult(content);
  }

  return [formattedContent, metadata].filter(Boolean).join("\n");
}

function formatToolFailure(
  name: string,
  error: string | undefined,
  result: { completedAt?: string; durationMs?: number }
) {
  return [
    `${getToolLabel(name)} の実行に失敗しました。`,
    `理由: ${error ?? "Unknown error"}`,
    formatToolMetadata(result)
  ]
    .filter(Boolean)
    .join("\n");
}

function formatToolMetadata(result: { completedAt?: string; durationMs?: number }) {
  return [
    `完了: ${formatToolTimestamp(result.completedAt)}`,
    typeof result.durationMs === "number" ? `所要時間: ${result.durationMs} ms` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function formatToolTimestamp(value?: string) {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDatetimeToolResult(content: string) {
  try {
    const datetime = JSON.parse(content) as {
      iso?: string;
      timeZone?: string;
      localized?: string;
    };

    return [
      "現在日時を取得しました。",
      `日時: ${datetime.localized ?? datetime.iso ?? "unknown"}`,
      `Timezone: ${datetime.timeZone ?? "unknown"}`
    ].join("\n");
  } catch {
    return content;
  }
}

function formatUnitConversionToolResult(content: string) {
  try {
    const conversion = JSON.parse(content) as {
      value?: number;
      fromUnit?: string;
      toUnit?: string;
      convertedValue?: number;
      roundedValue?: number;
    };

    return [
      "単位変換を実行しました。",
      `入力: ${conversion.value ?? "unknown"} ${conversion.fromUnit ?? ""}`.trim(),
      `結果: ${conversion.roundedValue ?? conversion.convertedValue ?? "unknown"} ${conversion.toUnit ?? ""}`.trim()
    ].join("\n");
  } catch {
    return content;
  }
}

function formatWeatherToolResult(content: string) {
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

function formatWeatherForecastToolResult(content: string) {
  try {
    const forecast = JSON.parse(content) as {
      location?: string;
      days?: Array<{
        date?: string;
        dateLabel?: string;
        weekday?: string;
        maxTemperatureCelsius?: number;
        minTemperatureCelsius?: number;
        precipitationProbabilityPercent?: number;
        condition?: string;
      }>;
    };

    const lines = [`${forecast.location ?? "Location"} の天気予報を取得しました。`];

    for (const day of forecast.days ?? []) {
      const fallbackDateLabel = [day.date, day.weekday].filter(Boolean).join(" ");
      const dateLabel = day.dateLabel ?? (fallbackDateLabel || "unknown");

      lines.push(
        [
          dateLabel,
          `最高 ${day.maxTemperatureCelsius ?? "unknown"} ℃`,
          `最低 ${day.minTemperatureCelsius ?? "unknown"} ℃`,
          `降水確率 ${day.precipitationProbabilityPercent ?? "unknown"}%`,
          day.condition ?? "unknown"
        ].join(" / ")
      );
    }

    return lines.join("\n");
  } catch {
    return content;
  }
}

export default App;
