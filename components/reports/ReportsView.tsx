'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  BarChart3,
  Sparkles,
  Clock,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  Phone,
  MessageSquare,
  Printer,
  RefreshCw,
  Moon,
  Zap,
  ArrowUpRight,
  UserCheck,
  Activity,
  HeartPulse,
  Send,
  X,
  CalendarCheck,
  ChevronRight,
  ShieldCheck,
  UserPlus,
  Repeat,
} from 'lucide-react';

interface ReportsViewProps {
  clinicId?: string;
  defaultTicketMedio?: number;
}

export function ReportsView({ clinicId, defaultTicketMedio = 350 }: ReportsViewProps) {
  const [period, setPeriod] = useState<'7d' | '30d' | 'month' | 'prev_month' | '90d' | 'year'>('month');
  const [ticketMedio, setTicketMedio] = useState<number>(defaultTicketMedio);
  const [editingTicket, setEditingTicket] = useState(false);
  const [ticketInput, setTicketInput] = useState<string>(String(defaultTicketMedio));

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal WhatsApp
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchReports = async (selectedPeriod = period, currentTicket = ticketMedio) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/reports?period=${selectedPeriod}&ticketMedio=${currentTicket}${clinicId ? `&clinicId=${clinicId}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar dados do relatório');
      setData(json);
      if (json.doctor?.phone && !targetPhone) {
        setTargetPhone(json.doctor.phone);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar indicadores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(period, ticketMedio);
  }, [period]);

  const handleUpdateTicket = () => {
    const val = Number(ticketInput.replace(/\D/g, ''));
    if (val > 0) {
      setTicketMedio(val);
      setEditingTicket(false);
      fetchReports(period, val);
    }
  };

  const handleSendWhatsAppSummary = async () => {
    if (!targetPhone) return;
    setSendingWhatsApp(true);
    setWhatsAppFeedback(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          phoneTo: targetPhone,
          periodLabel: data?.periodLabel || 'do período',
          customTicketMedio: ticketMedio,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erro no envio');
      setWhatsAppFeedback({ type: 'success', message: 'Resumo executivo enviado com sucesso para o WhatsApp do médico!' });
      setTimeout(() => {
        setShowWhatsAppModal(false);
        setWhatsAppFeedback(null);
      }, 2500);
    } catch (err: any) {
      setWhatsAppFeedback({ type: 'error', message: err.message || 'Erro ao enviar mensagem pelo WhatsApp' });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/60 overflow-y-auto print:bg-white print:overflow-visible">
      {/* CABEÇALHO EXECUTIVO */}
      <div className="p-4 sm:p-6 lg:p-8 bg-white border-b border-slate-200/80 shadow-2xs print:border-none print:shadow-none">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-br from-[#e8f7f0] to-emerald-100/60 text-[#00875a]">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Inteligência e Relatórios do Consultório
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  Indicadores executivos, retorno sobre investimento e desempenho da agenda médica
                </p>
              </div>
            </div>
          </div>

          {/* AÇÕES E FILTROS */}
          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <div className="inline-flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600">
              <button
                onClick={() => setPeriod('7d')}
                className={`px-3 py-1.5 rounded-xl transition ${period === '7d' ? 'bg-white text-[#005a43] shadow-xs' : 'hover:text-slate-900'}`}
              >
                7 Dias
              </button>
              <button
                onClick={() => setPeriod('month')}
                className={`px-3 py-1.5 rounded-xl transition ${period === 'month' ? 'bg-white text-[#005a43] shadow-xs' : 'hover:text-slate-900'}`}
              >
                Este Mês
              </button>
              <button
                onClick={() => setPeriod('prev_month')}
                className={`px-3 py-1.5 rounded-xl transition ${period === 'prev_month' ? 'bg-white text-[#005a43] shadow-xs' : 'hover:text-slate-900'}`}
              >
                Mês Anterior
              </button>
              <button
                onClick={() => setPeriod('90d')}
                className={`px-3 py-1.5 rounded-xl transition ${period === '90d' ? 'bg-white text-[#005a43] shadow-xs' : 'hover:text-slate-900'}`}
              >
                90 Dias
              </button>
              <button
                onClick={() => setPeriod('year')}
                className={`px-3 py-1.5 rounded-xl transition ${period === 'year' ? 'bg-white text-[#005a43] shadow-xs' : 'hover:text-slate-900'}`}
              >
                Ano
              </button>
            </div>

            <button
              onClick={() => fetchReports()}
              disabled={loading}
              title="Atualizar dados"
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00875a]' : ''}`} />
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8">
        {loading && !data ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#00875a] animate-spin" />
            <p className="text-sm font-bold text-slate-600">Calculando indicadores executivos e ROI da Sofia...</p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <p className="font-bold">Não foi possível carregar os relatórios</p>
              <p className="text-xs text-rose-600">{error}</p>
            </div>
          </div>
        ) : data ? (
          <>
            {/* HERO CARD: RETORNO SOBRE INVESTIMENTO DA SOFIA */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#004735] via-[#005a43] to-[#007050] text-white p-6 sm:p-8 shadow-xl border border-emerald-600/30">
              {/* Efeito de brilho de fundo */}
              <div className="absolute -right-16 -top-16 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute right-12 bottom-4 opacity-5 pointer-events-none">
                <Sparkles className="w-72 h-72 text-white" />
              </div>

              <div className="relative z-10 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-white/15 text-emerald-200 backdrop-blur-xs">
                      <Zap className="w-5 h-5" />
                    </span>
                    <div>
                      <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                        Retorno sobre Investimento da Sofia (Inteligência Artificial)
                      </h2>
                      <p className="text-xs text-emerald-100 font-medium">
                        Receita direta gerada e vagas salvas automaticamente no período ({data.periodLabel})
                      </p>
                    </div>
                  </div>

                  {/* Configuração do Ticket Médio */}
                  <div className="flex items-center gap-2 self-start sm:self-auto bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 text-xs">
                    <span className="text-emerald-200 font-medium">Ticket Médio por Consulta:</span>
                    {editingTicket ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={ticketInput}
                          onChange={(e) => setTicketInput(e.target.value)}
                          className="w-20 px-2 py-0.5 rounded bg-white text-slate-900 text-xs font-bold text-center"
                          autoFocus
                        />
                        <button
                          onClick={handleUpdateTicket}
                          className="px-2 py-0.5 rounded bg-emerald-500 text-white font-bold hover:bg-emerald-400"
                        >
                          Salvar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingTicket(true)}
                        className="font-extrabold text-white underline decoration-dashed hover:text-emerald-300"
                        title="Clique para alterar o valor médio da consulta"
                      >
                        R$ {ticketMedio.toLocaleString('pt-BR')},00
                      </button>
                    )}
                  </div>
                </div>

                {/* KPI Principal de Faturamento Protegido */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6">
                  <div className="md:col-span-1 bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider">
                        Receita Protegida e Gerada
                      </span>
                      <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mt-2 tracking-tight">
                        R$ {(data.roi?.faturamentoTotalProtegido || 0).toLocaleString('pt-BR')},00
                      </div>
                    </div>
                    <p className="text-[11px] text-emerald-100/90 mt-3 font-medium">
                      Garantidos pela Sofia fora do expediente comercial e resgatados na fila.
                    </p>
                  </div>

                  {/* Submétricas do ROI */}
                  <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/10 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-200">
                        <span className="text-xs font-bold uppercase tracking-wider">Fora do Expediente</span>
                        <Moon className="w-4 h-4 text-emerald-300" />
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl sm:text-3xl font-extrabold text-white">
                          {data.roi?.agendadosForaHorario || 0}
                        </span>
                        <span className="text-xs text-emerald-200 ml-1.5 font-semibold">consultas</span>
                      </div>
                      <p className="text-[11px] text-emerald-100 mt-2 font-medium">
                        Agendadas em noites, madrugadas e fins de semana sem perda de pacientes.
                      </p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/10 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-200">
                        <span className="text-xs font-bold uppercase tracking-wider">Salvas na Fila</span>
                        <Zap className="w-4 h-4 text-emerald-300" />
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl sm:text-3xl font-extrabold text-white">
                          {data.roi?.totalVagasResgatadasFila || 0}
                        </span>
                        <span className="text-xs text-emerald-200 ml-1.5 font-semibold">vagas salvas</span>
                      </div>
                      <p className="text-[11px] text-emerald-100 mt-2 font-medium">
                        Horários vagos após desistências que a Sofia preencheu em minutos.
                      </p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/10 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-200">
                        <span className="text-xs font-bold uppercase tracking-wider">Autonomia da IA</span>
                        <Sparkles className="w-4 h-4 text-emerald-300" />
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl sm:text-3xl font-extrabold text-white">
                          {data.whatsapp?.taxaAutonomiaIA || 92}%
                        </span>
                        <span className="text-xs text-emerald-200 ml-1.5 font-semibold">100% autônoma</span>
                      </div>
                      <p className="text-[11px] text-emerald-100 mt-2 font-medium">
                        Economizou cerca de <strong>{data.roi?.horasEconomizadasRecepcao || 0} horas</strong> de telefone da recepção.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO 1: MÉTRICAS CLÍNICAS E GESTÃO DE AGENDA */}
            <div>
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
                <CalendarCheck className="w-5 h-5 text-[#005a43]" />
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Métricas Clínicas e Gestão de Agenda
                </h3>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-bold uppercase tracking-wider">Total de Consultas</span>
                    <Calendar className="w-4 h-4 text-[#00875a]" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                    {data.kpis?.totalConsultas || 0}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{data.kpis?.consultasAtivas || 0} confirmadas/agendadas</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-bold uppercase tracking-wider">Taxa de Confirmação</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                    {data.kpis?.taxaConfirmacao || 0}%
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">
                    Presenças confirmadas pelo lembrete de véspera (D-1).
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-bold uppercase tracking-wider">Taxa de Ocupação</span>
                    <Activity className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                    {data.kpis?.taxaOcupacaoGeral || 0}%
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">
                    Aproveitamento real da grade de horários cadastrada.
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-bold uppercase tracking-wider">Faturamento Estimado</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#005a43] mt-2">
                    R$ {(data.roi?.faturamentoEstimadoGeral || 0).toLocaleString('pt-BR')}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">
                    Volume bruto projetado para o período selecionado.
                  </p>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: ANÁLISE DE OCIOSIDADE POR DIA DA SEMANA E TURNOS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Gráfico de Ocupação por Dia */}
              <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
                      Ocupação e Ociosidade por Dia da Semana
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">
                      Identifique os dias de pico e os horários com maior ociosidade para otimização
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  {data.agendaOcupacao?.dias && data.agendaOcupacao.dias.length > 0 ? (
                    data.agendaOcupacao.dias.map((d: any) => {
                      const isHigh = d.taxaOcupacao >= 80;
                      const isLow = d.taxaOcupacao < 50;
                      return (
                        <div key={d.dayIndex} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-700 w-28">{d.name}</span>
                            <span className="text-slate-500 font-medium">
                              {d.scheduled} {d.scheduled === 1 ? 'consulta' : 'consultas'}
                              {d.capacity > 0 ? ` de ${d.capacity} vagas` : ''}
                            </span>
                            <span className={`w-14 text-right font-black ${isHigh ? 'text-emerald-700' : isLow ? 'text-amber-700' : 'text-slate-800'}`}>
                              {d.taxaOcupacao}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                            <div
                              style={{ width: `${d.taxaOcupacao}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isHigh
                                  ? 'bg-gradient-to-r from-emerald-500 to-[#005a43]'
                                  : isLow
                                  ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                                  : 'bg-gradient-to-r from-teal-400 to-teal-600'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                      Sem dados de grade de agendamentos no período selecionado.
                    </div>
                  )}
                </div>
              </div>

              {/* Comparativo de Turnos e Retenção */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-6">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Distribuição de Turnos e Pacientes
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    Preferência de horários e renovação de carteira
                  </p>

                  <div className="mt-5 space-y-4">
                    {/* Turno Manhã vs Tarde */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
                      <span className="text-xs font-bold text-slate-700 block">Divisão por Turno</span>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Manhã: <strong>{data.agendaOcupacao?.turnoManha || 0}</strong></span>
                        <span>Tarde: <strong>{data.agendaOcupacao?.turnoTarde || 0}</strong></span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
                        {(() => {
                          const total = (data.agendaOcupacao?.turnoManha || 0) + (data.agendaOcupacao?.turnoTarde || 0);
                          const manhaPercent = total > 0 ? Math.round(((data.agendaOcupacao?.turnoManha || 0) / total) * 100) : 50;
                          return (
                            <>
                              <div style={{ width: `${manhaPercent}%` }} className="h-full bg-[#00875a]" title="Manhã" />
                              <div style={{ width: `${100 - manhaPercent}%` }} className="h-full bg-teal-400" title="Tarde" />
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Pacientes Novos vs Recorrentes */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
                      <span className="text-xs font-bold text-slate-700 block">Renovação de Pacientes</span>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="flex items-center gap-1.5 font-bold text-emerald-800">
                          <UserPlus className="w-3.5 h-3.5" />
                          {data.retencao?.pacientesNovos || 0} Novos
                        </span>
                        <span className="flex items-center gap-1.5 font-bold text-teal-800">
                          <Repeat className="w-3.5 h-3.5" />
                          {data.retencao?.pacientesRecorrentes || 0} Retornos
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-[#005a43] font-medium leading-relaxed">
                  💡 <strong>Insight Estratégico:</strong> Consultórios particulares de alta fidelização mantêm entre 40% a 60% de pacientes recorrentes em acompanhamento.
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: RADAR DE REATIVAÇÃO DE PACIENTES INATIVOS */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-600" />
                    <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                      Radar de Reativação de Pacientes
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                      {data.retencao?.totalInativos || 0} inativos
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Pacientes sem consulta há mais de 6 meses. Oportunidade de ouro para reativação de consultas de rotina.
                  </p>
                </div>
              </div>

              {data.retencao?.listaInativos && data.retencao.listaInativos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {data.retencao.listaInativos.map((paciente: any) => {
                    const cleanPhone = (paciente.phone || '').replace(/\D/g, '');
                    const whatsappLink = `https://wa.me/${cleanPhone}?text=Ol%C3%A1%20${encodeURIComponent(
                      paciente.name
                    )}%21%20Aqui%20%C3%A9%20do%20consult%C3%B3rio%20m%C3%A9dico.%20Como%20voc%C3%AA%20est%C3%A1%3F%20Gostar%C3%ADamos%20de%20saber%20se%20est%C3%A1%20tudo%20bem%20e%20se%20gostaria%20de%20agendar%20sua%20consulta%20de%20acompanhamento%20de%20rotina%21`;

                    return (
                      <div
                        key={paciente.id}
                        className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:border-emerald-300 transition-all flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <h5 className="font-extrabold text-slate-900 text-sm truncate" title={paciente.name}>
                            {paciente.name}
                          </h5>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Última consulta: <strong>{paciente.ultimaConsulta}</strong>
                          </p>
                          <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">
                            {paciente.diasSemConsulta} dias sem retorno
                          </span>
                        </div>

                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#005a43] text-xs font-bold transition border border-emerald-200"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Reativar no WhatsApp</span>
                        </a>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs font-medium">
                  Nenhum paciente inativo com mais de 6 meses localizado. Sua carteira está ativa e em dia! 🎉
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* MODAL: ENVIAR RESUMO EXECUTIVO PARA O WHATSAPP DO MÉDICO */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-100 text-[#005a43]">
                  <Send className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Enviar Resumo no WhatsApp do Médico
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Disparo instantâneo com os números consolidados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {whatsAppFeedback && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                  whatsAppFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {whatsAppFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span>{whatsAppFeedback.message}</span>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                Número do WhatsApp de Destino (Médico)
              </label>
              <input
                type="text"
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                placeholder="+55 (11) 99999-9999"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00875a]"
              />
              <p className="text-[11px] text-slate-400 font-medium">
                Puxado automaticamente do cadastro profissional do médico titular.
              </p>
            </div>

            {/* Prévia da mensagem */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs font-mono text-slate-700 space-y-1 leading-relaxed">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-sans">
                Prévia da Mensagem (Formatação Oficial WhatsApp):
              </span>
              <p><strong>Fechamento Executivo do Consultório 🩺</strong></p>
              <p>Olá, <strong>{data?.doctor?.name || 'Doutor(a)'}</strong>! Aqui está o resumo consolidado:</p>
              <p>• <strong>Consultas ativas:</strong> {data?.kpis?.consultasAtivas || 0}</p>
              <p>• <strong>Faturamento estimado:</strong> R$ {(data?.roi?.faturamentoEstimadoGeral || 0).toLocaleString('pt-BR')},00</p>
              <p>• <strong>Fora do expediente:</strong> {data?.roi?.agendadosForaHorario || 0} consultas</p>
              <p>• <strong>Vagas salvas na fila:</strong> {data?.roi?.totalVagasResgatadasFila || 0} horários</p>
              <p>• <strong>Receita protegida pela IA:</strong> R$ {(data?.roi?.faturamentoTotalProtegido || 0).toLocaleString('pt-BR')},00</p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowWhatsAppModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendWhatsAppSummary}
                disabled={sendingWhatsApp || !targetPhone}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#005a43] to-[#00875a] hover:from-[#004735] hover:to-[#00744e] text-white text-xs font-extrabold shadow-sm transition disabled:opacity-50"
              >
                {sendingWhatsApp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Disparar Resumo Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default ReportsView;
