'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  RefreshCw,
  User,
  Phone,
  Clock,
  Sparkles,
  UserCheck,
  CheckCheck,
  Bot,
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Shield,
  Zap,
} from 'lucide-react';

interface ChatConversation {
  patientId: string;
  patientName: string;
  phone: string;
  cpf?: string | null;
  humanHandoff: boolean;
  humanHandoffAt?: string | null;
  totalMessages: number;
  lastMessage?: {
    id: string;
    role: string;
    content: string;
    createdAt: string;
  } | null;
  lastActivityAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
}

interface ChatLiveInboxProps {
  initialPatientId?: string;
  onClose?: () => void;
}

export default function ChatLiveInbox({ initialPatientId, onClose }: ChatLiveInboxProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId || null);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'human' | 'ai'>('all');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [togglingHandoff, setTogglingHandoff] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Formatar telefone para padrão BR
  const formatPhoneBR = (phone?: string | null) => {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    const local = clean.startsWith('55') && clean.length >= 12 ? clean.slice(2) : clean;
    if (local.length === 11) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    } else if (local.length === 10) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    }
    return phone;
  };

  // Carregar lista de conversas
  const fetchConversations = async (silent = false) => {
    try {
      if (!silent) setLoadingList(true);
      const res = await fetch('/api/chat', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        // Se não tiver selecionado nenhum e tiver conversas, seleciona a primeira
        if (!selectedPatientId && data.conversations.length > 0 && !initialPatientId) {
          setSelectedPatientId(data.conversations[0].patientId);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar conversas:', err);
    } finally {
      if (!silent) setLoadingList(false);
    }
  };

  // Carregar mensagens da conversa selecionada
  const fetchMessages = async (patientId: string, silent = false) => {
    try {
      if (!silent) setLoadingMessages(true);
      const res = await fetch(`/api/chat?patientId=${patientId}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setSelectedPatient(data.patient);
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchMessages(selectedPatientId);
    }
  }, [selectedPatientId]);

  // Polling suave a cada 3 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      fetchConversations(true);
      if (selectedPatientId) {
        fetchMessages(selectedPatientId, true);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [selectedPatientId]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Filtragem de conversas
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const matchSearch =
        c.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        (c.lastMessage?.content || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;
      if (filterMode === 'human') return c.humanHandoff;
      if (filterMode === 'ai') return !c.humanHandoff;
      return true;
    });
  }, [conversations, searchQuery, filterMode]);

  // Enviar mensagem manual da secretária
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPatientId || !inputText.trim() || sending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          text: textToSend,
        }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) => [...prev, data.message]);
        if (selectedPatient) {
          setSelectedPatient({ ...selectedPatient, humanHandoff: true });
        }
        // Atualiza conversa na lista
        setConversations((prev) =>
          prev.map((c) =>
            c.patientId === selectedPatientId
              ? {
                  ...c,
                  humanHandoff: true,
                  lastMessage: {
                    id: data.message.id,
                    role: 'assistant',
                    content: textToSend,
                    createdAt: new Date().toISOString(),
                  },
                  lastActivityAt: new Date().toISOString(),
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Alternar Human Handoff (Ligar / Desligar Sofia)
  const handleToggleHandoff = async () => {
    if (!selectedPatientId || togglingHandoff) return;

    const newHandoff = !selectedPatient?.humanHandoff;
    setTogglingHandoff(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          humanHandoff: newHandoff,
        }),
      });
      const data = await res.json();
      if (data.success && data.patient) {
        setSelectedPatient((prev: any) => ({ ...prev, humanHandoff: newHandoff }));
        setConversations((prev) =>
          prev.map((c) => (c.patientId === selectedPatientId ? { ...c, humanHandoff: newHandoff } : c))
        );
      }
    } catch (err) {
      console.error('Erro ao alternar transbordo:', err);
    } finally {
      setTogglingHandoff(false);
    }
  };

  // Enviar resposta rápida
  const handleQuickReply = (text: string) => {
    setInputText(text);
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row h-full min-h-[580px] overflow-hidden">
      {/* =========================================================================
          COLUNA ESQUERDA: LISTA DE CONVERSAS (INBOX)
      ========================================================================= */}
      <div
        className={`w-full md:w-80 lg:w-96 border-r border-slate-200/80 flex flex-col bg-slate-50/50 ${
          selectedPatientId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* CABEÇALHO DO INBOX */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200/70 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Central de Atendimento</h3>
                <p className="text-[11px] text-slate-500 font-medium">WhatsApp Oficial da Clínica</p>
              </div>
            </div>
            <button
              onClick={() => fetchConversations()}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* BUSCA */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou mensagem..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium transition"
            />
          </div>

          {/* FILTROS (TODOS, HUMANO, IA) */}
          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100 text-[11px] font-bold">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg transition ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todos ({conversations.length})
            </button>
            <button
              onClick={() => setFilterMode('human')}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                filterMode === 'human'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-amber-700 bg-amber-50 hover:bg-amber-100/80'
              }`}
            >
              <User className="w-3 h-3" />
              <span>Humano ({conversations.filter((c) => c.humanHandoff).length})</span>
            </button>
            <button
              onClick={() => setFilterMode('ai')}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                filterMode === 'ai'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80'
              }`}
            >
              <Bot className="w-3 h-3" />
              <span>Sofia IA ({conversations.filter((c) => !c.humanHandoff).length})</span>
            </button>
          </div>
        </div>

        {/* LISTA DE CONVERSAS */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingList && conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-500 mb-2" />
              Carregando conversas do WhatsApp...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              Nenhuma conversa localizada com este filtro.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.patientId === selectedPatientId;
              const timeStr = conv.lastMessage
                ? new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <button
                  key={conv.patientId}
                  onClick={() => setSelectedPatientId(conv.patientId)}
                  className={`w-full p-3 text-left transition flex items-start gap-3 relative ${
                    isSelected ? 'bg-white shadow-2xs' : 'hover:bg-white/80'
                  }`}
                >
                  {/* INDICADOR SELECIONADO */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600 rounded-r"></div>
                  )}

                  {/* AVATAR */}
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                      conv.humanHandoff
                        ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300/60'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {conv.patientName ? conv.patientName.slice(0, 2).toUpperCase() : 'PA'}
                  </div>

                  {/* CONTEÚDO */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{conv.patientName}</h4>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">{timeStr}</span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate line-clamp-1">
                      {conv.lastMessage?.role === 'assistant' ? (
                        <span className="text-emerald-700 font-semibold">Você: </span>
                      ) : null}
                      {conv.lastMessage?.content || 'Iniciando atendimento...'}
                    </p>

                    <div className="flex items-center gap-1.5 mt-1.5">
                      {conv.humanHandoff ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 text-[10px] font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Atendimento Humano
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold flex items-center gap-1">
                          <Bot className="w-2.5 h-2.5" />
                          Sofia Respondendo
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono">{formatPhoneBR(conv.phone)}</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* =========================================================================
          COLUNA DIREITA: JANELA DO CHAT ATIVO
      ========================================================================= */}
      <div
        className={`flex-1 flex flex-col bg-white ${
          !selectedPatientId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedPatient ? (
          <>
            {/* CABEÇALHO DO CHAT */}
            <div className="p-3 sm:p-4 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <button
                  onClick={() => setSelectedPatientId(null)}
                  className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/60"
                  title="Voltar para a lista"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                    selectedPatient.humanHandoff
                      ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {selectedPatient.name.slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{selectedPatient.name}</h3>
                    {selectedPatient.cpf && (
                      <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                        CPF: {selectedPatient.cpf}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{formatPhoneBR(selectedPatient.phone)}</span>
                  </p>
                </div>
              </div>

              {/* BOTÃO TRANSBORDO / TOGGLE DE SOFIA */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleToggleHandoff}
                  disabled={togglingHandoff}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95 ${
                    selectedPatient.humanHandoff
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                  title={
                    selectedPatient.humanHandoff
                      ? 'Clique para devolver a conversa para a Sofia IA'
                      : 'Clique para pausar a Sofia e assumir a conversa manualmente'
                  }
                >
                  {selectedPatient.humanHandoff ? (
                    <>
                      <User className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Pausar e</span> Devolver p/ Sofia
                    </>
                  ) : (
                    <>
                      <Bot className="w-3.5 h-3.5" />
                      <span>Assumir Chat</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* MENSAGEM DE STATUS DO TRANSBORDO */}
            {selectedPatient.humanHandoff && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
                <span className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  Atendimento humano ativo. A Sofia está pausada para este paciente.
                </span>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                  Manual
                </span>
              </div>
            )}

            {/* ÁREA DE MENSAGENS (ESTILO WHATSAPP) */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#efeae2]/30 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]">
              {loadingMessages && messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mr-1.5 text-emerald-600" />
                  Carregando histórico de mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                  <MessageSquare className="w-10 h-10 text-slate-300 mb-2 stroke-[1.5]" />
                  <p className="text-xs font-bold text-slate-600">Nenhuma mensagem registrada</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs">
                    Envie uma mensagem abaixo para iniciar a conversa com o paciente via WhatsApp oficial.
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isAssistant = m.role === 'assistant';
                  const isUser = m.role === 'user';
                  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  if (m.role === 'system' || m.role === 'tool') return null;

                  return (
                    <div
                      key={m.id}
                      className={`flex ${isAssistant ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-2xs relative text-xs leading-relaxed ${
                          isAssistant
                            ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-xs border border-emerald-200/50'
                            : 'bg-white text-slate-900 rounded-tl-xs border border-slate-200/80'
                        }`}
                      >
                        {/* IDENTIFICADOR DE QUEM FALOU */}
                        <div className="flex items-center justify-between gap-3 text-[10px] font-bold mb-1 opacity-70">
                          <span>{isAssistant ? 'Clínica / Secretária' : selectedPatient.name}</span>
                          <span className="font-mono">{time}</span>
                        </div>

                        {/* CONTEÚDO DA MENSAGEM */}
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>

                        {/* STATUS VISUAL */}
                        {isAssistant && (
                          <div className="flex justify-end mt-1 text-emerald-700">
                            <CheckCheck className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* RESPOSTAS RÁPIDAS DA SECRETÁRIA */}
            <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0 no-scrollbar">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-500" />
                Respostas Rápidas:
              </span>
              <button
                onClick={() => handleQuickReply('Olá! Como posso ajudar você hoje? 😊')}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 hover:text-emerald-700 transition shrink-0"
              >
                Olá, como posso ajudar?
              </button>
              <button
                onClick={() => handleQuickReply('Sua consulta está confirmada na nossa agenda médica! Aguardamos você. 👍')}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 hover:text-emerald-700 transition shrink-0"
              >
                Consulta confirmada
              </button>
              <button
                onClick={() =>
                  handleQuickReply(
                    'Vou consultar a equipe médica sobre sua solicitação e retorno em instantes com uma resposta!'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 hover:text-emerald-700 transition shrink-0"
              >
                Consultar equipe
              </button>
              <button
                onClick={() =>
                  handleQuickReply(
                    '📍 Localização do consultório: Temos estacionamento conveniado no próprio prédio e valet nas proximidades.'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 hover:text-emerald-700 transition shrink-0"
              >
                Como Chegar e Estacionamento
              </button>
            </div>

            {/* CAMPO DE DIGITAÇÃO E ENVIO */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Digite uma mensagem para o paciente (Shift+Enter para pular linha)..."
                className="flex-1 max-h-32 min-h-[42px] px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-medium text-slate-900"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="h-[42px] px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 shrink-0 active:scale-95"
                title="Enviar mensagem pelo WhatsApp"
              >
                <Send className={`w-3.5 h-3.5 ${sending ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{sending ? 'Enviando...' : 'Enviar'}</span>
              </button>
            </form>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50/40">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100/60 text-emerald-700 flex items-center justify-center mb-3">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-extrabold text-slate-800">Selecione uma conversa ao lado</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Converse em tempo real com seus pacientes pelo WhatsApp oficial, pause a Sofia ou assuma o atendimento com um clique.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
