'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  CreditCard,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Building2,
  AlertCircle,
  Sparkles,
  Loader2,
  Users,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';

interface DayAvailability {
  date: string;
  day: number;
  dayOfWeek: number;
  hasSlots: boolean;
  slotCount: number;
  slots: string[];
}

export default function AgendamentoOnlinePage() {
  // Query params
  const [patientPhoneParam, setPatientPhoneParam] = useState('');
  const [patientNameParam, setPatientNameParam] = useState('');

  // Estados de dados
  const [doctorName, setDoctorName] = useState('Dra. Mariana Souza');
  const [clinicName, setClinicName] = useState('Consultório Dra. Mariana');
  const [specialty, setSpecialty] = useState('Pediatria');
  const [loadingMonth, setLoadingMonth] = useState(true);

  // Navegação de 4 meses
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Modal de Confirmação & Cadastro
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isForOtherPerson, setIsForOtherPerson] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientCpf, setPatientCpf] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Submissão
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  // Inicializar parâmetros da URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const phone = params.get('phone') || '';
      const name = params.get('name') || '';
      const forOther = params.get('forOther') === 'true' || params.get('terceiro') === 'true';
      setPatientPhoneParam(phone);
      setPatientNameParam(name);
      setPatientName(name);
      setPatientPhone(formatPhoneMask(phone));
      if (forOther) {
        setIsForOtherPerson(true);
      }
    }
  }, []);

  // Gerar lista dos próximos 4 meses
  const monthsList = useMemo(() => {
    const list: Array<{ label: string; yearMonth: string; year: number; month: number }> = [];
    const now = new Date();

    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const monthStr = String(month).padStart(2, '0');
      const yearMonth = `${year}-${monthStr}`;

      const rawLabel = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

      list.push({ label, yearMonth, year, month });
    }
    return list;
  }, []);

  const activeMonth = monthsList[currentMonthIndex];

  // Carregar disponibilidade do mês selecionado
  useEffect(() => {
    if (!activeMonth) return;

    let isMounted = true;
    setLoadingMonth(true);
    setSelectedDate(null);
    setSelectedSlot(null);

    fetch(`/api/appointments/availability?month=${activeMonth.yearMonth}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success) {
          setDays(data.days || []);
          if (data.doctor?.name) setDoctorName(data.doctor.name);
          if (data.clinic?.name) setClinicName(data.clinic.name);
          if (data.clinic?.specialty) setSpecialty(data.clinic.specialty);

          // Selecionar automaticamente o primeiro dia com vagas
          const firstDayWithSlots = data.days.find((d: DayAvailability) => d.hasSlots);
          if (firstDayWithSlots) {
            setSelectedDate(firstDayWithSlots.date);
          }
        }
      })
      .catch((err) => console.error('Erro ao carregar horários:', err))
      .finally(() => {
        if (isMounted) setLoadingMonth(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeMonth]);

  // Objeto do dia selecionado
  const currentSelectedDay = useMemo(() => {
    if (!selectedDate) return null;
    return days.find((d) => d.date === selectedDate) || null;
  }, [days, selectedDate]);

  // Divisão dos horários em Manhã e Tarde
  const groupedSlots = useMemo(() => {
    if (!currentSelectedDay || !currentSelectedDay.slots) return { manha: [], tarde: [] };
    const manha: string[] = [];
    const tarde: string[] = [];

    currentSelectedDay.slots.forEach((s) => {
      const hour = parseInt(s.split(':')[0], 10);
      if (hour < 12) manha.push(s);
      else tarde.push(s);
    });

    return { manha, tarde };
  }, [currentSelectedDay]);

  // Máscaras de entrada
  function formatPhoneMask(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  function formatCpfMask(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  // Clicar em um horário abre o modal de confirmação
  function handleSelectSlot(slot: string) {
    setSelectedSlot(slot);
    setSubmitError(null);
    setIsModalOpen(true);
  }

  // Enviar Agendamento
  async function handleConfirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDate || !selectedSlot) return;

    if (!patientName.trim()) {
      setSubmitError('Por favor, informe o nome completo do paciente.');
      return;
    }

    const cleanCpf = patientCpf.replace(/\D/g, '');
    if (!cleanCpf || cleanCpf.length !== 11) {
      setSubmitError('Por favor, informe o CPF completo do paciente (11 dígitos) para o cadastro no sistema.');
      return;
    }

    if (!patientPhone.replace(/\D/g, '')) {
      setSubmitError('Por favor, informe o telefone de contato do paciente.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const startTime = `${selectedDate} ${selectedSlot}`;

    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime,
          contactPhone: patientPhoneParam || patientPhone,
          patientName: patientName.trim(),
          patientCpf: patientCpf.replace(/\D/g, '') || null,
          patientPhone: patientPhone.replace(/\D/g, ''),
          isForOtherPerson,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao efetivar o agendamento.');
      }

      setSuccessData(data);
      setIsModalOpen(false);
    } catch (err: any) {
      setSubmitError(err.message || 'Erro inesperado ao agendar.');
    } finally {
      setSubmitting(false);
    }
  }

  // Formatador da data para exibição
  function formatDateHeader(dateStr: string) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    }
    return dateStr;
  }

  // Preencher dias vazios antes do dia 1 do mês para o grid do calendário
  const firstDayOfMonthWeekday = useMemo(() => {
    if (!activeMonth) return 0;
    return new Date(activeMonth.year, activeMonth.month - 1, 1).getDay();
  }, [activeMonth]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-emerald-50/30 text-slate-800 antialiased">
      {/* HEADER DA CLÍNICA & MÉDICO */}
      <header className="sticky top-0 z-30 border-b border-teal-100 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                {doctorName}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  Agenda Oficial
                </span>
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                {specialty} • {clinicName}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* BANNER INFORMATIVO */}
        <div className="mb-8 p-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider bg-white/20 px-2.5 py-1 rounded-full mb-1">
              <Sparkles className="w-3.5 h-3.5" /> Agendamento Rápido em 1 Minuto
            </span>
            <h2 className="text-xl font-bold">Escolha o melhor dia e horário para sua consulta</h2>
            <p className="text-teal-50 text-xs sm:text-sm mt-0.5">
              Grade oficial aberta para os próximos 4 meses. Confirmação instantânea via WhatsApp.
            </p>
          </div>
        </div>

        {/* NAVEGAÇÃO DOS PRÓXIMOS 4 MESES */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-teal-600" /> Selecione o Mês
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentMonthIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentMonthIndex === 0}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentMonthIndex((prev) => Math.min(monthsList.length - 1, prev + 1))}
                disabled={currentMonthIndex === monthsList.length - 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Próximo mês"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {monthsList.map((m, index) => {
              const isSelected = index === currentMonthIndex;
              return (
                <button
                  key={m.yearMonth}
                  onClick={() => setCurrentMonthIndex(index)}
                  className={`py-3 px-3 rounded-xl font-medium text-sm transition-all border ${
                    isSelected
                      ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/25 scale-[1.02]'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ÁREA DO CALENDÁRIO E HORÁRIOS */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* COLUNA ESQUERDA: CALENDÁRIO MENSAL */}
          <div className="md:col-span-7 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-base">
                {activeMonth?.label}
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                Selecione um dia com vagas
              </span>
            </div>

            {loadingMonth ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-2" />
                <span className="text-sm font-medium">Consultando agenda médica...</span>
              </div>
            ) : (
              <div>
                {/* DIAS DA SEMANA */}
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((d) => (
                    <div key={d} className="text-[11px] font-bold text-slate-400 py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* GRADE DE DIAS */}
                <div className="grid grid-cols-7 gap-1.5">
                  {/* Espaços vazios antes do dia 1 */}
                  {Array.from({ length: firstDayOfMonthWeekday }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-12" />
                  ))}

                  {/* Dias do mês */}
                  {days.map((d) => {
                    const isSelected = selectedDate === d.date;
                    const hasSlots = d.hasSlots;

                    return (
                      <button
                        key={d.date}
                        disabled={!hasSlots}
                        onClick={() => {
                          setSelectedDate(d.date);
                          setSelectedSlot(null);
                        }}
                        className={`h-12 rounded-xl flex flex-col items-center justify-center relative transition-all border text-xs ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/30 font-bold scale-105 z-10'
                            : hasSlots
                            ? 'bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 border-emerald-200/70 font-semibold cursor-pointer'
                            : 'bg-slate-50/60 text-slate-300 border-transparent cursor-not-allowed'
                        }`}
                      >
                        <span className="text-sm">{d.day}</span>
                        {hasSlots && (
                          <span
                            className={`text-[9px] font-medium leading-none ${
                              isSelected ? 'text-teal-100' : 'text-emerald-700'
                            }`}
                          >
                            {d.slotCount} {d.slotCount === 1 ? 'vaga' : 'vagas'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: HORÁRIOS DO DIA ESCOLHIDO */}
          <div className="md:col-span-5 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col">
            <div className="pb-3 mb-4 border-b border-slate-100">
              <span className="text-xs uppercase font-bold text-teal-700 tracking-wider">
                Horários Disponíveis
              </span>
              <h4 className="font-bold text-slate-900 text-sm capitalize">
                {selectedDate ? formatDateHeader(selectedDate) : 'Nenhum dia selecionado'}
              </h4>
            </div>

            {!selectedDate ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12 text-center">
                <CalendarIcon className="w-10 h-10 stroke-1 mb-2 text-slate-300" />
                <p className="text-sm">Clique em uma data verde no calendário para ver os horários livres.</p>
              </div>
            ) : !currentSelectedDay?.hasSlots ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12 text-center">
                <AlertCircle className="w-10 h-10 stroke-1 mb-2 text-amber-500" />
                <p className="text-sm text-slate-600 font-medium">Não há horários livres para este dia.</p>
                <p className="text-xs text-slate-400 mt-1">Por favor, selecione outra data.</p>
              </div>
            ) : (
              <div className="flex-1 space-y-5 overflow-y-auto max-h-[380px] pr-1">
                {/* MANHÃ */}
                {groupedSlots.manha.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-teal-600" /> Manhã
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {groupedSlots.manha.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => handleSelectSlot(slot)}
                          className="py-2.5 px-2 rounded-xl text-xs font-bold border border-teal-200 bg-teal-50/60 hover:bg-teal-600 hover:text-white hover:border-teal-600 hover:shadow-md transition text-teal-900 flex items-center justify-center gap-1"
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TARDE */}
                {groupedSlots.tarde.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" /> Tarde
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {groupedSlots.tarde.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => handleSelectSlot(slot)}
                          className="py-2.5 px-2 rounded-xl text-xs font-bold border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-md transition text-emerald-900 flex items-center justify-center gap-1"
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL POP-UP: CONFIRMAÇÃO & COMPLEMENTAÇÃO DE DADOS */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Confirmar Agendamento</h3>
                  <p className="text-xs text-slate-500">Preencha os dados do paciente para finalizar</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* RESUMO DO HORÁRIO ESCOLHIDO */}
            <div className="my-5 p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 text-slate-800">
              <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider block mb-1">
                Consulta Selecionada
              </span>
              <p className="text-base font-bold text-slate-900 capitalize">
                {selectedDate ? formatDateHeader(selectedDate) : ''} às {selectedSlot}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Médico(a): <strong>{doctorName}</strong> ({specialty})
              </p>
            </div>

            {submitError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmBooking} className="space-y-4">
              {/* TOGGLE: PARA MIM / OUTRA PESSOA */}
              <div className="p-1 bg-slate-100 rounded-xl flex text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    setIsForOtherPerson(false);
                    if (patientNameParam) setPatientName(patientNameParam);
                    if (patientPhoneParam) setPatientPhone(formatPhoneMask(patientPhoneParam));
                  }}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                    !isForOtherPerson ? 'bg-white text-teal-700 shadow-sm' : 'hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Atendimento para mim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsForOtherPerson(true);
                  }}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                    isForOtherPerson ? 'bg-white text-teal-700 shadow-sm' : 'hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Para outra pessoa
                </button>
              </div>

              {/* NOME COMPLETO */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isForOtherPerson ? 'Nome Completo do Paciente (quem será atendido) *' : 'Nome Completo do Paciente *'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo da Silva"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                  />
                </div>
              </div>

              {/* CPF */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  CPF do Paciente * <span className="text-[11px] font-normal text-slate-500">(Obrigatório para o cadastro)</span>
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={patientCpf}
                    onChange={(e) => setPatientCpf(formatCpfMask(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                  />
                </div>
              </div>

              {/* TELEFONE DE CONTATO / WHATSAPP */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isForOtherPerson ? 'Telefone / Celular do Paciente *' : 'Telefone / WhatsApp *'}
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(formatPhoneMask(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                  />
                </div>
                <span className="text-[11px] text-teal-700 mt-1 block font-medium">
                  {isForOtherPerson && patientPhoneParam
                    ? `O paciente será cadastrado no sistema da clínica. O comprovante também será enviado para o WhatsApp que agendou (${formatPhoneMask(patientPhoneParam)}).`
                    : 'Enviaremos a confirmação oficial imediatamente para este WhatsApp.'}
                </span>
              </div>

              {/* OBSERVAÇÕES */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações / Motivo da consulta (opcional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Primeira consulta, retorno, exames..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-sm shadow-md shadow-teal-600/20 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Agendando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirmar Marcação
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUCESSO: POP-UP DE FINALIZAÇÃO */}
      {successData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 shadow-2xl border border-emerald-100 text-center">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              Agendamento Confirmado!
            </h3>

            <p className="text-slate-600 text-sm mt-2">
              Sua consulta com <strong>{successData.doctorName}</strong> foi agendada com sucesso.
            </p>

            <div className="my-5 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Paciente:</span>
                <span className="font-bold text-slate-900">{successData.patient?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Data e Hora:</span>
                <span className="font-bold text-emerald-800">{successData.formattedDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Local:</span>
                <span className="font-bold text-slate-900">{successData.clinicName}</span>
              </div>
            </div>

            <div className="p-3 bg-teal-50 rounded-xl border border-teal-100 text-xs text-teal-900 flex items-center gap-2 text-left mb-6">
              <ShieldCheck className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <span>
                Uma mensagem de confirmação oficial foi enviada diretamente para o seu WhatsApp!
              </span>
            </div>

            <button
              onClick={() => {
                setSuccessData(null);
                setSelectedSlot(null);
              }}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md shadow-teal-600/20 transition"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
