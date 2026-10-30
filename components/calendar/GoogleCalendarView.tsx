'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Menu,
  Search,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  CalendarPlus,
  Plus,
  Clock,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Zap,
  Filter,
  Check,
  X,
  CalendarDays,
  CalendarRange,
  Users,
  MessageSquare,
  Settings,
  Sparkles,
  Activity,
  Stethoscope,
} from 'lucide-react';

export type AgendaViewMode = 'dia' | '3dias' | 'semana' | 'mes';

export interface DaySlotItem {
  time: string;
  endTime: string;
  duration: number;
  isReturn: boolean;
}

interface GoogleCalendarViewProps {
  appointments: any[];
  clinic: any;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  agendaViewMode: AgendaViewMode;
  setAgendaViewMode: (mode: AgendaViewMode) => void;
  currentTimeStr: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onOpenNewAppt: (date: Date, hourStr?: string) => void;
  onOpenApptDetails: (appt: any) => void;
  onSwitchTab?: (tab: 'agenda' | 'patients' | 'fila' | 'whatsapp' | 'users' | 'settings' | 'profissionais') => void;
  activeDoctor?: {
    name: string;
    specialty: string;
    crm?: string;
    room?: string;
  };
}

const WEEKDAYS_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const WEEKDAYS_SINGLE = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function cleanDigits(str?: string | null): string {
  return str ? str.replace(/\D/g, '') : '';
}

function applyCPFMask(v?: string | null): string {
  if (!v) return '';
  const digits = cleanDigits(v).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function matchesSearch(appt: any, query: string): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();
  const qDigits = cleanDigits(query);

  const patName = appt.patient?.name?.toLowerCase() || '';
  const patPhone = appt.patient?.phone || '';
  const patCpf = appt.patient?.cpf || '';
  const notes = appt.notes?.toLowerCase() || '';

  // 1. Nome do paciente
  if (patName.includes(q)) return true;

  // 2. CPF do paciente (com ou sem formatação)
  if (patCpf.toLowerCase().includes(q)) return true;
  if (qDigits.length >= 3 && cleanDigits(patCpf).includes(qDigits)) return true;

  // 3. Telefone do paciente (com ou sem formatação)
  if (patPhone.toLowerCase().includes(q)) return true;
  if (qDigits.length >= 3 && cleanDigits(patPhone).includes(qDigits)) return true;

  // 4. Observações
  if (notes.includes(q)) return true;

  return false;
}

export default function GoogleCalendarView({
  appointments,
  clinic,
  selectedDate,
  setSelectedDate,
  agendaViewMode,
  setAgendaViewMode,
  currentTimeStr,
  searchQuery,
  setSearchQuery,
  onOpenNewAppt,
  onOpenApptDetails,
  onSwitchTab,
  activeDoctor = {
    name: 'Dr. Renato Silveira',
    specialty: 'Cardiologia & Clínica Geral',
    crm: 'CRM 48.910',
    room: 'Consultório 402',
  },
}: GoogleCalendarViewProps) {
  // Estados de controle da interface
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuMoreOpen, setMenuMoreOpen] = useState(false);
  const [filterVagosOnly, setFilterVagosOnly] = useState(false);
  const [filterBookedOnly, setFilterBookedOnly] = useState(false);

  // Mês de navegação do calendário
  const [viewMonthDate, setViewMonthDate] = useState<Date>(() => new Date(selectedDate));

  // Todas as consultas correspondentes à busca por nome, CPF ou telefone
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return appointments
      .filter((a) => {
        const isNotCanceled = a.status !== 'CANCELADO' && a.status !== 'CANCELED';
        if (!isNotCanceled) return false;
        return matchesSearch(a, searchQuery);
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [appointments, searchQuery]);

  // Sincronizar viewMonthDate quando selectedDate muda
  useEffect(() => {
    setViewMonthDate(new Date(selectedDate));
  }, [selectedDate.getFullYear(), selectedDate.getMonth()]);

  // Horário em tempo real para posicionar a linha do Google Calendar (minutos desde 00:00)
  const [nowMinuteOfDay, setNowMinuteOfDay] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    function updateIndicator() {
      const now = new Date();
      setNowMinuteOfDay(now.getHours() * 60 + now.getMinutes());
    }
    const timer = setInterval(updateIndicator, 30000); // atualiza a cada 30 segundos
    return () => clearInterval(timer);
  }, []);

  // Helpers de comparação de datas
  function isSameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  const isToday = (d: Date) => isSameDay(d, new Date());

  // Horas da grade (07:00 até 22:00)
  const timelineHours = useMemo(() => {
    const hours: number[] = [];
    for (let h = 7; h <= 21; h++) {
      hours.push(h);
    }
    return hours;
  }, []);

  // Extrair configuração de expediente da clínica (suporta tanto string JSON quanto objeto já parsed)
  const clinicWorkingHours = useMemo(() => {
    if (!clinic) return null;
    let wh = clinic.workingHours;
    if (typeof wh === 'string') {
      try {
        wh = JSON.parse(wh);
      } catch {
        wh = null;
      }
    }
    if (wh && typeof wh === 'object') return wh;
    return null;
  }, [clinic?.workingHours]);

  const slotDuration = clinic?.slotDurationMinutes || 30;

  // Gerar resumo de horários (vagos e ocupados) para qualquer data
  const getDaySlotsInfo = (targetDate: Date) => {
    const dayOfWeek = targetDate.getDay().toString(); // 0 = Domingo, 6 = Sábado
    let dayActive = false;
    let startH = 8;
    let startM = 0;
    let endH = 18;
    let endM = 0;
    let lunchStartH = 12;
    let lunchEndH = 13;

    // Consultas do dia (sempre preservadas na visualização da agenda)
    const dayAppts = appointments.filter((a) => {
      const d = new Date(a.startTime);
      const isDay = isSameDay(d, targetDate);
      const isNotCanceled = a.status !== 'CANCELADO' && a.status !== 'CANCELED';
      if (!isDay || !isNotCanceled) return false;

      return matchesSearch(a, searchQuery);
    });

    const meta = clinicWorkingHours?.meta;
    const selectedDays: string[] = (Array.isArray(meta?.selectedDays) && meta.selectedDays.length > 0)
      ? meta.selectedDays.map(String)
      : ((Array.isArray(clinicWorkingHours?.selectedDays) && clinicWorkingHours.selectedDays.length > 0)
        ? clinicWorkingHours.selectedDays.map(String)
        : (Array.isArray(clinic?.selectedDays) ? clinic.selectedDays.map(String) : []));

    const scheduleStartDate = meta?.scheduleStartDate || clinicWorkingHours?.scheduleStartDate || clinic?.scheduleStartDate || '';
    const scheduleEndDate = meta?.scheduleEndDate || clinicWorkingHours?.scheduleEndDate || clinic?.scheduleEndDate || '';

    const encaixeAppts = dayAppts.filter(
      (a) => (a.status || '').toUpperCase() === 'ENCAIXE' || (a.notes && a.notes.toUpperCase().includes('ENCAIXE'))
    );

    // Se não há dias selecionados ou o período não foi configurado, a agenda está inativa (sem vagas)
    if (selectedDays.length === 0 || !scheduleStartDate || !scheduleEndDate) {
      return {
        isActive: false,
        allSlots: [] as DaySlotItem[],
        bookedAppts: dayAppts,
        vacantSlots: [] as DaySlotItem[],
        bookedCount: dayAppts.length,
        vacantCount: 0,
        encaixeCount: encaixeAppts.length,
      };
    }

    // Verificar se a data está estritamente dentro do período de abertura da agenda
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const targetISO = `${y}-${m}-${d}`;
    if (targetISO < scheduleStartDate || targetISO > scheduleEndDate) {
      return {
        isActive: false,
        allSlots: [] as DaySlotItem[],
        bookedAppts: dayAppts,
        vacantSlots: [] as DaySlotItem[],
        bookedCount: dayAppts.length,
        vacantCount: 0,
        encaixeCount: encaixeAppts.length,
      };
    }

    // Verificar se o dia da semana atual está entre os dias selecionados no Criar Agenda
    if (!selectedDays.includes(dayOfWeek)) {
      return {
        isActive: false,
        allSlots: [] as DaySlotItem[],
        bookedAppts: dayAppts,
        vacantSlots: [] as DaySlotItem[],
        bookedCount: dayAppts.length,
        vacantCount: 0,
        encaixeCount: encaixeAppts.length,
      };
    }

    // Obter configuração de horário de expediente para este dia da semana
    let hasBreak = true;
    let bStart = meta?.breakStartTime || clinic?.breakStartTime || '12:00';
    let bEnd = meta?.breakEndTime || clinic?.breakEndTime || '13:00';

    if (clinicWorkingHours && clinicWorkingHours[dayOfWeek]) {
      const cfg = clinicWorkingHours[dayOfWeek];
      if (cfg.active === false) {
        return {
          isActive: false,
          allSlots: [] as DaySlotItem[],
          bookedAppts: dayAppts,
          vacantSlots: [] as DaySlotItem[],
          bookedCount: dayAppts.length,
          vacantCount: 0,
          encaixeCount: encaixeAppts.length,
        };
      }
      dayActive = true;
      if (cfg.start) {
        const [sh, sm] = cfg.start.split(':').map(Number);
        startH = sh;
        startM = sm || 0;
      }
      if (cfg.end) {
        const [eh, em] = cfg.end.split(':').map(Number);
        endH = eh;
        endM = em || 0;
      }
      if (cfg.lunchStart && cfg.lunchEnd) {
        bStart = cfg.lunchStart;
        bEnd = cfg.lunchEnd;
      }
    } else {
      dayActive = true;
      const wStart = meta?.workStartTime || clinic?.workStartTime || '08:00';
      const wEnd = meta?.workEndTime || clinic?.workEndTime || '17:00';
      bStart = meta?.breakStartTime || clinic?.breakStartTime || '12:00';
      bEnd = meta?.breakEndTime || clinic?.breakEndTime || '13:00';

      const [sh, sm] = wStart.split(':').map(Number);
      startH = sh;
      startM = sm || 0;
      const [eh, em] = wEnd.split(':').map(Number);
      endH = eh;
      endM = em || 0;
    }

    if (meta?.breakEnabled !== undefined) {
      hasBreak = Boolean(meta.breakEnabled);
    } else if (clinic?.breakEnabled !== undefined) {
      hasBreak = Boolean(clinic.breakEnabled);
    }

    const [bsh, bsm] = bStart.split(':').map(Number);
    const [beh, bem] = bEnd.split(':').map(Number);
    const lunchStartMinutes = (bsh || 12) * 60 + (bsm || 0);
    const lunchEndMinutes = (beh || 13) * 60 + (bem || 0);

    const normDur = Number(meta?.slotDurationMinutes || clinic?.slotDurationMinutes) || 45;
    const retDur = Number(meta?.returnSlotDurationMinutes || clinic?.returnSlotDurationMinutes) || 25;
    const returnSlotTimesList: string[] = Array.isArray(meta?.returnSlotTimes)
      ? meta.returnSlotTimes
      : Array.isArray(clinic?.returnSlotTimes)
      ? clinic.returnSlotTimes
      : [];
    const returnSet = new Set(returnSlotTimesList);

    // Gerar grade sequencial dinâmica considerando a duração exata dos retornos
    const slots: DaySlotItem[] = [];
    let curMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (curMinutes < endMinutes) {
      // Pular intervalo se aplicável
      if (hasBreak && curMinutes >= lunchStartMinutes && curMinutes < lunchEndMinutes) {
        curMinutes = lunchEndMinutes;
        continue;
      }

      const h = Math.floor(curMinutes / 60);
      const m = curMinutes % 60;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const isReturn = returnSet.has(timeStr);
      const dur = isReturn ? retDur : normDur;

      // Se a consulta cruzaria com o início do intervalo
      if (hasBreak && curMinutes < lunchStartMinutes && curMinutes + dur > lunchStartMinutes) {
        curMinutes = lunchEndMinutes;
        continue;
      }

      // Se ultrapassar o encerramento do expediente
      if (curMinutes + dur > endMinutes) {
        break;
      }

      const endH_ = Math.floor((curMinutes + dur) / 60);
      const endM_ = (curMinutes + dur) % 60;
      const endTimeStr = `${String(endH_).padStart(2, '0')}:${String(endM_).padStart(2, '0')}`;

      slots.push({
        time: timeStr,
        endTime: endTimeStr,
        duration: dur,
        isReturn,
      });

      curMinutes += dur;
    }

    // Identificar quais slots estão ocupados por consultas
    const vacantSlots: DaySlotItem[] = [];
    slots.forEach((slotItem) => {
      const isOccupied = dayAppts.some((a) => {
        const d = new Date(a.startTime);
        const apptTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return apptTime === slotItem.time;
      });
      if (!isOccupied) {
        vacantSlots.push(slotItem);
      }
    });

    return {
      isActive: true,
      allSlots: slots,
      bookedAppts: dayAppts,
      vacantSlots,
      bookedCount: dayAppts.length,
      vacantCount: vacantSlots.length,
      encaixeCount: encaixeAppts.length,
    };
  };

  // Navegação anterior / próximo de acordo com a perspectiva
  const handleNavigate = (direction: 'prev' | 'next') => {
    const d = new Date(selectedDate);
    const step = direction === 'next' ? 1 : -1;

    if (agendaViewMode === 'dia') {
      d.setDate(d.getDate() + step);
    } else if (agendaViewMode === '3dias') {
      d.setDate(d.getDate() + step * 3);
    } else if (agendaViewMode === 'semana') {
      d.setDate(d.getDate() + step * 7);
    } else if (agendaViewMode === 'mes') {
      d.setMonth(d.getMonth() + step);
      setViewMonthDate(new Date(d));
    }
    setSelectedDate(d);
  };

  const handleGoToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setViewMonthDate(today);
  };

  // Obter dias da visualização '3dias'
  const threeDaysList = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(selectedDate);
      d.setDate(selectedDate.getDate() + i);
      list.push(d);
    }
    return list;
  }, [selectedDate]);

  // Obter dias da visualização 'semana' (iniciando no Domingo da semana da selectedDate)
  const weekDaysList = useMemo(() => {
    const list: Date[] = [];
    const base = new Date(selectedDate);
    const dayOfWeek = base.getDay(); // 0 = Domingo
    const startOfWeek = new Date(base);
    startOfWeek.setDate(base.getDate() - dayOfWeek);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      list.push(d);
    }
    return list;
  }, [selectedDate]);

  // Gerar dias do mês para a visualização 'mes'
  const monthGridDays = useMemo(() => {
    const year = viewMonthDate.getFullYear();
    const month = viewMonthDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{
      date: Date;
      dayNumber: number;
      inCurrentMonth: boolean;
      slotsInfo: ReturnType<typeof getDaySlotsInfo>;
    }> = [];

    // Dias do mês anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const d = new Date(year, month - 1, dayNum);
      days.push({
        date: d,
        dayNumber: dayNum,
        inCurrentMonth: false,
        slotsInfo: getDaySlotsInfo(d),
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        dayNumber: i,
        inCurrentMonth: true,
        slotsInfo: getDaySlotsInfo(d),
      });
    }

    // Completar até 35 ou 42 células
    const totalCells = days.length > 35 ? 42 : 35;
    const remaining = totalCells - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        dayNumber: i,
        inCurrentMonth: false,
        slotsInfo: getDaySlotsInfo(d),
      });
    }

    return days;
  }, [viewMonthDate, appointments, clinicWorkingHours, slotDuration, searchQuery, clinic]);

  // Informações do dia atualmente selecionado
  const currentDayInfo = useMemo(() => {
    return getDaySlotsInfo(selectedDate);
  }, [selectedDate, appointments, clinicWorkingHours, slotDuration, searchQuery, clinic]);

  // Estilo de status das consultas (estilo Google Calendar + Saúde)
  const getAppointmentBadge = (appt: any) => {
    const s = (appt.status || '').toUpperCase();
    const isEncaixe = s === 'ENCAIXE' || (appt.notes && appt.notes.toUpperCase().includes('ENCAIXE'));

    if (isEncaixe) {
      return {
        bg: 'bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/30 ring-2 ring-purple-300 ring-offset-1',
        border: 'border-l-4 border-l-purple-950',
        softBg: 'bg-purple-50 text-purple-900 border-purple-200',
        tag: '⚡ Encaixe',
        isEncaixe: true,
      };
    }
    if (s === 'CONFIRMADO' || s === 'CONFIRMED') {
      return {
        bg: 'bg-emerald-600 text-white',
        border: 'border-l-4 border-l-emerald-800',
        softBg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
        tag: 'Confirmado',
        isEncaixe: false,
      };
    }
    if (s === 'REMARCADO' || s === 'RESCHEDULED') {
      return {
        bg: 'bg-sky-600 text-white',
        border: 'border-l-4 border-l-sky-800',
        softBg: 'bg-sky-50 text-sky-900 border-sky-200',
        tag: 'Remarcado',
        isEncaixe: false,
      };
    }
    if (s === 'CANCELADO' || s === 'CANCELED') {
      return {
        bg: 'bg-rose-500 text-white',
        border: 'border-l-4 border-l-rose-700',
        softBg: 'bg-rose-50 text-rose-900 border-rose-200',
        tag: 'Cancelado',
        isEncaixe: false,
      };
    }
    // Padrão: Aguardando / Agendado (Google Blue)
    return {
      bg: 'bg-[#1a73e8] text-white',
      border: 'border-l-4 border-l-blue-800',
      softBg: 'bg-blue-50 text-blue-900 border-blue-200',
      tag: 'Agendado',
      isEncaixe: false,
    };
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white select-none relative overflow-hidden font-sans">
      {/* =========================================================================
          1. TOP APP BAR (GOOGLE CALENDAR ESTILO MOBILE FIEL)
      ========================================================================= */}
      <header className="h-14 sm:h-16 border-b border-[#dadce0] bg-white flex items-center justify-between px-2 sm:px-4 z-30 shrink-0">
        {/* LADO ESQUERDO: HAMBURGUER + TÍTULO DO MÊS COM CHEVRON */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* BOTÃO DO MENU HAMBÚRGUER */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] active:bg-[#e8eaed] transition"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5 text-[#3c4043]" />
          </button>

          {/* TÍTULO DO MÊS COM DROPDOWN */}
          <div className="relative">
            <button
              onClick={() => setMonthPickerOpen(!monthPickerOpen)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg hover:bg-[#f1f3f4] text-[#202124] transition font-medium text-lg sm:text-xl tracking-tight"
            >
              <span>{MONTH_NAMES[selectedDate.getMonth()]}</span>
              <ChevronDown className="w-4 h-4 text-[#5f6368] stroke-[2.5]" />
            </button>

            {/* POPUP DE SELEÇÃO RÁPIDA DE MÊS */}
            {monthPickerOpen && (
              <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {selectedDate.getFullYear()}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        const d = new Date(selectedDate);
                        d.setFullYear(d.getFullYear() - 1);
                        setSelectedDate(d);
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const d = new Date(selectedDate);
                        d.setFullYear(d.getFullYear() + 1);
                        setSelectedDate(d);
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-xs text-center font-medium">
                  {MONTH_NAMES.map((m, idx) => {
                    const isCur = selectedDate.getMonth() === idx;
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          const d = new Date(selectedDate);
                          d.setMonth(idx);
                          setSelectedDate(d);
                          setViewMonthDate(d);
                          setMonthPickerOpen(false);
                        }}
                        className={`py-2 rounded-xl transition ${
                          isCur
                            ? 'bg-[#1a73e8] text-white font-bold shadow-xs'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {m.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LADO DIREITO: ÍCONES DE BUSCA, HOJE (CALENDÁRIO COM PONTO AZUL), MENU 3 PONTOS */}
        <div className="flex items-center space-x-0.5 sm:space-x-1">
          {/* BUSCADOR */}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
              searchOpen ? 'bg-blue-50 text-[#1a73e8]' : 'text-[#5f6368] hover:bg-[#f1f3f4]'
            }`}
            title="Pesquisar consultas"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* ÍCONE DE "HOJE" (CALENDÁRIO GOOGLE COM DIA DO MÊS / PONTO AZUL) */}
          <button
            onClick={handleGoToday}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] relative transition"
            title="Ir para Hoje"
          >
            <div className="w-5 h-5 border-2 border-[#5f6368] rounded-[4px] flex flex-col items-center justify-center relative">
              <div className="w-full h-1 bg-[#5f6368] absolute top-0 left-0 right-0"></div>
              {/* Ponto azul indicador do Google Calendar */}
              <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8] mt-0.5"></span>
            </div>
          </button>

          {/* MENU 3 PONTOS */}
          <div className="relative">
            <button
              onClick={() => setMenuMoreOpen(!menuMoreOpen)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition"
              title="Mais opções"
            >
              <MoreVertical className="w-5 h-5 text-[#3c4043]" />
            </button>

            {menuMoreOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in">
                <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Visualização
                </div>
                <button
                  onClick={() => {
                    setAgendaViewMode('dia');
                    setMenuMoreOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 transition ${
                    agendaViewMode === 'dia' ? 'font-bold text-[#1a73e8] bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CalendarIcon className="w-4 h-4 text-[#1a73e8]" />
                  <span>Dia</span>
                </button>
                <button
                  onClick={() => {
                    setAgendaViewMode('3dias');
                    setMenuMoreOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 transition ${
                    agendaViewMode === '3dias' ? 'font-bold text-[#1a73e8] bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CalendarRange className="w-4 h-4 text-[#1a73e8]" />
                  <span>3 dias</span>
                </button>
                <button
                  onClick={() => {
                    setAgendaViewMode('semana');
                    setMenuMoreOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 transition ${
                    agendaViewMode === 'semana' ? 'font-bold text-[#1a73e8] bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CalendarDays className="w-4 h-4 text-[#1a73e8]" />
                  <span>Semana</span>
                </button>
                <button
                  onClick={() => {
                    setAgendaViewMode('mes');
                    setMenuMoreOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 transition ${
                    agendaViewMode === 'mes' ? 'font-bold text-[#1a73e8] bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-4 h-4 rounded border-2 border-[#1a73e8] flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8]"></span>
                  </div>
                  <span>Mês</span>
                </button>
                <div className="my-1 border-t border-slate-100"></div>
                <button
                  onClick={() => {
                    onOpenNewAppt(selectedDate);
                    setMenuMoreOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm font-bold text-[#1a73e8] hover:bg-blue-50 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-[#1a73e8]" />
                  <span>Nova Consulta</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          BARRA DE PESQUISA EXPANSÍVEL (LUPA) + RESULTADOS DE CONSULTAS DO PACIENTE
      ========================================================================= */}
      {searchOpen && (
        <div className="relative z-30">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 animate-in slide-in-from-top-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Digite o nome, CPF ou telefone do paciente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-slate-600 transition"
                title="Limpar texto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* PAINEL DE RESULTADOS COM TODAS AS CONSULTAS DO PACIENTE */}
          {searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full max-h-[70vh] bg-white border-b border-slate-200 shadow-2xl overflow-y-auto z-50">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  {searchResults.length === 0
                    ? `Nenhuma consulta encontrada para "${searchQuery}"`
                    : `${searchResults.length} consulta${searchResults.length === 1 ? '' : 's'} encontrada${searchResults.length === 1 ? '' : 's'}`}
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-[#1a73e8] hover:text-blue-800 font-bold"
                >
                  Limpar filtro
                </button>
              </div>

              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <User className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-[1.5]" />
                  <p className="text-sm font-semibold text-slate-600">Nenhuma consulta encontrada</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Verifique se o nome, CPF ou telefone do paciente foram digitados corretamente.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 p-2 space-y-1">
                  {searchResults.map((appt) => {
                    const start = new Date(appt.startTime);
                    const end = new Date(appt.endTime || appt.startTime);
                    const badge = getAppointmentBadge(appt);
                    const formattedDate = start.toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    });
                    const startTimeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const endTimeStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div
                        key={appt.id}
                        onClick={() => {
                          setSelectedDate(start);
                          setAgendaViewMode('dia');
                          onOpenApptDetails(appt);
                          setSearchOpen(false);
                        }}
                        className="p-3 rounded-2xl hover:bg-blue-50/60 cursor-pointer transition flex items-center justify-between gap-3 group border border-transparent hover:border-blue-100 active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-[#1a73e8] font-bold flex items-center justify-center text-sm shrink-0 shadow-2xs group-hover:bg-[#1a73e8] group-hover:text-white transition">
                            {appt.patient?.name ? appt.patient.name.slice(0, 2).toUpperCase() : 'PC'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-slate-900 truncate">
                                {appt.patient?.name || 'Paciente sem nome'}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg} text-white shrink-0`}>
                                {badge.tag}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                              {appt.patient?.cpf && (
                                <span className="font-mono text-[11px] text-slate-600">
                                  CPF: {applyCPFMask(appt.patient.cpf)}
                                </span>
                              )}
                              {appt.patient?.phone && (
                                <span className="text-slate-600 font-medium flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {appt.patient.phone}
                                </span>
                              )}
                              <span className="text-[#1a73e8] font-bold flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3 text-[#1a73e8]" />
                                {formattedDate} às {startTimeStr} - {endTimeStr}
                              </span>
                            </div>
                            {appt.notes && (
                              <p className="text-[11px] text-slate-400 italic truncate mt-0.5">
                                Nota: {appt.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="text-xs font-bold text-[#1a73e8] group-hover:underline flex items-center gap-1">
                            Ver detalhes →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          2. CONTEÚDO PRINCIPAL: PERSPECTIVAS (ESTILO GOOGLE CALENDAR)
      ========================================================================= */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* =======================================================================
            PERSPECTIVA 1: MÊS (MONTH VIEW) - IDÊNTICA AO GOOGLE CALENDAR
        ======================================================================= */}
        {agendaViewMode === 'mes' && (
          <div className="flex-1 flex flex-col h-full bg-white overflow-y-auto">
            {/* CABEÇALHO DOS DIAS DA SEMANA (D, S, T, Q, Q, S, S) */}
            <div className="grid grid-cols-7 border-b border-[#dadce0] bg-white sticky top-0 z-10 text-center py-2 text-[12px] font-normal text-[#70757a]">
              {WEEKDAYS_SINGLE.map((d, idx) => {
                const isTodayCol = idx === new Date().getDay();
                return (
                  <div key={idx} className={isTodayCol ? 'text-[#1a73e8] font-bold' : ''}>
                    {d}
                  </div>
                );
              })}
            </div>

            {/* GRADE DO MÊS */}
            <div className="flex-1 grid grid-cols-7 auto-rows-fr divide-x divide-y divide-[#dadce0] border-b border-[#dadce0]">
              {monthGridDays.map((cell, idx) => {
                const isCurToday = isToday(cell.date);
                const { bookedCount, vacantCount, encaixeCount } = cell.slotsInfo;

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedDate(cell.date);
                      setAgendaViewMode('dia'); // Ao clicar no dia do mês, abre o dia!
                    }}
                    className={`min-h-[70px] sm:min-h-[95px] p-1 pt-1.5 flex flex-col items-center text-center transition-colors relative hover:bg-slate-50/60 active:bg-blue-50/30 ${
                      !cell.inCurrentMonth ? 'bg-slate-50/30' : 'bg-white'
                    }`}
                  >
                    {/* NÚMERO DO DIA */}
                    <div className="flex justify-center mb-1">
                      <span
                        className={`text-xs sm:text-sm rounded-full flex items-center justify-center transition ${
                          isCurToday
                            ? 'w-7 h-7 bg-[#1a73e8] text-white font-bold'
                            : !cell.inCurrentMonth
                            ? 'text-[#9aa0a6] font-normal'
                            : 'text-[#3c4043] font-normal'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                    </div>

                    {/* SINALIZAÇÃO POR CORES EM BOLINHA COM O NÚMERO (SEM TEXTO) */}
                    <div className="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
                      {/* BOLINHA AZUL COM O NÚMERO DE CONSULTAS */}
                      {bookedCount > 0 && (
                        <span
                          className="w-5 h-5 rounded-full bg-[#1a73e8] text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-2xs"
                          title={`${bookedCount} consulta(s) agendada(s)`}
                        >
                          {bookedCount}
                        </span>
                      )}

                      {/* BOLINHA ROXA COM O NÚMERO DE ENCAIXES */}
                      {encaixeCount > 0 && (
                        <span
                          className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-2xs ring-1 ring-purple-300"
                          title={`${encaixeCount} consulta(s) de encaixe`}
                        >
                          ⚡{encaixeCount}
                        </span>
                      )}

                      {/* BOLINHA LARANJA COM O NÚMERO DE VAGAS */}
                      {vacantCount > 0 && cell.slotsInfo.isActive && (
                        <span
                          className="w-5 h-5 rounded-full bg-[#f29900] text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-2xs"
                          title={`${vacantCount} horário(s) vago(s)`}
                        >
                          {vacantCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* =======================================================================
            PERSPECTIVA 2: DIA (DAY VIEW) - FIEL À IMAGEM 3
        ======================================================================= */}
        {agendaViewMode === 'dia' && (
          <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
            {/* CABEÇALHO DO DIA (EX: SEX 23) */}
            <div className="flex border-b border-[#dadce0] bg-white sticky top-0 z-20 py-2.5">
              {/* ESPAÇO DO EIXO DE HORAS (54px) */}
              <div className="w-14 sm:w-16 shrink-0 text-center"></div>

              {/* COLUNA DO DIA */}
              <div className="flex-1 flex flex-col items-start pl-2">
                <span className={`text-[11px] font-bold tracking-wider uppercase ${isToday(selectedDate) ? 'text-[#1a73e8]' : 'text-[#70757a]'}`}>
                  {WEEKDAYS_SHORT[selectedDate.getDay()]}
                </span>
                <span
                  className={`text-lg font-bold rounded-full w-8 h-8 flex items-center justify-center mt-0.5 ${
                    isToday(selectedDate)
                      ? 'bg-[#1a73e8] text-white shadow-xs'
                      : 'text-[#3c4043]'
                  }`}
                >
                  {selectedDate.getDate()}
                </span>
              </div>
            </div>

            {/* GRADE DA TIMELINE COM HORÁRIOS VAGOS E AGENDADOS */}
            <div className="flex-1 overflow-y-auto relative bg-white">
              {/* AVISO SE A AGENDA ESTIVER FECHADA / SEM ATENDIMENTO NO DIA */}
              {!currentDayInfo.isActive && (
                <div className="mx-4 my-2.5 p-3 rounded-xl bg-slate-100/90 border border-slate-200 text-slate-600 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    <strong>Agenda Fechada / Sem Atendimento:</strong> Este dia está fora dos dias da semana ou do período de datas aberto em &ldquo;Criar Agenda&rdquo;.
                  </span>
                </div>
              )}

              {/* LINHA DE TEMPO ATUAL (INDICADOR DO GOOGLE CALENDAR EM TEMPO REAL) */}
              {isToday(selectedDate) && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                  style={{
                    top: `${((nowMinuteOfDay - 7 * 60) / 60) * 64}px`, // 64px por hora
                  }}
                >
                  {/* Ponto vermelho/escuro no eixo */}
                  <div className="w-14 sm:w-16 flex justify-end pr-1 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1a73e8] -mr-1.5 shadow-xs"></span>
                  </div>
                  {/* Linha horizontal */}
                  <div className="flex-1 h-[2px] bg-[#1a73e8]"></div>
                </div>
              )}

              {/* LINHAS DAS HORAS */}
              <div className="relative">
                {timelineHours.map((hour) => {
                  const hourFormatted = `${String(hour).padStart(2, '0')}:00`;

                  // Filtrar consultas deste horário
                  const apptsInHour = currentDayInfo.bookedAppts.filter((a) => {
                    const d = new Date(a.startTime);
                    return d.getHours() === hour;
                  });

                  // Verificar se este horário tem slots vagos
                  const vacantInHour = currentDayInfo.vacantSlots.filter((v) => {
                    const h = parseInt(v.time.split(':')[0], 10);
                    return h === hour;
                  });

                  return (
                    <div
                      key={hour}
                      className="min-h-[64px] border-b border-[#f1f3f4] flex relative group hover:bg-slate-50/40 transition"
                    >
                      {/* RÓTULO DA HORA À ESQUERDA */}
                      <div className="w-14 sm:w-16 shrink-0 text-right pr-3 -mt-2.5 text-[11px] font-semibold text-[#70757a] select-none">
                        {hourFormatted}
                      </div>

                      {/* CONTEÚDO DA HORA (CONSULTAS OU SLOTS VAGOS) */}
                      <div className="flex-1 pl-2 pr-3 py-1 flex flex-col gap-1.5 justify-center border-l border-[#dadce0]">
                        {/* 1. CONSULTAS AGENDADAS NESSE HORÁRIO */}
                        {apptsInHour.map((appt) => {
                          const badge = getAppointmentBadge(appt);
                          const start = new Date(appt.startTime);
                          const end = new Date(appt.endTime || appt.startTime);
                          const startTimeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const endTimeStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                          return (
                            <div
                              key={appt.id}
                              onClick={() => onOpenApptDetails(appt)}
                              className={`p-2.5 rounded-xl shadow-xs cursor-pointer transition active:scale-[0.99] hover:shadow-md ${badge.bg} ${badge.border} flex items-center justify-between gap-2`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-sm truncate">
                                    {appt.patient?.name || 'Paciente sem nome'}
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge.isEncaixe ? 'bg-amber-300 text-purple-950 font-black shadow-xs' : 'bg-white/20 text-white'} shrink-0`}>
                                    {badge.tag}
                                  </span>
                                </div>
                                <div className="text-xs text-white/90 flex items-center gap-2 mt-0.5 truncate">
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span>{startTimeStr} - {endTimeStr}</span>
                                  {appt.patient?.phone && (
                                    <span className="truncate opacity-80">• {appt.patient.phone}</span>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenApptDetails(appt);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold shrink-0 transition"
                              >
                                Ficha Cadastral
                              </button>
                            </div>
                          );
                        })}

                        {/* 2. HORÁRIOS VAGOS DISPONÍVEIS NESTE INTERVALO */}
                        {vacantInHour.map((vacSlot) => (
                          <div
                            key={vacSlot.time}
                            onClick={() => onOpenNewAppt(selectedDate, vacSlot.time)}
                            className={`p-2.5 rounded-xl border border-dashed transition active:scale-[0.99] group/slot cursor-pointer flex items-center justify-between ${
                              vacSlot.isReturn
                                ? 'border-sky-300 bg-sky-50/70 hover:bg-sky-100/80 hover:border-sky-400 text-sky-950 shadow-2xs'
                                : 'border-amber-300 bg-amber-50/60 hover:bg-amber-100/70 hover:border-amber-400 text-amber-900'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`w-2.5 h-2.5 rounded-full ${vacSlot.isReturn ? 'bg-sky-500' : 'bg-amber-500'}`}></span>
                              <span className="font-extrabold text-xs">{vacSlot.time} - {vacSlot.endTime}</span>
                              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                                vacSlot.isReturn ? 'bg-sky-100 text-sky-800 border border-sky-200' : 'bg-amber-100/80 text-amber-800'
                              }`}>
                                {vacSlot.isReturn ? `Retorno (${vacSlot.duration}m)` : `1ª Vez (${vacSlot.duration}m)`}
                              </span>
                              <span className="text-xs text-slate-500 font-medium hidden sm:inline">• Horário Vago Disponível</span>
                            </div>
                            <span className={`text-[11px] font-extrabold flex items-center gap-1 shrink-0 ${
                              vacSlot.isReturn ? 'text-sky-700 group-hover/slot:text-sky-900' : 'text-amber-700 group-hover/slot:text-amber-900'
                            }`}>
                              <Plus className="w-3 h-3 stroke-[3]" />
                              Agendar
                            </span>
                          </div>
                        ))}

                        {/* Se não houver nada agendado nem vago (fora de expediente) */}
                        {apptsInHour.length === 0 && vacantInHour.length === 0 && (
                          currentDayInfo.isActive ? (
                            <div
                              onClick={() => onOpenNewAppt(selectedDate, hourFormatted)}
                              className="h-9 rounded-lg hover:bg-slate-100/80 cursor-pointer flex items-center px-2 text-slate-300 hover:text-slate-500 text-xs transition"
                            >
                              + Toque para agendar em {hourFormatted}
                            </div>
                          ) : (
                            <div className="h-9 flex items-center px-2 text-slate-300/30 text-xs select-none">
                              —
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =======================================================================
            PERSPECTIVA 3: 3 DIAS (3 DAYS VIEW) - FIEL À IMAGEM 1
        ======================================================================= */}
        {agendaViewMode === '3dias' && (
          <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
            {/* CABEÇALHO DAS 3 COLUNAS */}
            <div className="flex border-b border-[#dadce0] bg-white sticky top-0 z-20 py-2">
              {/* ESPAÇO DO EIXO (50px) */}
              <div className="w-12 sm:w-14 shrink-0"></div>

              {/* 3 COLUNAS DE DIAS */}
              <div className="flex-1 grid grid-cols-3 divide-x divide-[#dadce0]">
                {threeDaysList.map((d, idx) => {
                  const curToday = isToday(d);
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(d)}
                      className="flex flex-col items-center justify-center py-1 hover:bg-slate-50 transition"
                    >
                      <span className={`text-[11px] font-bold tracking-wider uppercase ${curToday ? 'text-[#1a73e8]' : 'text-[#70757a]'}`}>
                        {WEEKDAYS_SHORT[d.getDay()]}
                      </span>
                      <span
                        className={`text-base font-bold rounded-full w-7 h-7 flex items-center justify-center mt-0.5 ${
                          curToday ? 'bg-[#1a73e8] text-white shadow-xs' : 'text-[#3c4043]'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TIMELINE DE 3 COLUNAS */}
            <div className="flex-1 overflow-y-auto relative bg-white">
              {/* LINHAS HORÁRIAS */}
              {timelineHours.map((hour) => {
                const hourFormatted = `${String(hour).padStart(2, '0')}:00`;

                return (
                  <div key={hour} className="min-h-[64px] border-b border-[#f1f3f4] flex relative">
                    {/* Eixo da hora */}
                    <div className="w-12 sm:w-14 shrink-0 text-right pr-2 -mt-2.5 text-[10px] sm:text-[11px] font-semibold text-[#70757a]">
                      {hourFormatted}
                    </div>

                    {/* 3 Colunas de conteúdo */}
                    <div className="flex-1 grid grid-cols-3 divide-x divide-[#dadce0] border-l border-[#dadce0]">
                      {threeDaysList.map((colDate, colIdx) => {
                        const daySlots = getDaySlotsInfo(colDate);
                        const apptsInHour = daySlots.bookedAppts.filter((a) => {
                          const d = new Date(a.startTime);
                          return d.getHours() === hour;
                        });
                        const vacantInHour = daySlots.vacantSlots.filter((v) => {
                          const h = parseInt(v.time.split(':')[0], 10);
                          return h === hour;
                        });

                        return (
                          <div
                            key={colIdx}
                            className={`p-1 flex flex-col gap-1 justify-center relative transition ${
                              daySlots.isActive
                                ? 'hover:bg-blue-50/20 cursor-pointer'
                                : 'bg-slate-50/40 cursor-default select-none'
                            }`}
                            onClick={() => {
                              if (daySlots.isActive) {
                                onOpenNewAppt(colDate, hourFormatted);
                              }
                            }}
                          >
                            {/* Consultas Agendadas */}
                            {apptsInHour.map((appt) => {
                              const badge = getAppointmentBadge(appt);
                              return (
                                <div
                                  key={appt.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenApptDetails(appt);
                                  }}
                                  className={`p-1.5 rounded-lg text-white ${badge.bg} shadow-xs truncate`}
                                  title={`${appt.patient?.name} (${badge.tag})`}
                                >
                                  <div className="text-[11px] font-bold truncate leading-tight">
                                    {appt.patient?.name}
                                  </div>
                                  <div className="text-[9px] opacity-90 truncate">
                                    {new Date(appt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {badge.tag}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Vaga Disponível */}
                            {vacantInHour.map((v) => (
                              <div
                                key={v.time}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenNewAppt(colDate, v.time);
                                }}
                                className={`px-1.5 py-0.5 rounded border border-dashed text-[10px] font-bold flex items-center justify-between ${
                                  v.isReturn
                                    ? 'border-sky-300 bg-sky-50 text-sky-900'
                                    : 'border-amber-300 bg-amber-50/70 text-amber-900'
                                }`}
                              >
                                <span>{v.time}</span>
                                <span className="text-[9px] font-semibold">{v.isReturn ? 'Retorno' : 'Vago'}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =======================================================================
            PERSPECTIVA 4: SEMANA (WEEK VIEW - 7 DIAS) - FIEL À IMAGEM 2
        ======================================================================= */}
        {agendaViewMode === 'semana' && (
          <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
            {/* CABEÇALHO DAS 7 COLUNAS */}
            <div className="flex border-b border-[#dadce0] bg-white sticky top-0 z-20 py-1.5">
              {/* ESPAÇO DO EIXO (44px) */}
              <div className="w-11 sm:w-14 shrink-0"></div>

              {/* 7 COLUNAS */}
              <div className="flex-1 grid grid-cols-7 divide-x divide-[#dadce0]">
                {weekDaysList.map((d, idx) => {
                  const curToday = isToday(d);
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(d)}
                      className="flex flex-col items-center justify-center py-0.5 hover:bg-slate-50 transition"
                    >
                      <span className={`text-[10px] font-bold tracking-wider uppercase ${curToday ? 'text-[#1a73e8]' : 'text-[#70757a]'}`}>
                        {WEEKDAYS_SINGLE[d.getDay()]}
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center mt-0.5 ${
                          curToday ? 'bg-[#1a73e8] text-white shadow-xs' : 'text-[#3c4043]'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TIMELINE DE 7 COLUNAS */}
            <div className="flex-1 overflow-y-auto relative bg-white">
              {timelineHours.map((hour) => {
                const hourFormatted = `${String(hour).padStart(2, '0')}:00`;

                return (
                  <div key={hour} className="min-h-[56px] border-b border-[#f1f3f4] flex relative">
                    <div className="w-11 sm:w-14 shrink-0 text-right pr-1.5 -mt-2 text-[10px] font-semibold text-[#70757a]">
                      {hourFormatted}
                    </div>

                    <div className="flex-1 grid grid-cols-7 divide-x divide-[#dadce0] border-l border-[#dadce0]">
                      {weekDaysList.map((colDate, colIdx) => {
                        const daySlots = getDaySlotsInfo(colDate);
                        const apptsInHour = daySlots.bookedAppts.filter((a) => {
                          const d = new Date(a.startTime);
                          return d.getHours() === hour;
                        });
                        const hasVacant = daySlots.vacantSlots.some((v) => parseInt(v.time.split(':')[0], 10) === hour);

                        return (
                          <div
                            key={colIdx}
                            className={`p-0.5 flex flex-col gap-0.5 justify-center relative transition ${
                              daySlots.isActive
                                ? 'hover:bg-blue-50/20 cursor-pointer'
                                : 'bg-slate-50/40 cursor-default select-none'
                            }`}
                            onClick={() => {
                              if (daySlots.isActive) {
                                onOpenNewAppt(colDate, hourFormatted);
                              }
                            }}
                          >
                            {apptsInHour.map((appt) => {
                              const badge = getAppointmentBadge(appt);
                              return (
                                <div
                                  key={appt.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenApptDetails(appt);
                                  }}
                                  className={`p-1 rounded text-white ${badge.bg} text-[10px] font-bold truncate leading-tight shadow-2xs`}
                                  title={`${appt.patient?.name} - ${badge.tag}`}
                                >
                                  {appt.patient?.name?.split(' ')[0]}
                                </div>
                              );
                            })}

                            {apptsInHour.length === 0 && hasVacant && (
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mx-auto opacity-70" title="Horário vago disponível"></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          3. FLOATING ACTION BUTTON (FAB DO GOOGLE CALENDAR COM O ÍCONE + COLORIDO)
          Oculto na visualização de mês e em telas menores (onde a barra mobile exibe o botão dedicado na Agenda).
      ========================================================================= */}
      {agendaViewMode !== 'mes' && (
        <button
          onClick={() => onOpenNewAppt(selectedDate)}
          className="hidden sm:flex fixed sm:bottom-8 sm:right-8 w-14 h-14 bg-white rounded-full shadow-2xl border border-slate-100 items-center justify-center z-40 active:scale-90 hover:scale-105 transition duration-200 group"
          aria-label="Criar nova consulta"
          title="Criar nova consulta"
        >
          {/* Ícone + com as 4 cores características do Google */}
          <svg viewBox="0 0 36 36" className="w-8 h-8 drop-shadow-xs">
            <path fill="#4285F4" d="M16 16v14h4V16h14v-4H20V2h-4v10H2v4h14z" />
            <path fill="#FBBC05" d="M16 16H2v4h14v10h4V20z" opacity="0" />
            {/* Versão estilizada do Google Plus SVG */}
            <path fill="#EA4335" d="M16 2h4v14h-4z" />
            <path fill="#4285F4" d="M20 16h14v4H20z" />
            <path fill="#FBBC05" d="M16 20h4v14h-4z" />
            <path fill="#34A853" d="M2 16h14v4H2z" />
          </svg>
        </button>
      )}

      {/* =========================================================================
          4. GOOGLE CALENDAR SIDE DRAWER (MENU LATERAL DESLIZANTE)
      ========================================================================= */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* BACKDROP ESCURO */}
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
          />

          {/* PAINEL DO DRAWER */}
          <div className="relative w-72 sm:w-80 bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-left duration-250">
            <div>
              {/* CABEÇALHO DO DRAWER (CLINIDESK + GOOGLE CALENDAR) */}
              <div className="p-5 border-b border-slate-100 flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#1a73e8] to-blue-400 text-white flex items-center justify-center font-black shadow-md shadow-blue-500/20">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">Iterum • Agenda Médica</h3>
                  <p className="text-xs text-slate-500 font-medium">{activeDoctor.name}</p>
                </div>
              </div>

              {/* LISTA DE PERSPECTIVAS DO GOOGLE CALENDAR */}
              <div className="p-3 space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Visualizações
                </div>

                <button
                  onClick={() => {
                    setAgendaViewMode('dia');
                    setDrawerOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    agendaViewMode === 'dia'
                      ? 'bg-blue-50 text-[#1a73e8] font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CalendarIcon className="w-4 h-4 text-[#1a73e8]" />
                  <span>Dia</span>
                </button>

                <button
                  onClick={() => {
                    setAgendaViewMode('3dias');
                    setDrawerOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    agendaViewMode === '3dias'
                      ? 'bg-blue-50 text-[#1a73e8] font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CalendarRange className="w-4 h-4 text-[#1a73e8]" />
                  <span>3 dias</span>
                </button>

                <button
                  onClick={() => {
                    setAgendaViewMode('semana');
                    setDrawerOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    agendaViewMode === 'semana'
                      ? 'bg-blue-50 text-[#1a73e8] font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CalendarDays className="w-4 h-4 text-[#1a73e8]" />
                  <span>Semana</span>
                </button>

                <button
                  onClick={() => {
                    setAgendaViewMode('mes');
                    setDrawerOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    agendaViewMode === 'mes'
                      ? 'bg-blue-50 text-[#1a73e8] font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="w-4 h-4 rounded border-2 border-[#1a73e8] flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8]"></span>
                  </div>
                  <span>Mês</span>
                </button>
              </div>

              {/* SEPARADOR */}
              <div className="my-2 border-t border-slate-100"></div>

              {/* ACESSO AOS OUTROS MÓDULOS DO SISTEMA */}
              {onSwitchTab && (
                <div className="p-3 space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Módulos do Sistema
                  </div>
                  <button
                    onClick={() => {
                      onSwitchTab('patients');
                      setDrawerOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>Cadastro de Pacientes</span>
                  </button>
                  <button
                    onClick={() => {
                      onSwitchTab('fila');
                      setDrawerOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>Fila de Espera Inteligente</span>
                  </button>
                  <button
                    onClick={() => {
                      onSwitchTab('whatsapp');
                      setDrawerOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    <span>WhatsApp Bot & Lembretes</span>
                  </button>
                  <button
                    onClick={() => {
                      onSwitchTab('settings');
                      setDrawerOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
                  >
                    <CalendarPlus className="w-4 h-4 text-emerald-600" />
                    <span>Criar Agenda</span>
                  </button>
                  <button
                    onClick={() => {
                      onSwitchTab('profissionais');
                      setDrawerOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Stethoscope className="w-4 h-4 text-emerald-700" />
                    <span>Dados Profissionais</span>
                  </button>
                </div>
              )}
            </div>

            {/* RODAPÉ DO DRAWER COM STATUS DO MÉDICO */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/70">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-[#1a73e8] font-bold flex items-center justify-center text-sm">
                  {activeDoctor.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 truncate">{activeDoctor.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{activeDoctor.specialty}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
