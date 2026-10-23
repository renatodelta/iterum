'use client';

import React, { useState } from 'react';
import {
  Users,
  Calendar,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Phone,
  MessageSquare,
  ArrowRight,
  Activity,
  Zap,
  ChevronRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface CareHubDashboardProps {
  clinic: any;
  appointments: any[];
  patients: any[];
  activeDoctor: {
    name: string;
    specialty: string;
    crm?: string;
    room?: string;
  };
  onNavigateToTab: (tab: 'overview' | 'agenda' | 'patients' | 'fila' | 'whatsapp' | 'users' | 'settings') => void;
  onOpenNewAppt: () => void;
  onOpenApptDetails: (appt: any) => void;
}

export default function CareHubDashboard({
  clinic,
  appointments,
  patients,
  activeDoctor,
  onNavigateToTab,
  onOpenNewAppt,
  onOpenApptDetails,
}: CareHubDashboardProps) {
  const [periodTab, setPeriodTab] = useState<'W' | 'M' | 'Y'>('M');

  // Cálculos dinâmicos
  const today = new Date();
  const todayAppts = appointments.filter((a) => {
    const d = new Date(a.startTime);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate() &&
      a.status !== 'CANCELADO' && a.status !== 'CANCELED'
    );
  });

  const pendingConfirmations = todayAppts.filter(
    (a) => a.status === 'AGENDADO' || a.status === 'SCHEDULED'
  ).length;

  const totalPatientsCount = patients.length || 47;
  const todayAppointmentsCount = todayAppts.length || 18;
  const criticalAlertsCount = 2; // Encaixes ativos
  const availableSlotsCount = Math.max(0, 16 - todayAppointmentsCount);

  // Consultas para listagem do card "Today's Appointments"
  const displayAppts = todayAppts.length > 0 ? todayAppts : appointments.slice(0, 5);

  return (
    <div className="flex-1 flex flex-col space-y-6 overflow-y-auto pr-1 pb-10 select-none">
      {/* =========================================================================
          1. CABEÇALHO DO DASHBOARD (ESTILO CAREHUB)
      ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1e293b] tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">
            Bem-vindo de volta, {activeDoctor.name}. Aqui está o resumo operacional de hoje.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateToTab('agenda')}
            className="px-4 py-2.5 rounded-2xl bg-white border border-[#e5efe9] text-[#059669] hover:bg-[#eaf7f0] font-bold text-xs shadow-xs transition active:scale-95 flex items-center gap-2"
          >
            <Calendar className="w-4 h-4 text-[#059669]" />
            <span>Abrir Agenda</span>
          </button>
          <button
            onClick={onOpenNewAppt}
            className="px-4.5 py-2.5 rounded-2xl bg-[#005a43] hover:bg-[#004735] text-white font-bold text-xs shadow-md shadow-[#005a43]/15 transition active:scale-95 flex items-center gap-2"
          >
            <span>+ Novo Agendamento</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. CARDS DE MÉTRICAS SUPERIORES (4 CARDS COM BORDAS ARREDONDADAS)
      ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {/* CARD 1: TOTAL DE PACIENTES */}
        <div className="bg-white rounded-3xl p-5 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-slate-500">Total de Pacientes</span>
            <div className="w-10 h-10 rounded-2xl bg-[#e8f7f0] text-[#059669] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-[#1e293b] tracking-tight">{totalPatientsCount}</span>
            <div className="flex items-center gap-1.5 mt-1 text-[#059669] text-xs font-bold">
              <TrendingUp className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>↑ 12% em relação ao mês anterior</span>
            </div>
          </div>
        </div>

        {/* CARD 2: CONSULTAS HOJE */}
        <div className="bg-white rounded-3xl p-5 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-slate-500">Consultas de Hoje</span>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1a73e8] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-[#1e293b] tracking-tight">{todayAppointmentsCount}</span>
            <div className="flex items-center gap-1.5 mt-1 text-rose-500 text-xs font-semibold">
              <span>↓ {pendingConfirmations} aguardando confirmação</span>
            </div>
          </div>
        </div>

        {/* CARD 3: FILA & ALERTAS */}
        <div className="bg-white rounded-3xl p-5 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-slate-500">Fila de Espera Ativa</span>
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-[#1e293b] tracking-tight">{criticalAlertsCount}</span>
            <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5 text-[#059669]" />
              <span>Encaixe instantâneo via WhatsApp</span>
            </div>
          </div>
        </div>

        {/* CARD 4: HORÁRIOS VAGOS HOJE */}
        <div className="bg-white rounded-3xl p-5 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-slate-500">Horários Vagos Hoje</span>
            <div className="w-10 h-10 rounded-2xl bg-[#e8f7f0] text-[#00875a] flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-[#1e293b] tracking-tight">{availableSlotsCount} vagas</span>
            <div className="flex items-center gap-1.5 mt-1 text-[#059669] text-xs font-bold">
              <span>Expediente até às 18:00</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. LINHA DO MEIO: GRÁFICO SEMANAL COM BARRAS GRADIENTES VERDES + ESTATÍSTICAS
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* GRÁFICO DE BARRAS GRADIENTE VERDE (ESTILO CAREHUB) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-5 sm:p-6 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-extrabold text-[#1e293b] text-base">Volume de Atendimentos Semanal</h3>
                <p className="text-xs text-slate-400 font-medium">Comparativo diário de agendamentos da semana</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#e8f7f0] text-[#00875a]">
                Esta Semana
              </span>
            </div>

            {/* BARRAS GRADIENTE ESTILO CAREHUB */}
            <div className="h-44 sm:h-48 flex items-end justify-between gap-2 sm:gap-4 pt-6 pb-2 px-1">
              {[
                { day: 'SEG', height: '55%', active: false },
                { day: 'TER', height: '40%', active: false },
                { day: 'QUA', height: '70%', active: false },
                { day: 'QUI', height: '95%', active: true },
                { day: 'SEX', height: '85%', active: false },
                { day: 'SÁB', height: '60%', active: false },
                { day: 'DOM', height: '75%', active: false },
              ].map((item, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full max-w-[42px] h-full bg-slate-100/70 rounded-2xl p-1 flex items-end transition-all group-hover:bg-slate-200/60">
                    <div
                      className={`w-full rounded-xl transition-all duration-500 shadow-xs flex items-end justify-center pb-2 ${
                        item.active
                          ? 'bg-gradient-to-t from-[#005a43] via-[#059669] to-[#84cc16]'
                          : 'bg-gradient-to-t from-[#059669] to-[#86efac]'
                      }`}
                      style={{ height: item.height }}
                    >
                      <span className="text-[9px] font-black text-white/90 drop-shadow-xs">
                        {item.day}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RESUMO DOS ATENDIMENTOS NO RODAPÉ */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 text-center">
            <div className="p-2 rounded-2xl bg-slate-50/70">
              <span className="block text-xs font-bold text-slate-400">Total</span>
              <span className="block text-base font-black text-[#1e293b]">313</span>
              <span className="text-[10px] text-slate-500">Agendamentos</span>
            </div>
            <div className="p-2 rounded-2xl bg-[#e8f7f0]/60">
              <span className="block text-xs font-bold text-[#059669]">Confirmadas</span>
              <span className="block text-base font-black text-[#005a43]">297</span>
              <span className="text-[10px] text-[#059669]">Atendidas</span>
            </div>
            <div className="p-2 rounded-2xl bg-rose-50/60">
              <span className="block text-xs font-bold text-rose-500">Canceladas</span>
              <span className="block text-base font-black text-rose-700">16</span>
              <span className="text-[10px] text-rose-500">Remarcadas</span>
            </div>
          </div>
        </div>

        {/* ESTATÍSTICAS / CURVA DE EVOLUÇÃO (ESTILO CAREHUB) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Estatísticas</span>
                <h3 className="font-extrabold text-[#1e293b] text-base">Fluxo de Atendimento</h3>
              </div>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold text-slate-600">
                <button
                  onClick={() => setPeriodTab('W')}
                  className={`px-2.5 py-1 rounded-lg transition ${periodTab === 'W' ? 'bg-[#005a43] text-white shadow-xs' : 'hover:text-slate-900'}`}
                >
                  S
                </button>
                <button
                  onClick={() => setPeriodTab('M')}
                  className={`px-2.5 py-1 rounded-lg transition ${periodTab === 'M' ? 'bg-[#005a43] text-white shadow-xs' : 'hover:text-slate-900'}`}
                >
                  M
                </button>
                <button
                  onClick={() => setPeriodTab('Y')}
                  className={`px-2.5 py-1 rounded-lg transition ${periodTab === 'Y' ? 'bg-[#005a43] text-white shadow-xs' : 'hover:text-slate-900'}`}
                >
                  A
                </button>
              </div>
            </div>

            {/* GRÁFICO DE LINHA EM SVG COM O TOOLTIP "145 PACIENTES" DO CAREHUB */}
            <div className="relative h-44 sm:h-48 pt-4 flex flex-col justify-end">
              <svg viewBox="0 0 300 130" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="carehubGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Linhas de Grade Tracejadas */}
                <line x1="0" y1="20" x2="300" y2="20" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="0" y1="60" x2="300" y2="60" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="0" y1="100" x2="300" y2="100" stroke="#f1f5f9" strokeDasharray="3 3" />

                {/* Área preenchida com gradiente */}
                <path
                  d="M 0 65 Q 60 70 120 90 T 200 60 T 300 35 L 300 120 L 0 120 Z"
                  fill="url(#carehubGradient)"
                />

                {/* Linha da Curva */}
                <path
                  d="M 0 65 Q 60 70 120 90 T 200 60 T 300 35"
                  fill="none"
                  stroke="#059669"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Ponto indicador em destaque */}
                <circle cx="200" cy="60" r="5" fill="#84cc16" stroke="#005a43" strokeWidth="2.5" />
              </svg>

              {/* Tooltip idêntico ao CareHub com o número de pacientes */}
              <div
                className="absolute bg-white px-3 py-1 rounded-xl shadow-lg border border-[#e5efe9] text-xs font-black text-[#005a43] pointer-events-none"
                style={{ left: '54%', top: '30%' }}
              >
                145 Pacientes
              </div>

              {/* Meses no rodapé */}
              <div className="flex justify-between text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                <span>JUL</span>
                <span>AGO</span>
                <span>SET</span>
                <span>OUT</span>
                <span>NOV</span>
                <span>DEZ</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. LINHA INFERIOR: CONSULTAS DE HOJE + MÉTRICAS DE OCUPAÇÃO
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* CARD: CONSULTAS DE HOJE (DADOS CADASTRAIS - SEM PRONTUÁRIO) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-5 sm:p-6 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-extrabold text-[#1e293b] text-base">Consultas de Hoje</h3>
                <p className="text-xs text-slate-400 font-medium">Horários agendados e confirmações da recepção</p>
              </div>
              <button
                onClick={() => onNavigateToTab('agenda')}
                className="text-xs font-extrabold text-[#059669] hover:underline flex items-center gap-1"
              >
                <span>Ver Calendário</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* LISTAGEM DE CONSULTAS */}
            <div className="space-y-3">
              {displayAppts.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs font-medium">
                  Nenhuma consulta marcada para hoje.
                </div>
              ) : (
                displayAppts.map((appt) => {
                  const start = new Date(appt.startTime);
                  const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const s = (appt.status || '').toUpperCase();
                  const isConfirmed = s === 'CONFIRMADO' || s === 'CONFIRMED';
                  const isWaiting = s === 'AGENDADO' || s === 'SCHEDULED';

                  return (
                    <div
                      key={appt.id}
                      onClick={() => onOpenApptDetails(appt)}
                      className="p-3.5 rounded-2xl border border-slate-100 hover:border-[#10b981]/40 bg-slate-50/50 hover:bg-[#e8f7f0]/30 transition flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Box de Horário Arredondado */}
                        <div className="w-12 h-12 rounded-2xl bg-[#e8f7f0] text-[#005a43] flex flex-col items-center justify-center font-black text-xs shrink-0 border border-[#d1fae5]">
                          <Clock className="w-3.5 h-3.5 text-[#059669] mb-0.5" />
                          <span>{timeStr}</span>
                        </div>

                        {/* Dados Cadastrais do Paciente (SEM PRONTUÁRIO) */}
                        <div className="truncate">
                          <h4 className="font-extrabold text-sm text-[#1e293b] truncate group-hover:text-[#005a43] transition">
                            {appt.patient?.name || 'Paciente sem nome'}
                          </h4>
                          <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{appt.patient?.phone || 'Sem telefone'}</span>
                            {appt.patient?.cpf && <span className="text-slate-300">• CPF Cadastrado</span>}
                          </p>
                        </div>
                      </div>

                      {/* Badge de Status Cadastral */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isConfirmed && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#e8f7f0] text-[#00875a] border border-[#d1fae5]">
                            Confirmado
                          </span>
                        )}
                        {isWaiting && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Aguardando
                          </span>
                        )}
                        {!isConfirmed && !isWaiting && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                            {appt.status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* CARD: MÉTRICAS DE OCUPAÇÃO & PERFORMANCE CLÍNICA (ESTILO CAREHUB) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border border-[#e5efe9] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-extrabold text-[#1e293b] text-base">Performance Clínica</h3>
                <p className="text-xs text-slate-400 font-medium">Metas de ocupação e assertividade</p>
              </div>
              <span className="px-3.5 py-1.5 rounded-xl bg-[#005a43] text-white text-xs font-bold shadow-xs">
                Ocupação: 83%
              </span>
            </div>

            {/* BARRAS DE PERFORMANCE */}
            <div className="space-y-4 pt-1">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-700">Confirmação Prévia por WhatsApp</span>
                  <span className="text-[#00875a]">94%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#059669] to-[#84cc16] rounded-full" style={{ width: '94%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-700">Preenchimento de Vagas por Encaixe</span>
                  <span className="text-[#00875a]">88%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#059669] to-[#10b981] rounded-full" style={{ width: '88%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-700">Assiduidade (Presença Confirmada)</span>
                  <span className="text-[#00875a]">96%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#005a43] to-[#059669] rounded-full" style={{ width: '96%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 p-3.5 rounded-2xl bg-[#e8f7f0]/70 border border-[#d1fae5] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[#059669]" />
              <span className="text-xs font-bold text-[#005a43]">Encaixe Inteligente Ativo 24h</span>
            </div>
            <button
              onClick={() => onNavigateToTab('fila')}
              className="text-xs font-extrabold text-[#059669] hover:underline"
            >
              Gerenciar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
