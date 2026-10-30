'use client';

import { useState, useEffect, useMemo } from 'react';
import CareHubDashboard from '@/components/dashboard/CareHubDashboard';
import GoogleCalendarView, { AgendaViewMode } from '@/components/calendar/GoogleCalendarView';
import {
  USER_PERMISSIONS,
  generateAutoLogin,
  formatCPF,
  formatPhone,
} from '@/lib/userPermissions';
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  LayoutDashboard,
  Bell,
  ChevronDown,
  Clock,
  UserCheck,
  CalendarCheck2,
  CalendarX,
  RefreshCw,
  Settings,
  Search,
  Phone,
  User,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Plus,
  ShieldCheck,
  Stethoscope,
  Users,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange,
  ListFilter,
  Edit3,
  Trash2,
  Mail,
  Shield,
  Check,
  X,
  UserCog,
  Coffee,
  Briefcase,
  Contact,
  HeartPulse,
  FileText,
  ExternalLink,
  ChevronsUpDown,
  MessageSquare,
  AlertCircle,
  Inbox,
  Sparkles,
  ArrowUpDown,
  Send,
  Building2,
  CheckSquare,
  Square,
  Activity,
  Megaphone,
  Menu,
  SlidersHorizontal,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Cake,
  MapPin,
  Gift,
} from 'lucide-react';

function formatPhoneBR(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const localDigits = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;

  if (localDigits.length === 11) {
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 7)}-${localDigits.slice(7)}`;
  } else if (localDigits.length === 10) {
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 6)}-${localDigits.slice(6)}`;
  }
  return phone;
}

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function applyCPFMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function applyCepMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function isPatientBirthdayToday(birthDateStr?: string | null): boolean {
  if (!birthDateStr) return false;
  const now = new Date();
  const tm = String(now.getMonth() + 1).padStart(2, '0');
  const td = String(now.getDate()).padStart(2, '0');
  if (birthDateStr.includes('-')) {
    const parts = birthDateStr.split('-');
    if (parts.length >= 3) {
      return parts[1] === tm && parts[2]?.slice(0, 2) === td;
    }
  }
  if (birthDateStr.includes('/')) {
    const parts = birthDateStr.split('/');
    if (parts.length >= 2) {
      return parts[1] === tm && parts[0] === td;
    }
  }
  return false;
}

function calculateAge(birthDateStr?: string | null): string {
  if (!birthDateStr) return '';
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return `${age} anos`;
}

function getInitials(name: string): string {
  if (!name) return 'PC';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getStatusLabel(status: string | undefined | null): string {
  if (!status) return 'Agendado';
  const s = status.toUpperCase();
  if (s === 'ENCAIXE') return '⚡ Consulta de Encaixe';
  if (s === 'CONFIRMED' || s === 'CONFIRMADO') return 'Confirmado';
  if (s === 'SCHEDULED' || s === 'AGENDADO') return 'Aguardando Confirmação';
  if (s === 'RESCHEDULED' || s === 'REMARCADO') return 'Remarcado';
  if (s === 'CANCELED' || s === 'CANCELADO') return 'Cancelado';
  return status;
}

const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DAILY_HOURS = ['08:00', '08:45', '09:30', '10:15', '11:00', '11:45', '13:00', '13:45', '14:30', '15:15', '16:00', '16:45', '17:30'];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'agenda' | 'patients' | 'fila' | 'whatsapp' | 'users' | 'settings' | 'profissionais'>('agenda');
  const [agendaViewMode, setAgendaViewMode] = useState<AgendaViewMode>('mes');

  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Estados de "Criar Agenda" (Parâmetros de atendimento do médico) - Inicia com nenhum dia marcado
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [workStartTime, setWorkStartTime] = useState('08:00');
  const [workEndTime, setWorkEndTime] = useState('17:00');
  const [breakEnabled, setBreakEnabled] = useState(true);
  const [breakStartTime, setBreakStartTime] = useState('12:00');
  const [breakEndTime, setBreakEndTime] = useState('13:00');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [returnSlotDurationMinutes, setReturnSlotDurationMinutes] = useState(20);
  const [maxReturnSlotsPerDay, setMaxReturnSlotsPerDay] = useState<number>(4);
  const [returnSlotTimes, setReturnSlotTimes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Estados de "Dados Profissionais"
  const [savingProfissionais, setSavingProfissionais] = useState(false);
  const [saveProfissionaisMsg, setSaveProfissionaisMsg] = useState<string | null>(null);

  // Estados de "Fila de Espera"
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);
  const [waitlistSearch, setWaitlistSearch] = useState('');
  const [waitlistStatusFilter, setWaitlistStatusFilter] = useState<string>('ALL');
  const [showModalAddWaitlist, setShowModalAddWaitlist] = useState(false);
  const [waitlistNotice, setWaitlistNotice] = useState<string | null>(null);
  const [newWaitName, setNewWaitName] = useState('');
  const [newWaitPhone, setNewWaitPhone] = useState('');
  const [newWaitShift, setNewWaitShift] = useState<'Manhã' | 'Tarde' | 'Qualquer Horário'>('Qualquer Horário');
  const [newWaitDays, setNewWaitDays] = useState('Qualquer dia útil');
  const [newWaitNotes, setNewWaitNotes] = useState('');

  // Estados de Remarcação Manual pela Agenda
  const [showModalReschedule, setShowModalReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  // Filtros da Agenda no menu esquerdo
  const [filterConfirmed, setFilterConfirmed] = useState(true);
  const [filterWaiting, setFilterWaiting] = useState(true);
  const [filterEncaixe, setFilterEncaixe] = useState(true);
  const [filterCanceled, setFilterCanceled] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<string | null>(null);

  // Controle de datas e calendário
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  // Busca global
  const [searchQuery, setSearchQuery] = useState('');

  // Estados Mobile
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Cron
  const [cronRunning, setCronRunning] = useState(false);
  const [cronNotice, setCronNotice] = useState<string | null>(null);

  // Modal de Agendamento
  const [showModalNewAppt, setShowModalNewAppt] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [newApptPhone, setNewApptPhone] = useState('');
  const [newApptName, setNewApptName] = useState('');
  const [newApptTime, setNewApptTime] = useState('');
  const [newApptNotes, setNewApptNotes] = useState('');

  // Identificar se o horário escolhido colide com uma consulta existente (Encaixe)
  const conflictingAppt = useMemo(() => {
    if (!newApptTime) return null;
    const chosenStart = new Date(newApptTime).getTime();
    if (isNaN(chosenStart)) return null;
    const dur = (clinic?.slotDurationMinutes || 30) * 60 * 1000;
    const chosenEnd = chosenStart + dur;

    return appointments.find((a) => {
      if (a.status === 'CANCELADO' || a.status === 'CANCELED') return false;
      const aStart = new Date(a.startTime).getTime();
      const aEnd = a.endTime ? new Date(a.endTime).getTime() : aStart + dur;
      return aStart < chosenEnd && aEnd > chosenStart;
    });
  }, [newApptTime, appointments, clinic?.slotDurationMinutes]);

  // Modal de Detalhes do Agendamento
  const [selectedApptDetails, setSelectedApptDetails] = useState<any | null>(null);

  // Cadastro de Pacientes State
  const [patients, setPatients] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [showModalPatient, setShowModalPatient] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any | null>(null);

  // Form do Paciente
  const [patName, setPatName] = useState('');
  const [patPhone, setPatPhone] = useState('');
  const [patCpf, setPatCpf] = useState('');
  const [patEmail, setPatEmail] = useState('');
  const [patBirthDate, setPatBirthDate] = useState('');
  const [patCep, setPatCep] = useState('');
  const [patStreet, setPatStreet] = useState('');
  const [patNumber, setPatNumber] = useState('');
  const [patNeighborhood, setPatNeighborhood] = useState('');
  const [patCity, setPatCity] = useState('');
  const [patNotes, setPatNotes] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);

  // Aniversariantes do Dia
  const [birthdayCount, setBirthdayCount] = useState<number>(0);
  const [birthdaySending, setBirthdaySending] = useState(false);
  const [birthdayNotice, setBirthdayNotice] = useState<string | null>(null);

  // Cadastro de Usuários & Controle de Permissões State
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [showModalUser, setShowModalUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Form de Usuário (Médico Titular da Agenda ou Equipe de Apoio)
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<'MEDICO' | 'SECRETARIA' | 'ADMIN' | 'RECEPCIONISTA'>('MEDICO');
  const [userSpecialty, setUserSpecialty] = useState('');
  const [userCrm, setUserCrm] = useState('');
  const [userCpf, setUserCpf] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userLogin, setUserLogin] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userStatus, setUserStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [showPassword, setShowPassword] = useState(false);
  const [isAutoLogin, setIsAutoLogin] = useState(true);

  // Atualizar relógio em tempo real
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  // Carregar dados iniciais
  useEffect(() => {
    fetchData();
    fetchPatients();
    fetchUsers();
    fetchWaitlist();
  }, [filterDate, filterStatus]);

  async function fetchWaitlist() {
    try {
      setLoadingWaitlist(true);
      const res = await fetch('/api/waitlist');
      const data = await res.json();
      if (data.waitlist) {
        setWaitlist(data.waitlist);
      }
    } catch (e) {
      console.error('Erro ao buscar fila de espera:', e);
    } finally {
      setLoadingWaitlist(false);
    }
  }

  async function fetchData() {
    try {
      setLoading(true);
      const resSettings = await fetch('/api/clinic/settings');
      const dataSettings = await resSettings.json();
      if (dataSettings.clinic) {
        setClinic(dataSettings.clinic);
        const c = dataSettings.clinic;
        if (c.scheduleStartDate !== undefined) setScheduleStartDate(c.scheduleStartDate || '');
        if (c.scheduleEndDate !== undefined) setScheduleEndDate(c.scheduleEndDate || '');
        if (c.workStartTime) setWorkStartTime(c.workStartTime);
        if (c.workEndTime) setWorkEndTime(c.workEndTime);
        if (c.breakEnabled !== undefined) setBreakEnabled(Boolean(c.breakEnabled));
        if (c.breakStartTime) setBreakStartTime(c.breakStartTime);
        if (c.breakEndTime) setBreakEndTime(c.breakEndTime);
        if (c.slotDurationMinutes) setSlotDurationMinutes(Number(c.slotDurationMinutes));
        if (c.returnSlotDurationMinutes) setReturnSlotDurationMinutes(Number(c.returnSlotDurationMinutes));
        if (c.maxReturnSlotsPerDay !== undefined) setMaxReturnSlotsPerDay(Number(c.maxReturnSlotsPerDay));
        if (c.returnSlotTimes && Array.isArray(c.returnSlotTimes)) setReturnSlotTimes(c.returnSlotTimes);
        if (c.selectedDays && Array.isArray(c.selectedDays)) setSelectedDays(c.selectedDays.map(String));
      }

      let apptUrl = '/api/appointments?';
      if (filterDate) apptUrl += `date=${filterDate}&`;
      if (filterStatus && filterStatus !== 'ALL') apptUrl += `status=${filterStatus}`;

      const resAppts = await fetch(apptUrl);
      const dataAppts = await resAppts.json();
      if (dataAppts.appointments) {
        setAppointments(dataAppts.appointments);
      }
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPatients() {
    try {
      setLoadingPatients(true);
      const res = await fetch('/api/patients');
      const data = await res.json();
      if (data.patients) {
        setPatients(data.patients);
      }
      // Consultar contagem de aniversariantes de hoje
      fetch('/api/patients/cron-birthday')
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setBirthdayCount(d.totalBirthdayCount || 0);
        })
        .catch(() => {});
    } catch (err) {
      console.error('Erro ao carregar pacientes:', err);
    } finally {
      setLoadingPatients(false);
    }
  }

  async function fetchUsers() {
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    } finally {
      setLoadingUsers(false);
    }
  }

  // Cron Lembretes 24h
  async function handleTriggerCronReminders() {
    setCronRunning(true);
    setCronNotice(null);
    try {
      const res = await fetch('/api/appointments/cron-reminders', { method: 'POST' });
      const data = await res.json();
      setCronNotice(`✅ Lembretes enviados! ${data.processed || 0} pacientes notificados via WhatsApp para as próximas 24h.`);
      fetchData();
    } catch (e: any) {
      setCronNotice(`❌ Erro no disparo de lembretes: ${e.message}`);
    } finally {
      setCronRunning(false);
    }
  }

  // Criar Agendamento Manual (com confirmação e registro de Encaixe)
  async function handleCreateAppointment(e: React.FormEvent, forceEncaixe?: boolean) {
    if (e) e.preventDefault();
    if (!selectedPatientId) {
      alert('Selecione obrigatoriamente um paciente cadastrado antes de marcar a consulta.');
      return;
    }

    let isEncaixe = forceEncaixe || Boolean(conflictingAppt);
    if (conflictingAppt && !forceEncaixe) {
      const confirmEncaixe = window.confirm(
        `⚠️ ATENÇÃO: HORÁRIO COM CONSULTA EXISTENTE!\n\nJá existe uma consulta marcada neste horário para "${conflictingAppt.patient?.name || 'outro paciente'}".\n\nEsta nova consulta será registrada como "ENCAIXE" e terá destaque visual diferenciado na agenda.\n\nDeseja confirmar o agendamento como ENCAIXE?`
      );
      if (!confirmEncaixe) return;
      isEncaixe = true;
    }

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          patientName: newApptName,
          patientPhone: newApptPhone,
          startTime: newApptTime,
          notes: newApptNotes,
          isEncaixe,
          status: isEncaixe ? 'ENCAIXE' : 'AGENDADO',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowModalNewAppt(false);
        setSelectedPatientId('');
        setNewApptName('');
        setNewApptPhone('');
        setNewApptTime('');
        setNewApptNotes('');
        fetchData();
        fetchPatients();
      } else if (data.isConflict) {
        const confirmEncaixe = window.confirm(
          `⚠️ ${data.error}\n\nDeseja confirmar este agendamento como ENCAIXE?`
        );
        if (confirmEncaixe) {
          handleCreateAppointment(e, true);
        }
      } else {
        alert(data.error || 'Erro ao criar agendamento.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  // Abrir Modal com Slot pré-selecionado
  function openNewApptModalWithSlot(dateObj: Date, hourStr?: string) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const time = hourStr || '09:00';
    const formatted = `${year}-${month}-${day}T${time}`;
    setNewApptTime(formatted);
    setSelectedPatientId('');
    setNewApptName('');
    setNewApptPhone('');
    setShowModalNewAppt(true);
  }

  // Consulta automática de CEP via ViaCEP
  async function handleCepChange(value: string) {
    const formatted = applyCepMask(value);
    setPatCep(formatted);
    const clean = value.replace(/\D/g, '');
    if (clean.length === 8) {
      setLoadingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          if (data.logradouro) setPatStreet(data.logradouro);
          if (data.bairro) setPatNeighborhood(data.bairro);
          if (data.localidade) setPatCity(`${data.localidade} - ${data.uf}`);
        } else {
          alert('CEP não localizado nos Correios. Por favor, preencha o endereço manualmente.');
        }
      } catch (err) {
        console.warn('Erro ao consultar ViaCEP:', err);
      } finally {
        setLoadingCep(false);
      }
    }
  }

  // Disparo manual de felicitações de aniversário via WhatsApp
  async function handleTriggerBirthdayMessages() {
    setBirthdaySending(true);
    setBirthdayNotice(null);
    try {
      const res = await fetch('/api/patients/cron-birthday', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setBirthdayNotice(data.message || 'Mensagens de aniversário enviadas com sucesso!');
        fetchPatients();
      } else {
        alert(data.error || 'Erro ao enviar mensagens de aniversário.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setBirthdaySending(false);
    }
  }

  // Ações de Pacientes
  function handleOpenPatientModal(patToEdit?: any) {
    if (patToEdit) {
      setEditingPatient(patToEdit);
      setPatName(patToEdit.name);
      setPatPhone(formatPhoneBR(patToEdit.phone) || patToEdit.phone);
      setPatCpf(patToEdit.cpf || '');
      setPatEmail(patToEdit.email || '');
      setPatBirthDate(patToEdit.birthDate || '');
      setPatCep(patToEdit.cep || '');
      setPatStreet(patToEdit.street || '');
      setPatNumber(patToEdit.number || '');
      setPatNeighborhood(patToEdit.neighborhood || '');
      setPatCity(patToEdit.city || '');
      setPatNotes(patToEdit.notes || '');
    } else {
      setEditingPatient(null);
      setPatName('');
      setPatPhone('');
      setPatCpf('');
      setPatEmail('');
      setPatBirthDate('');
      setPatCep('');
      setPatStreet('');
      setPatNumber('');
      setPatNeighborhood('');
      setPatCity('');
      setPatNotes('');
    }
    setShowModalPatient(true);
  }

  async function handleSavePatient(e: React.FormEvent) {
    e.preventDefault();
    if (!patName.trim()) {
      alert('Por favor, informe o Nome Completo do paciente.');
      return;
    }
    if (!patPhone.trim()) {
      alert('Por favor, informe o Telefone (WhatsApp) do paciente.');
      return;
    }

    try {
      const payload = {
        id: editingPatient?.id,
        name: patName.trim(),
        phone: patPhone.trim(),
        cpf: patCpf.trim() || null,
        email: patEmail.trim().toLowerCase() || null,
        birthDate: patBirthDate.trim() || null,
        cep: patCep.trim() || null,
        street: patStreet.trim() || null,
        number: patNumber.trim() || null,
        neighborhood: patNeighborhood.trim() || null,
        city: patCity.trim() || null,
        notes: patNotes.trim() || null,
      };

      const method = editingPatient ? 'PUT' : 'POST';
      const res = await fetch('/api/patients', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowModalPatient(false);
        fetchPatients();
      } else {
        alert(data.error || 'Erro ao salvar paciente.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleDeletePatient(id: string) {
    if (!confirm('Deseja realmente excluir este paciente? Todos os dados cadastrais serão removidos.')) return;
    try {
      const res = await fetch(`/api/patients?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchPatients();
      } else {
        alert(data.error || 'Erro ao excluir paciente.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  // Ações de Usuário (Médico Titular da Agenda & Colaboradores)
  function handleOpenUserModal(userToEdit?: any) {
    if (userToEdit) {
      setEditingUser(userToEdit);
      setUserName(userToEdit.name || '');
      setUserRole(userToEdit.role || 'SECRETARIA');
      setUserSpecialty(userToEdit.specialty || '');
      setUserCrm(userToEdit.crm || '');
      setUserCpf(userToEdit.cpf || '');
      setUserEmail(userToEdit.email || '');
      setUserPhone(userToEdit.phone || '');
      setUserLogin(userToEdit.login || '');
      setUserPassword(userToEdit.password || '');
      setUserPermissions(Array.isArray(userToEdit.permissions) ? userToEdit.permissions : []);
      setUserStatus(userToEdit.status || 'ACTIVE');
      setIsAutoLogin(false);
    } else {
      setEditingUser(null);
      setUserName('');
      const hasDoctor = users.some((u) => u.role === 'MEDICO');
      if (!hasDoctor) {
        setUserRole('MEDICO');
        setUserSpecialty('Pediatria');
        setUserCrm('CRM/SP 148.910');
        setUserPermissions(USER_PERMISSIONS.map((p) => p.id));
      } else {
        setUserRole('SECRETARIA');
        setUserSpecialty('Secretária Executiva');
        setUserCrm('');
        setUserPermissions([
          'visualizar_agenda',
          'bloquear_horario',
          'agendamento',
          'desmarcacao',
          'remarcacao',
          'agendamento_extra',
          'dados_paciente',
        ]);
      }
      setUserCpf('');
      setUserEmail('');
      setUserPhone('');
      setUserLogin('');
      setUserPassword('Acesso@2026');
      setUserStatus('ACTIVE');
      setIsAutoLogin(true);
    }
    setShowPassword(false);
    setShowModalUser(true);
  }

  function handleNameChange(newName: string) {
    setUserName(newName);
    if (isAutoLogin || !editingUser) {
      const generated = generateAutoLogin(newName, users, editingUser?.id);
      setUserLogin(generated);
    }
  }

  function handleRegenerateLogin() {
    const generated = generateAutoLogin(userName, users, editingUser?.id);
    setUserLogin(generated);
    setIsAutoLogin(true);
  }

  function handleGeneratePassword() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setUserPassword(`Med@${randomNum}!`);
    setShowPassword(true);
  }

  function applyPermissionPreset(preset: 'all' | 'secretary' | 'view_only' | 'none') {
    if (preset === 'all') {
      setUserPermissions(USER_PERMISSIONS.map((p) => p.id));
    } else if (preset === 'secretary') {
      setUserPermissions([
        'visualizar_agenda',
        'bloquear_horario',
        'agendamento',
        'desmarcacao',
        'remarcacao',
        'agendamento_extra',
        'dados_paciente',
      ]);
    } else if (preset === 'view_only') {
      setUserPermissions(['visualizar_agenda', 'dados_paciente']);
    } else {
      setUserPermissions([]);
    }
  }

  function togglePermission(permId: string) {
    setUserPermissions((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!userName.trim()) {
      alert('Informe o Nome Completo.');
      return;
    }
    if (!userEmail.trim()) {
      alert('Informe o E-mail.');
      return;
    }

    try {
      const finalLogin = userLogin.trim() || generateAutoLogin(userName, users, editingUser?.id);

      const payload = {
        id: editingUser?.id,
        name: userName.trim(),
        role: userRole,
        specialty: userSpecialty.trim(),
        crm: userCrm.trim(),
        cpf: userCpf.trim(),
        email: userEmail.trim().toLowerCase(),
        phone: userPhone.trim(),
        login: finalLogin,
        password: userPassword,
        permissions: userPermissions,
        status: userStatus,
      };

      const method = editingUser ? 'PUT' : 'POST';
      const res = await fetch('/api/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowModalUser(false);
        fetchUsers();
        if (userRole === 'MEDICO') {
          fetch('/api/clinic/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              doctorName: userName.trim(),
              crm: userCrm.trim(),
              specialty: userSpecialty.trim(),
              email: userEmail.trim().toLowerCase(),
              phone: userPhone.trim(),
            }),
          }).then(() => fetchData()).catch(() => { });
        }
      } else {
        alert(data.error || 'Erro ao salvar usuário.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm('Deseja realmente remover o acesso deste usuário?')) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || 'Erro ao excluir usuário.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleToggleUserStatus(user: any) {
    try {
      const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  // DIAS DA SEMANA PARA ATENDIMENTO (CONFIGURAÇÃO DE AGENDA)
  const DAYS_OF_WEEK = [
    { id: '1', label: 'Seg', name: 'Segunda-feira' },
    { id: '2', label: 'Ter', name: 'Terça-feira' },
    { id: '3', label: 'Qua', name: 'Quarta-feira' },
    { id: '4', label: 'Qui', name: 'Quinta-feira' },
    { id: '5', label: 'Sex', name: 'Sexta-feira' },
    { id: '6', label: 'Sáb', name: 'Sábado' },
    { id: '0', label: 'Dom', name: 'Domingo' },
  ];

  function toggleDay(dayId: string) {
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  }

  function applyDatePreset(days: number) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const startStr = `${y}-${m}-${d}`;

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);
    const ey = endDate.getFullYear();
    const em = String(endDate.getMonth() + 1).padStart(2, '0');
    const ed = String(endDate.getDate()).padStart(2, '0');
    const endStr = `${ey}-${em}-${ed}`;

    setScheduleStartDate(startStr);
    setScheduleEndDate(endStr);
  }

  function applyEndOfYearPreset() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const startStr = `${y}-${m}-${d}`;
    const year = today.getFullYear();
    const endStr = `${year}-12-31`;
    setScheduleStartDate(startStr);
    setScheduleEndDate(endStr);
  }

  // Previsão de dias e horas totais no período de abertura
  const scheduleDateSpanDays = useMemo(() => {
    if (!scheduleStartDate || !scheduleEndDate) return 0;
    const d1 = new Date(scheduleStartDate + 'T00:00:00');
    const d2 = new Date(scheduleEndDate + 'T00:00:00');
    const diffTime = d2.getTime() - d1.getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [scheduleStartDate, scheduleEndDate]);

  // Consultas já agendadas no período selecionado (para alertar preservação)
  const existingApptsInRange = useMemo(() => {
    if (!scheduleStartDate || !scheduleEndDate) return [];
    return appointments.filter((a) => {
      if (a.status === 'CANCELADO' || a.status === 'CANCELED') return false;
      const apptDate = a.startTime ? a.startTime.split('T')[0] : '';
      if (!apptDate) return false;
      return apptDate >= scheduleStartDate && apptDate <= scheduleEndDate;
    });
  }, [appointments, scheduleStartDate, scheduleEndDate]);

  // Simulador em Tempo Real da grade diária de consultas com cálculo dinâmico e sequencial para Retornos
  const generatedPreviewSlots = useMemo(() => {
    if (!workStartTime || !workEndTime || !slotDurationMinutes) return [];
    const [startH, startM] = workStartTime.split(':').map(Number);
    const [endH, endM] = workEndTime.split(':').map(Number);
    const startMin = (startH || 0) * 60 + (startM || 0);
    const endMin = (endH || 0) * 60 + (endM || 0);

    const [breakStartH, breakStartM] = (breakStartTime || '12:00').split(':').map(Number);
    const [breakEndH, breakEndM] = (breakEndTime || '13:00').split(':').map(Number);
    const bStartMin = (breakStartH || 12) * 60 + (breakStartM || 0);
    const bEndMin = (breakEndH || 13) * 60 + (breakEndM || 0);

    const normDur = Number(slotDurationMinutes) || 45;
    const retDur = Number(returnSlotDurationMinutes) || 25;
    const returnSet = new Set(returnSlotTimes);

    const slots: Array<{
      time: string;
      endTime: string;
      duration: number;
      isBreak: boolean;
      isReturn: boolean;
    }> = [];

    let cur = startMin;

    while (cur < endMin) {
      // Se intervalo de pausa está ativo e cur está no intervalo
      if (breakEnabled && cur >= bStartMin && cur < bEndMin) {
        const pStartH = Math.floor(bStartMin / 60);
        const pStartM = bStartMin % 60;
        const pEndH = Math.floor(bEndMin / 60);
        const pEndM = bEndMin % 60;
        slots.push({
          time: `${String(pStartH).padStart(2, '0')}:${String(pStartM).padStart(2, '0')}`,
          endTime: `${String(pEndH).padStart(2, '0')}:${String(pEndM).padStart(2, '0')}`,
          duration: bEndMin - bStartMin,
          isBreak: true,
          isReturn: false,
        });
        cur = bEndMin;
        continue;
      }

      const h = Math.floor(cur / 60);
      const m = cur % 60;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const isReturn = returnSet.has(timeStr);
      const dur = isReturn ? retDur : normDur;

      // Se a consulta cruzaria com o início do intervalo
      if (breakEnabled && cur < bStartMin && cur + dur > bStartMin) {
        const pStartH = Math.floor(bStartMin / 60);
        const pStartM = bStartMin % 60;
        const pEndH = Math.floor(bEndMin / 60);
        const pEndM = bEndMin % 60;
        slots.push({
          time: `${String(pStartH).padStart(2, '0')}:${String(pStartM).padStart(2, '0')}`,
          endTime: `${String(pEndH).padStart(2, '0')}:${String(pEndM).padStart(2, '0')}`,
          duration: bEndMin - bStartMin,
          isBreak: true,
          isReturn: false,
        });
        cur = bEndMin;
        continue;
      }

      // Se ultrapassar o término do expediente
      if (cur + dur > endMin) {
        break;
      }

      const endH_ = Math.floor((cur + dur) / 60);
      const endM_ = (cur + dur) % 60;
      const endTimeStr = `${String(endH_).padStart(2, '0')}:${String(endM_).padStart(2, '0')}`;

      slots.push({
        time: timeStr,
        endTime: endTimeStr,
        duration: dur,
        isBreak: false,
        isReturn,
      });

      cur += dur;
    }
    return slots;
  }, [workStartTime, workEndTime, slotDurationMinutes, returnSlotDurationMinutes, breakEnabled, breakStartTime, breakEndTime, returnSlotTimes]);

  function toggleReturnSlotTime(timeStr: string) {
    if (returnSlotTimes.includes(timeStr)) {
      setReturnSlotTimes(returnSlotTimes.filter((t) => t !== timeStr));
    } else {
      setReturnSlotTimes([...returnSlotTimes, timeStr]);
    }
  }

  function applyReturnPresets(type: 'end' | 'start' | 'split' | 'clear') {
    if (type === 'clear') {
      setReturnSlotTimes([]);
      return;
    }
    const [startH, startM] = (workStartTime || '08:00').split(':').map(Number);
    const [endH, endM] = (workEndTime || '17:00').split(':').map(Number);
    const startMin = (startH || 0) * 60 + (startM || 0);
    const endMin = (endH || 0) * 60 + (endM || 0);

    const [bStartH, bStartM] = (breakStartTime || '12:00').split(':').map(Number);
    const [bEndH, bEndM] = (breakEndTime || '13:00').split(':').map(Number);
    const bStartMin = (bStartH || 12) * 60 + (bStartM || 0);
    const bEndMin = (bEndH || 13) * 60 + (bEndM || 0);

    const normDur = Number(slotDurationMinutes) || 45;
    const retDur = Number(returnSlotDurationMinutes) || 25;
    const count = Math.max(1, Math.min(Number(maxReturnSlotsPerDay) || 4, 10));

    if (type === 'start') {
      const times: string[] = [];
      let c = startMin;
      while (times.length < count && c + retDur <= endMin) {
        if (breakEnabled && c >= bStartMin && c < bEndMin) {
          c = bEndMin;
          continue;
        }
        if (breakEnabled && c < bStartMin && c + retDur > bStartMin) {
          c = bEndMin;
          continue;
        }
        const h = Math.floor(c / 60);
        const m = c % 60;
        times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        c += retDur;
      }
      setReturnSlotTimes(times);
      return;
    }

    if (type === 'end') {
      const normalSlots: string[] = [];
      let c = startMin;
      while (c + normDur <= endMin) {
        if (breakEnabled && c >= bStartMin && c < bEndMin) {
          c = bEndMin;
          continue;
        }
        if (breakEnabled && c < bStartMin && c + normDur > bStartMin) {
          c = bEndMin;
          continue;
        }
        const h = Math.floor(c / 60);
        const m = c % 60;
        normalSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        c += normDur;
      }
      setReturnSlotTimes(normalSlots.slice(-count));
      return;
    }

    if (type === 'split') {
      const half = Math.ceil(count / 2);
      const startTimes: string[] = [];
      let c = startMin;
      while (startTimes.length < half && c + retDur <= endMin) {
        if (breakEnabled && c >= bStartMin && c < bEndMin) {
          c = bEndMin;
          continue;
        }
        const h = Math.floor(c / 60);
        const m = c % 60;
        startTimes.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        c += retDur;
      }
      const normalSlots: string[] = [];
      let c2 = startMin;
      while (c2 + normDur <= endMin) {
        if (breakEnabled && c2 >= bStartMin && c2 < bEndMin) {
          c2 = bEndMin;
          continue;
        }
        if (breakEnabled && c2 < bStartMin && c2 + normDur > bStartMin) {
          c2 = bEndMin;
          continue;
        }
        const h = Math.floor(c2 / 60);
        const m = c2 % 60;
        normalSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        c2 += normDur;
      }
      const endPart = normalSlots.slice(-(count - half));
      setReturnSlotTimes(Array.from(new Set([...startTimes, ...endPart])));
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingSettings(true);
      setSaveSuccessMsg(null);

      // Verificar consultas já agendadas anteriormente neste período (não serão substituídas)
      const conflictingAppts = appointments.filter((a) => {
        if (a.status === 'CANCELADO' || a.status === 'CANCELED') return false;
        const apptDate = a.startTime ? a.startTime.split('T')[0] : '';
        if (!apptDate) return false;
        if (scheduleStartDate && apptDate < scheduleStartDate) return false;
        if (scheduleEndDate && apptDate > scheduleEndDate) return false;
        return true;
      });

      const res = await fetch('/api/clinic/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotDurationMinutes: Number(slotDurationMinutes) || 30,
          returnSlotDurationMinutes: Number(returnSlotDurationMinutes) || 20,
          maxReturnSlotsPerDay: Number(maxReturnSlotsPerDay) || 4,
          returnSlotTimes,
          scheduleStartDate,
          scheduleEndDate,
          workStartTime,
          workEndTime,
          breakEnabled,
          breakStartTime,
          breakEndTime,
          selectedDays,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setClinic(data.clinic);
        fetchData();
        if (conflictingAppts.length > 0) {
          setSaveSuccessMsg(
            `Agenda criada com sucesso! ⚠️ Aviso: ${conflictingAppts.length} consulta(s) já agendada(s) anteriormente neste período foram preservadas intactas e mantidas na agenda (nenhum horário marcado foi substituído).`
          );
        } else {
          setSaveSuccessMsg('Agenda criada e parâmetros de atendimento salvos com sucesso!');
        }
        setTimeout(() => setSaveSuccessMsg(null), 8000);
      } else {
        alert(data.error || 'Erro ao salvar parâmetros da agenda');
      }
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveProfissionais(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingProfissionais(true);
      setSaveProfissionaisMsg(null);
      const res = await fetch('/api/clinic/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clinic?.doctorName || clinic?.name,
          doctorName: clinic?.doctorName || clinic?.name,
          specialty: clinic?.specialty,
          crm: clinic?.crm,
          email: clinic?.email,
          phone: clinic?.phone,
          address: clinic?.address,
          minCancelHours: Number(clinic?.minCancelHours) || 2,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setClinic(data.clinic);
        setSaveProfissionaisMsg('Dados profissionais do médico titular salvos com sucesso!');
        setTimeout(() => setSaveProfissionaisMsg(null), 6000);
        fetchUsers();
      } else {
        alert(data.error || 'Erro ao salvar dados profissionais.');
      }
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setSavingProfissionais(false);
    }
  }

  // Ações da Fila de Espera
  async function handleAddWaitlistEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!newWaitName.trim() || !newWaitPhone.trim()) {
      alert('Preencha o nome e o telefone do paciente.');
      return;
    }
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: newWaitName,
          patientPhone: newWaitPhone,
          preferredShift: newWaitShift,
          preferredDays: newWaitDays,
          notes: newWaitNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowModalAddWaitlist(false);
        setNewWaitName('');
        setNewWaitPhone('');
        setNewWaitNotes('');
        fetchWaitlist();
        setWaitlistNotice('Paciente adicionado à Fila de Espera com prioridade!');
        setTimeout(() => setWaitlistNotice(null), 5000);
      } else {
        alert(data.error || 'Erro ao adicionar à fila de espera.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleRemoveWaitlist(id: string) {
    if (!confirm('Deseja realmente remover este paciente da fila de espera?')) return;
    try {
      const res = await fetch(`/api/waitlist?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchWaitlist();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleConfirmWaitlistBooking(id: string) {
    try {
      const res = await fetch('/api/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'confirm_booking' }),
      });
      const data = await res.json();
      if (data.success) {
        fetchWaitlist();
        fetchData();
        setWaitlistNotice(data.message);
        setTimeout(() => setWaitlistNotice(null), 8000);
      } else {
        alert(data.message || 'Erro ao confirmar agendamento.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleDeclineWaitlist(id: string) {
    try {
      const res = await fetch('/api/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'decline_slot' }),
      });
      const data = await res.json();
      if (data.success) {
        fetchWaitlist();
        setWaitlistNotice('Vaga recusada. O próximo paciente da fila foi acionado automaticamente!');
        setTimeout(() => setWaitlistNotice(null), 6000);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleTriggerWaitlistTest() {
    const testSlotTime = new Date();
    testSlotTime.setDate(testSlotTime.getDate() + 1);
    testSlotTime.setHours(14, 0, 0, 0);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify_vacated',
          startTime: testSlotTime.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.contacted) {
        setWaitlistNotice(
          `🚀 Disparo de teste realizado! O 1º paciente (${data.patient?.patientName}) foi contactado via WhatsApp para o horário ${data.patient?.offeredSlot?.dateDisplay} às ${data.patient?.offeredSlot?.timeDisplay}.`
        );
        fetchWaitlist();
      } else {
        alert(data.message || 'Nenhum paciente aguardando na fila.');
      }
      setTimeout(() => setWaitlistNotice(null), 8000);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  // Ações de Remarcação & Cancelamento Manual pela Agenda
  async function handleManualReschedule(apptId: string, newDate: string, newTime: string) {
    if (!newDate || !newTime) {
      alert('Informe a nova data e o horário para remarcar.');
      return;
    }
    try {
      setRescheduling(true);
      const newDateTimeStr = `${newDate} ${newTime}`;
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: apptId,
          action: 'REMARCAR',
          newStartTime: newDateTimeStr,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowModalReschedule(false);
        setSelectedApptDetails(null);
        fetchData();
        fetchWaitlist();
        if (data.waitlistNotification?.contacted) {
          setWaitlistNotice(
            `🎉 Consulta remarcada com sucesso! A lacuna aberta foi detectada e o 1º paciente da Fila de Espera (${data.waitlistNotification.patient.patientName}) foi contactado automaticamente pelo WhatsApp!`
          );
        } else {
          setWaitlistNotice('Consulta remarcada com sucesso na agenda!');
        }
        setTimeout(() => setWaitlistNotice(null), 8000);
      } else {
        alert(data.error || 'Erro ao remarcar consulta.');
      }
    } catch (err: any) {
      alert(`Erro ao remarcar: ${err.message}`);
    } finally {
      setRescheduling(false);
    }
  }

  async function handleManualCancel(apptId: string) {
    if (!confirm('Deseja realmente cancelar este agendamento? O horário vago será oferecido automaticamente ao 1º paciente da Fila de Espera via WhatsApp.')) {
      return;
    }
    try {
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: apptId,
          action: 'CANCELAR',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedApptDetails(null);
        fetchData();
        fetchWaitlist();
        if (data.waitlistNotification?.contacted) {
          setWaitlistNotice(
            `Consulta cancelada! A lacuna foi liberada e o 1º paciente da Fila de Espera (${data.waitlistNotification.patient.patientName}) foi contactado automaticamente pelo WhatsApp!`
          );
        } else {
          setWaitlistNotice('Consulta cancelada com sucesso.');
        }
        setTimeout(() => setWaitlistNotice(null), 8000);
      } else {
        alert(data.error || 'Erro ao cancelar consulta.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  // PERFIL DO MÉDICO RESPONSÁVEL DA AGENDA (Extraído do médico cadastrado em Usuários)
  const activeDoctor = useMemo(() => {
    // 1º Prioridade: O médico cadastrado na lista de usuários
    const doctorUser = users.find((u) => u.role === 'MEDICO');
    if (doctorUser) {
      return {
        name: doctorUser.name,
        specialty: doctorUser.specialty || 'Pediatria',
        crm: doctorUser.crm || clinic?.crm || 'CRM/SP 148.910',
        email: doctorUser.email,
        phone: doctorUser.phone || clinic?.phone || '(11) 98888-7777',
        room: 'Consultório Principal',
        address: clinic?.address || 'Av. Paulista, 1000',
      };
    }
    // Fallback: perfil das configurações da clínica
    return {
      name: clinic?.doctorName || 'Dra. Mariana Souza',
      specialty: clinic?.specialty || 'Pediatria',
      crm: clinic?.crm || 'CRM/SP 148.910',
      email: clinic?.email || 'dra.mariana@iterum.med.br',
      phone: clinic?.phone || '(11) 98888-7777',
      room: 'Consultório Principal',
      address: clinic?.address || 'Av. Paulista, 1000',
    };
  }, [users, clinic]);

  // Consultas do Dia Selecionado
  const selectedDayAppointments = useMemo(() => {
    return appointments
      .filter((a) => {
        const apptDate = new Date(a.startTime);
        return (
          apptDate.getFullYear() === selectedDate.getFullYear() &&
          apptDate.getMonth() === selectedDate.getMonth() &&
          apptDate.getDate() === selectedDate.getDate()
        );
      })
      .filter((a) => {
        const s = (a.status || '').toUpperCase();
        if (s === 'CONFIRMADO' || s === 'CONFIRMED') return filterConfirmed;
        if (s === 'AGENDADO' || s === 'SCHEDULED') return filterWaiting;
        if (s === 'REMARCADO' || s === 'RESCHEDULED') return filterEncaixe;
        if (s === 'CANCELADO' || s === 'CANCELED') return filterCanceled;
        return true;
      })
      .filter((a) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          a.patient?.name?.toLowerCase().includes(q) ||
          a.patient?.phone?.includes(q) ||
          (a.patient?.cpf && a.patient.cpf.includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [appointments, selectedDate, filterConfirmed, filterWaiting, filterEncaixe, filterCanceled, searchQuery]);

  // Contadores do Dia Selecionado
  const confirmedCount = useMemo(() => {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.toDateString() === selectedDate.toDateString() &&
        (a.status === 'CONFIRMADO' || a.status === 'CONFIRMED')
      );
    }).length;
  }, [appointments, selectedDate]);

  const waitingCount = useMemo(() => {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.toDateString() === selectedDate.toDateString() &&
        (a.status === 'AGENDADO' || a.status === 'SCHEDULED')
      );
    }).length;
  }, [appointments, selectedDate]);

  const encaixeCount = useMemo(() => {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.toDateString() === selectedDate.toDateString() &&
        (a.status === 'REMARCADO' || a.status === 'RESCHEDULED')
      );
    }).length;
  }, [appointments, selectedDate]);

  // Gerar dias do Mini-Calendário Mensal
  const miniCalendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{ dayNumber: number; inMonth: boolean; dateObj: Date }> = [];

    // Dias do mês anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      days.push({
        dayNumber: dayNum,
        inMonth: false,
        dateObj: new Date(year, month - 1, dayNum),
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        dayNumber: i,
        inMonth: true,
        dateObj: new Date(year, month, i),
      });
    }

    // Dias do próximo mês para completar 35 ou 42 células
    const remaining = 35 - days.length;
    if (remaining > 0) {
      for (let i = 1; i <= remaining; i++) {
        days.push({
          dayNumber: i,
          inMonth: false,
          dateObj: new Date(year, month + 1, i),
        });
      }
    }

    return days;
  }, [calendarMonth]);

  // Formatadores de data em Português
  const selectedDateHeader = useMemo(() => {
    const raw = selectedDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [selectedDate]);

  const monthLabel = useMemo(() => {
    const raw = calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [calendarMonth]);

  // Strip horizontal de dias para mobile
  const mobileDateStrip = useMemo(() => {
    const days: Date[] = [];
    for (let i = -3; i <= 6; i++) {
      const d = new Date(selectedDate);
      d.setDate(selectedDate.getDate() + i);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  function getApptCountForDate(targetDate: Date): number {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.getFullYear() === targetDate.getFullYear() &&
        d.getMonth() === targetDate.getMonth() &&
        d.getDate() === targetDate.getDate()
      );
    }).length;
  }

  return (
    <div className="min-h-screen lg:h-screen w-full flex flex-col lg:flex-row overflow-x-hidden lg:overflow-hidden bg-[#f4f8f6] bg-[radial-gradient(ellipse_80%_60%_at_0%_0%,rgba(167,243,208,0.25),transparent_70%)] text-slate-800 font-sans select-none pb-16 lg:pb-0">
      {/* =========================================================================
          1. SIDEBAR DE NAVEGAÇÃO LATERAL (DESKTOP)
      ========================================================================= */}
      <aside className="hidden lg:flex w-72 border-r border-slate-200/80 bg-white flex-col justify-between shrink-0 z-30 shadow-xs">
        <div>
          {/* LOGO & MARCA */}
          <div className="p-4.5 flex items-center justify-between border-b border-slate-100 bg-white">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white border border-emerald-100 shadow-md shadow-emerald-900/5 p-1.5 flex items-center justify-center shrink-0">
                <img
                  src="/iterum-logo.jpg"
                  alt="Iterum"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-[#1e293b] leading-tight">Iterum</h1>
              </div>
            </div>
          </div>

          {/* MENU PRINCIPAL */}
          <nav className="px-3 space-y-1.5 mt-3">
            <button
              onClick={() => setActiveTab('agenda')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${activeTab === 'agenda'
                ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
                }`}
            >
              <div className="flex items-center gap-3">
                <CalendarIcon className={`w-5 h-5 ${activeTab === 'agenda' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>Agenda</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${activeTab === 'agenda' ? 'bg-[#005a43] text-white' : 'bg-[#e8f7f0] text-[#00875a]'
                  }`}
              >
                {appointments.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('patients')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${activeTab === 'patients'
                ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
                }`}
            >
              <Users className={`w-5 h-5 ${activeTab === 'patients' ? 'text-[#059669]' : 'text-slate-400'}`} />
              <span>Cadastro de Pacientes</span>
            </button>

            <button
              onClick={() => setActiveTab('fila')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${activeTab === 'fila'
                ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
                }`}
            >
              <div className="flex items-center gap-3">
                <Inbox className={`w-5 h-5 ${activeTab === 'fila' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>Fila de Espera</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-[#005a43]">
                {waitlist.filter((w) => w.status === 'AGUARDANDO').length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${activeTab === 'whatsapp'
                ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
                }`}
            >
              <div className="flex items-center gap-3">
                <MessageSquare className={`w-5 h-5 ${activeTab === 'whatsapp' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>WhatsApp Bot</span>
              </div>
              <span className="text-[11px] text-[#00875a] font-bold bg-[#e8f7f0] px-2 py-0.5 rounded-full border border-[#d1fae5]">
                Online
              </span>
            </button>

            {/* SEÇÃO GESTÃO */}
            <div className="pt-4 pb-1 px-4">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Gestão</span>
            </div>

            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${activeTab === 'users'
                ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
                }`}
            >
              <div className="flex items-center gap-3">
                <UserCheck className={`w-5 h-5 ${activeTab === 'users' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>Usuários e Acessos</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {users.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${activeTab === 'settings'
                ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
                }`}
            >
              <CalendarPlus className={`w-5 h-5 ${activeTab === 'settings' ? 'text-[#059669]' : 'text-slate-400'}`} />
              <span>Criar Agenda</span>
            </button>

            <button
              onClick={() => setActiveTab('profissionais')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${activeTab === 'profissionais'
                ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
                }`}
            >
              <Stethoscope className={`w-5 h-5 ${activeTab === 'profissionais' ? 'text-[#059669]' : 'text-slate-400'}`} />
              <span>Dados Profissionais</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* =========================================================================
          MOBILE DRAWER (OFF-CANVAS SIDEBAR)
      ========================================================================= */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-4/5 max-w-xs bg-white shadow-2xl flex flex-col justify-between z-50 p-4 animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-emerald-100 shadow-sm p-1 flex items-center justify-center shrink-0">
                    <img
                      src="/iterum-logo.jpg"
                      alt="Iterum"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-slate-900 leading-tight">Iterum</h1>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 font-bold rounded-xl hover:bg-slate-100"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* MENU PRINCIPAL */}
              <nav className="space-y-1.5 mt-4">
                <button
                  onClick={() => {
                    setActiveTab('agenda');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition ${activeTab === 'agenda'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <CalendarIcon className={`w-5 h-5 ${activeTab === 'agenda' ? 'text-teal-400' : 'text-slate-500'}`} />
                    <span>Agenda</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${activeTab === 'agenda' ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-700'
                      }`}
                  >
                    {appointments.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('patients');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition ${activeTab === 'patients'
                    ? 'bg-slate-900 text-white shadow-md font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <Users className="w-5 h-5 text-slate-500" />
                  <span>Cadastro de Pacientes</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('fila');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition ${activeTab === 'fila'
                    ? 'bg-slate-900 text-white shadow-md font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Inbox className="w-5 h-5 text-slate-500" />
                    <span>Fila de Espera</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    {waitlist.filter((w) => w.status === 'AGUARDANDO').length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('whatsapp');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition ${activeTab === 'whatsapp'
                    ? 'bg-slate-900 text-white shadow-md font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-slate-500" />
                    <span>WhatsApp & Lembretes</span>
                  </div>
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Cloud
                  </span>
                </button>

                <div className="pt-4 pb-1 px-4">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Gestão</span>
                </div>

                <button
                  onClick={() => {
                    setActiveTab('users');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition ${activeTab === 'users'
                    ? 'bg-slate-900 text-white shadow-md font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-slate-500" />
                    <span>Usuários e Acessos</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {users.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition ${activeTab === 'settings'
                    ? 'bg-slate-900 text-white shadow-md font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <CalendarPlus className="w-5 h-5 text-teal-400" />
                  <span>Criar Agenda</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('profissionais');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition ${activeTab === 'profissionais'
                    ? 'bg-slate-900 text-white shadow-md font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <Stethoscope className="w-5 h-5 text-teal-400" />
                  <span>Dados Profissionais</span>
                </button>
              </nav>
            </div>
          </aside>
        </div>
      )}

      {/* =========================================================================
          2. ÁREA PRINCIPAL (HEADER + CONTEÚDO)
      ========================================================================= */}
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {/* =========================================================================
            HEADER MOBILE (lg:hidden)
        ========================================================================= */}
        {activeTab !== 'agenda' && (
          <header className="lg:hidden bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 px-3 py-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                  aria-label="Abrir menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white border border-emerald-100 p-0.5 flex items-center justify-center shadow-xs">
                    <img src="/iterum-logo.jpg" alt="Iterum" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <span className="font-black text-sm text-slate-900 tracking-tight leading-none block">Iterum</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                  className={`p-2 rounded-xl transition ${mobileSearchOpen ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  aria-label="Buscar"
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setNewApptTime('');
                    setShowModalNewAppt(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Novo</span>
                </button>
              </div>
            </div>

            {/* BUSCA EXPANSÍVEL NO MOBILE */}
            {mobileSearchOpen && (
              <div className="mt-2.5 pt-2 border-t border-slate-100">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar paciente, CPF ou procedimento..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-100 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 border border-slate-200 transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </header>
        )}

        {/* HEADER SUPERIOR DESKTOP (ESTILO CAREHUB) */}
        {activeTab !== 'agenda' && (
          <header className="hidden lg:flex h-20 px-8 bg-transparent items-center justify-between gap-6 shrink-0 z-20">
            {/* BUSCADOR ARREDONDADO CAREHUB */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              <input
                type="text"
                placeholder="Search patients, ID, records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white border border-[#e5efe9] text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10b981]/20 focus:border-[#10b981] shadow-2xs transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* CONTROLES DIREITOS: SINO COM BADGE 3 E PERFIL DO MÉDICO CAREHUB */}
            <div className="flex items-center space-x-3.5">
              {/* Sino de Notificação */}
              <div className="relative p-2.5 rounded-full bg-white border border-[#e5efe9] hover:bg-slate-50 text-slate-600 transition cursor-pointer shadow-2xs">
                <Bell className="w-4.5 h-4.5 text-slate-600" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs">
                  3
                </span>
              </div>

              {/* Perfil do Médico Estilo CareHub */}
              <div
                onClick={() => setActiveTab('settings')}
                className="flex items-center space-x-3 pl-2 py-1.5 pr-3 cursor-pointer bg-white border border-[#e5efe9] hover:border-[#10b981]/40 rounded-full shadow-2xs transition group"
              >
                <div className="w-9 h-9 rounded-full bg-[#005a43] text-white font-bold flex items-center justify-center text-xs shadow-xs">
                  {getInitials(activeDoctor.name)}
                </div>
                <div className="text-left hidden xl:block">
                  <span className="block text-xs font-black text-[#1e293b] leading-tight group-hover:text-[#005a43] transition">
                    {activeDoctor.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {activeDoctor.specialty?.split('•')[0] || 'Médico Responsável'}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
              </div>
            </div>
          </header>
        )}

        {/* NOTIFICAÇÃO CRON */}
        {cronNotice && (
          <div className="bg-teal-50 border-b border-teal-200 px-4 sm:px-6 py-2 text-xs text-teal-900 flex items-center justify-between font-medium">
            <span>{cronNotice}</span>
            <button onClick={() => setCronNotice(null)} className="text-teal-700 hover:text-slate-900 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* =========================================================================
            3. CONTEÚDO DINÂMICO CONFORME ABA SELECIONADA
        ========================================================================= */}
        <main className={`flex-1 flex flex-col ${activeTab === 'agenda' ? 'p-0' : 'p-3.5 sm:p-4 lg:p-6 lg:flex-row gap-4 lg:gap-6'} overflow-y-auto lg:overflow-hidden`}>
          {/* ---------------------------------------------------------------------
              ABA: AGENDA MÉDICA (EXPERIÊNCIA GOOGLE CALENDAR COMPLETA)
          --------------------------------------------------------------------- */}
          {activeTab === 'agenda' && (
            <div className="flex-1 flex flex-col h-full min-h-0 bg-white overflow-hidden">
              <GoogleCalendarView
                appointments={appointments}
                clinic={clinic}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                agendaViewMode={agendaViewMode}
                setAgendaViewMode={setAgendaViewMode}
                currentTimeStr={currentTimeStr}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onOpenNewAppt={openNewApptModalWithSlot}
                onOpenApptDetails={(appt) => setSelectedApptDetails(appt)}
                onSwitchTab={(tab) => setActiveTab(tab)}
                activeDoctor={activeDoctor}
              />
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: PACIENTES & PRONTUÁRIO (DESIGN DOCFLOW)
          --------------------------------------------------------------------- */}
          {activeTab === 'patients' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 flex flex-col overflow-hidden">
              <div className="pb-3.5 sm:pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-[#1e293b] tracking-tight">Cadastro de Pacientes</h2>
                  <p className="text-sm text-slate-400 font-medium mt-0.5">Fichas cadastrais e informações de contato (dados protegidos)</p>
                </div>
                <button
                  onClick={() => handleOpenPatientModal()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md shadow-slate-900/15 transition active:scale-95"
                >
                  <UserPlus className="w-4 h-4 stroke-[2.5]" />
                  <span>Cadastrar Paciente</span>
                </button>
              </div>

              {/* CARD / BANNER DE ANIVERSARIANTES DO DIA */}
              <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-rose-50/50 to-orange-50 border border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
                    <Cake className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">Aniversariantes do Dia</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-black ${birthdayCount > 0 ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-600'}`}>
                        {birthdayCount} {birthdayCount === 1 ? 'paciente' : 'pacientes'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {birthdayCount > 0
                        ? 'Parabenize seus pacientes hoje e reforce o cuidado com a saúde deles via WhatsApp.'
                        : 'Nenhum paciente fazendo aniversário na data de hoje.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTriggerBirthdayMessages}
                  disabled={birthdaySending || birthdayCount === 0}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-sm shrink-0 ${
                    birthdayCount > 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {birthdaySending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Enviando mensagens...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Enviar Parabéns no WhatsApp</span>
                    </>
                  )}
                </button>
              </div>

              {birthdayNotice && (
                <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{birthdayNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBirthdayNotice(null)}
                    className="text-emerald-700 hover:text-emerald-900 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* LISTAGEM DE CARDS EM MOBILE (< md) */}
              <div className="md:hidden flex-1 overflow-y-auto space-y-3 mt-3.5">
                {patients.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 font-medium text-sm">Nenhum paciente cadastrado</div>
                ) : (
                  patients.map((p) => (
                    <div key={p.id} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-extrabold text-sm shrink-0">
                            {getInitials(p.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-slate-900 text-base leading-tight">{p.name}</span>
                              {isPatientBirthdayToday(p.birthDate) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Cake className="w-3 h-3 text-amber-600 animate-pulse" />
                                  Hoje! 🎉
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              {p.cpf ? `CPF: ${applyCPFMask(p.cpf)}` : 'Sem CPF'} • {p.birthDate ? `${p.birthDate.split('-').reverse().join('/')} (${calculateAge(p.birthDate)})` : 'Idade N/D'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleOpenPatientModal(p)}
                            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-2xs hover:bg-slate-100"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePatient(p.id)}
                            className="p-2 rounded-xl bg-white border border-rose-200 text-rose-600 shadow-2xs hover:bg-rose-50"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* ENDEREÇO NO MOBILE */}
                      {(p.street || p.neighborhood || p.city || p.cep) && (
                        <div className="flex items-start gap-1.5 text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200/70">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <div className="leading-snug">
                            <span className="font-semibold text-slate-800">
                              {p.street ? `${p.street}${p.number ? `, ${p.number}` : ''}` : ''}
                            </span>
                            <span className="text-slate-500">
                              {[p.neighborhood, p.city].filter(Boolean).length > 0 && ` • ${[p.neighborhood, p.city].filter(Boolean).join(' - ')}`}
                              {p.cep && ` (CEP: ${p.cep})`}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                        <a
                          href={`https://wa.me/${(p.phone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-emerald-800 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs shadow-2xs"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          {formatPhoneBR(p.phone)}
                        </a>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200/80 text-slate-700">
                          {p._count?.appointments ?? 1} consultas
                        </span>
                      </div>

                      {p.notes && (
                        <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* TABELA DE PACIENTES EM DESKTOP (>= md) */}
              <div className="hidden md:block flex-1 overflow-y-auto mt-4">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Paciente / CPF</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Contato</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Nascimento / Idade</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Endereço</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Consultas</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Observações</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patients.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5">
                          <div className="flex items-center space-x-3.5">
                            <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-extrabold text-sm shadow-2xs">
                              {getInitials(p.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                                {isPatientBirthdayToday(p.birthDate) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                                    <Cake className="w-3 h-3 text-amber-600 animate-pulse" />
                                    Hoje! 🎉
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5">
                                {p.cpf ? `CPF: ${applyCPFMask(p.cpf)}` : 'CPF não informado'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-mono font-bold text-slate-800 text-sm">{formatPhoneBR(p.phone)}</div>
                          {p.email && <div className="text-xs text-slate-400 mt-0.5">{p.email}</div>}
                        </td>
                        <td className="p-3.5 font-medium text-slate-700 text-sm">
                          {p.birthDate ? (
                            <div>
                              <div className="font-bold text-slate-800 text-sm">
                                {p.birthDate.split('-').reverse().join('/')}
                              </div>
                              <div className="text-xs text-slate-400 font-medium">
                                {calculateAge(p.birthDate)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {p.street || p.city || p.cep ? (
                            <div className="max-w-[220px] text-xs leading-snug">
                              <div className="font-semibold text-slate-800 truncate" title={`${p.street || ''}${p.number ? `, ${p.number}` : ''}`}>
                                {p.street ? `${p.street}${p.number ? `, ${p.number}` : ''}` : 'Endereço s/ rua'}
                              </div>
                              <div className="text-slate-500 truncate" title={`${[p.neighborhood, p.city].filter(Boolean).join(' - ')} ${p.cep ? `CEP: ${p.cep}` : ''}`}>
                                {[p.neighborhood, p.city].filter(Boolean).join(' - ')}
                                {p.cep ? ` • CEP ${p.cep}` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">Não informado</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {p._count?.appointments ?? 1} consulta(s)
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 text-xs max-w-xs truncate">{p.notes || '—'}</td>
                        <td className="p-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleOpenPatientModal(p)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePatient(p.id)}
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: FILA DE ESPERA (REMODELAÇÃO DE ENCAIXES COM IA WHATSAPP)
          --------------------------------------------------------------------- */}
          {activeTab === 'fila' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 flex flex-col overflow-y-auto">
              {/* CABEÇALHO */}
              <div className="pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 border border-sky-100 shadow-2xs">
                    <Inbox className="w-6 h-6 text-sky-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      Fila de Espera Inteligente
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                      Gerencie a lista de pacientes aguardando vagas e o acionamento automático via WhatsApp ao liberar horários por cancelamento ou remarcação.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTriggerWaitlistTest}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    title="Simula a liberação de um horário e dispara mensagem automática via WhatsApp para o 1º da fila"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>Testar Disparo para o 1º da Fila</span>
                  </button>

                  <button
                    onClick={() => setShowModalAddWaitlist(true)}
                    className="px-4 py-2 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Adicionar à Fila</span>
                  </button>
                </div>
              </div>

              {/* BANNER DE NOTIFICAÇÃO / SUCESSO DA FILA */}
              {waitlistNotice && (
                <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold">{waitlistNotice}</span>
                  </div>
                  <button onClick={() => setWaitlistNotice(null)} className="text-emerald-700 hover:text-emerald-900 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* CARDS DE MÉTRICAS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 my-5">
                <div className="p-4 sm:p-5 rounded-2xl bg-sky-50/70 border border-sky-100/90 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-900 block">Pacientes Aguardando Vaga</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
                  </div>
                  <span className="text-3xl font-black text-sky-950 mt-1.5 block">
                    {waitlist.filter((w) => w.status === 'AGUARDANDO').length}
                  </span>
                  <span className="text-[11px] text-sky-700 mt-1 block font-medium">
                    Prioridade por ordem de chegada na fila
                  </span>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-100/90 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 block">Vagas Ofertadas (Aguardando)</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-3xl font-black text-amber-950 mt-1.5 block">
                    {waitlist.filter((w) => w.status === 'NOTIFICADO').length}
                  </span>
                  <span className="text-[11px] text-amber-700 mt-1 block font-medium">
                    Aguardando confirmação via WhatsApp
                  </span>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/70 border border-emerald-100/90 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 block">Lacunas Preenchidas / Encaixes</span>
                    <CheckCircle2 className="w-4 h-4 text-[#005a43]" />
                  </div>
                  <span className="text-3xl font-black text-emerald-950 mt-1.5 block">
                    {waitlist.filter((w) => w.status === 'AGENDADO').length}
                  </span>
                  <span className="text-[11px] text-emerald-700 mt-1 block font-medium">
                    Agendamentos recuperados automaticamente
                  </span>
                </div>
              </div>

              {/* FILTROS E BUSCA */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={waitlistSearch}
                    onChange={(e) => setWaitlistSearch(e.target.value)}
                    placeholder="Buscar por paciente ou telefone..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {[
                    { id: 'ALL', label: 'Todos' },
                    { id: 'AGUARDANDO', label: 'Aguardando' },
                    { id: 'NOTIFICADO', label: 'Notificados WhatsApp' },
                    { id: 'AGENDADO', label: 'Confirmados' },
                    { id: 'RECUSADO', label: 'Recusados' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setWaitlistStatusFilter(filter.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                        waitlistStatusFilter === filter.id
                          ? 'bg-[#005a43] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* LISTA DE PACIENTES NA FILA DE ESPERA */}
              <div className="space-y-3">
                {waitlist
                  .filter((w) => {
                    if (waitlistStatusFilter !== 'ALL' && w.status !== waitlistStatusFilter) return false;
                    if (!waitlistSearch.trim()) return true;
                    const q = waitlistSearch.toLowerCase();
                    return (
                      w.patientName?.toLowerCase().includes(q) ||
                      w.patientPhone?.includes(q) ||
                      w.notes?.toLowerCase().includes(q)
                    );
                  })
                  .map((entry, index) => {
                    const isFirst = entry.status === 'AGUARDANDO' && index === 0;

                    return (
                      <div
                        key={entry.id}
                        className={`p-4 rounded-2xl border transition-all duration-150 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                          entry.status === 'NOTIFICADO'
                            ? 'bg-amber-50/50 border-amber-200 shadow-2xs'
                            : entry.status === 'AGENDADO'
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : isFirst
                            ? 'bg-[#e8f7f0]/60 border-emerald-300 shadow-2xs ring-1 ring-emerald-400/40'
                            : 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3.5 min-w-0">
                          {/* Badge de Posição na Fila */}
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs ${
                              isFirst
                                ? 'bg-[#005a43] text-white'
                                : entry.status === 'NOTIFICADO'
                                ? 'bg-amber-500 text-white'
                                : entry.status === 'AGENDADO'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            #{index + 1}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-slate-900 text-sm">{entry.patientName}</span>
                              {isFirst && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-[#005a43] border border-emerald-300">
                                  Próximo da Fila
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  entry.status === 'AGUARDANDO'
                                    ? 'bg-sky-50 text-sky-800 border-sky-200'
                                    : entry.status === 'NOTIFICADO'
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                    : entry.status === 'AGENDADO'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}
                              >
                                {entry.status === 'AGUARDANDO' && 'Aguardando Vaga'}
                                {entry.status === 'NOTIFICADO' && 'Vaga Oferecida via WhatsApp'}
                                {entry.status === 'AGENDADO' && 'Encaixe Confirmado (Vaga Preenchida)'}
                                {entry.status === 'RECUSADO' && 'Recusou Horário'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap font-medium">
                              <span className="flex items-center gap-1 font-mono text-slate-700">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {formatPhoneBR(entry.patientPhone)}
                              </span>
                              <span>•</span>
                              <span>Turno: <strong>{entry.preferredShift}</strong></span>
                              <span>•</span>
                              <span>Preferência: <strong>{entry.preferredDays || 'Qualquer dia'}</strong></span>
                            </div>

                            {entry.offeredSlot && (
                              <div className="mt-2 p-2 rounded-xl bg-amber-100/70 border border-amber-300/80 text-xs text-amber-950 flex items-center gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>
                                  Horário Ofertado: <strong>{entry.offeredSlot.dateDisplay} às {entry.offeredSlot.timeDisplay}</strong>
                                </span>
                              </div>
                            )}

                            {entry.notes && (
                              <p className="text-[11px] text-slate-400 mt-1 italic">
                                Obs: {entry.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* AÇÕES PARA CADA PACIENTE NA FILA */}
                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                          {entry.status === 'NOTIFICADO' && (
                            <>
                              <button
                                onClick={() => handleConfirmWaitlistBooking(entry.id)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Confirmar Encaixe</span>
                              </button>
                              <button
                                onClick={() => handleDeclineWaitlist(entry.id)}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-bold transition cursor-pointer"
                              >
                                Recusar
                              </button>
                            </>
                          )}

                          {entry.status === 'AGUARDANDO' && (
                            <button
                              onClick={() => {
                                const nextSlot = prompt('Informe a data e horário para oferecer ao paciente (ex: 30/10/2026 14:00):');
                                if (nextSlot) {
                                  const parts = nextSlot.split(' ');
                                  fetch('/api/waitlist', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      action: 'notify_vacated',
                                      startTime: parts[0] && parts[1] ? `${parts[0]}T${parts[1]}:00` : new Date().toISOString(),
                                    }),
                                  }).then(() => {
                                    fetchWaitlist();
                                    setWaitlistNotice(`Vaga oferecida via WhatsApp para ${entry.patientName}!`);
                                  });
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                              <span>Oferecer Vaga WhatsApp</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleRemoveWaitlist(entry.id)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Remover da Fila"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {waitlist.length === 0 && !loadingWaitlist && (
                  <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl">
                    <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700">A fila de espera está vazia no momento</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Quando pacientes interagirem pelo WhatsApp ou forem adicionados manualmente, eles aparecerão aqui.
                    </p>
                  </div>
                )}
              </div>

              {/* CARD INFORMATIVO: FLUXO DE MENSAGENS NO WHATSAPP */}
              <div className="mt-8 p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/90 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200/70">
                  <Sparkles className="w-5 h-5 text-[#005a43]" />
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">
                      Fluxo Automatizado de Mensagens da Fila de Espera no WhatsApp
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Como o sistema interage com os pacientes sem intervenção manual
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-1.5 shadow-2xs">
                    <span className="font-extrabold text-[#005a43] block text-[11px]">
                      1. Paciente Não Consegue Vaga
                    </span>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Se a agenda estiver cheia ou o paciente pedir data lotada, o bot pergunta:
                    </p>
                    <div className="p-2 rounded-lg bg-slate-50 font-mono text-[10px] text-slate-700">
                      "Gostaria de entrar na nossa Fila de Espera? [1] SIM [2] NÃO"
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-1.5 shadow-2xs">
                    <span className="font-extrabold text-sky-700 block text-[11px]">
                      2. Remarcação ou Cancelamento
                    </span>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Assim que um horário for liberado, o 1º paciente da fila recebe imediatamente:
                    </p>
                    <div className="p-2 rounded-lg bg-sky-50 font-mono text-[10px] text-sky-900">
                      "Um horário acaba de ser liberado (Data/Hora). Tem interesse? [1] SIM [2] NÃO"
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-1.5 shadow-2xs">
                    <span className="font-extrabold text-amber-700 block text-[11px]">
                      3. Resumo & Confirmação
                    </span>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Ao responder [1] SIM, o WhatsApp resume a consulta e solicita a confirmação final:
                    </p>
                    <div className="p-2 rounded-lg bg-amber-50 font-mono text-[10px] text-amber-900">
                      "Excelente! Resumo: Paciente, Data e Horário. Confirmar agendamento? [1] SIM [2] NÃO"
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-1.5 shadow-2xs">
                    <span className="font-extrabold text-emerald-700 block text-[11px]">
                      4. Lacuna Preenchida
                    </span>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      A vaga na agenda é ocupada instantaneamente e o paciente recebe a confirmação com sucesso:
                    </p>
                    <div className="p-2 rounded-lg bg-emerald-50 font-mono text-[10px] text-emerald-900">
                      "Agendamento confirmado! A lacuna da agenda foi preenchida. Esperamos você!"
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: WHATSAPP & LEMBRETES
          --------------------------------------------------------------------- */}
          {activeTab === 'whatsapp' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/70 shadow-xs p-3.5 sm:p-6 flex flex-col overflow-y-auto">
              <div className="pb-3 sm:pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-600" />
                    WhatsApp e Automação de Lembretes
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Integração Oficial Meta Cloud API (v26.0) • Disparos automáticos e interativos
                  </p>
                </div>
                <button
                  onClick={handleTriggerCronReminders}
                  disabled={cronRunning}
                  className="px-3.5 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
                >
                  <Clock className={`w-3.5 h-3.5 ${cronRunning ? 'animate-spin' : ''}`} />
                  <span>{cronRunning ? 'Disparando...' : 'Testar Disparo 24h'}</span>
                </button>
              </div>

              <div className="my-4 sm:my-6 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Meta WhatsApp Cloud API Ativa
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Instância conectada com sucesso ao número oficial da clínica. Suporte a botões interativos e IA determinística do POP.
                  </p>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/70">
                  <span className="text-xs font-bold text-slate-900 block">Lembretes das Próximas 24 Horas</span>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Cron automático configurado para checar a cada 30 minutos e notificar pacientes com antecedência mínima de 24 horas.
                  </p>
                </div>
              </div>

              <div className="flex-1 p-4 sm:p-6 rounded-2xl bg-slate-50/50 border border-slate-200/60 overflow-y-auto">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-3">
                  Últimas Notificações Registradas
                </span>
                <div className="space-y-2 text-xs">
                  {appointments.slice(0, 5).map((a) => (
                    <div key={a.id} className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-slate-800 truncate">{a.patient?.name}</span>
                        <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">{formatPhoneBR(a.patient?.phone)}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        Entregue
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: USUÁRIOS & PERMISSÕES DE ACESSO (PERFIL ÚNICO DO MÉDICO)
          --------------------------------------------------------------------- */}
          {activeTab === 'users' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 flex flex-col overflow-hidden">
              {/* CABEÇALHO DA ABA */}
              <div className="pb-3.5 sm:pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Cadastro de Usuários e Acessos</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-[#005a43] uppercase tracking-wide">
                      Perfil Único
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                    Cadastre o(a) médico(a) titular da agenda e os colaboradores de apoio (secretárias, recepção)
                  </p>
                </div>
                <button
                  onClick={() => handleOpenUserModal()}
                  className="px-4.5 py-2.5 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-[#005a43]/15 transition active:scale-95 flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>+ Cadastrar Usuário</span>
                </button>
              </div>

              {/* BANNER INFORMATIVO: CONTEXTO PERFIL ÚNICO */}
              <div className="my-3.5 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-slate-50 border border-emerald-200 flex items-start sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#005a43] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div className="text-xs leading-relaxed text-slate-700">
                    <div className="flex items-center gap-1.5 font-extrabold text-slate-900 mb-0.5">
                      <span>Titular Atual da Agenda:</span>
                      <span className="text-[#005a43]">{activeDoctor.name}</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-100 text-[#005a43] font-bold">
                        {activeDoctor.specialty} • {activeDoctor.crm}
                      </span>
                    </div>
                    <span className="text-slate-500 block">
                      O sistema identifica o dono da agenda através do usuário com o perfil <strong>Médico(a) Titular</strong>. Ao cadastrar ou editar esse usuário, o nome de toda a agenda (Ex: <em>Agenda da Dra. Mariana - Pediatra</em>) atualiza automaticamente.
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const doc = users.find((u) => u.role === 'MEDICO');
                    if (doc) handleOpenUserModal(doc);
                    else handleOpenUserModal();
                  }}
                  className="shrink-0 px-3.5 py-1.5 rounded-xl bg-white border border-emerald-300 text-[#005a43] hover:bg-emerald-50 text-xs font-bold transition shadow-2xs"
                >
                  Editar Médico Titular
                </button>
              </div>

              {/* BARRA DE PESQUISA & ESTATÍSTICAS */}
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Buscar por nome, login, CPF ou e-mail..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                  />
                  {userSearch && (
                    <button
                      onClick={() => setUserSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium">Total cadastrados:</span>
                  <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    {users.length} usuários
                  </span>
                </div>
              </div>

              {/* LISTAGEM DE CARDS EM MOBILE (< md) */}
              <div className="md:hidden flex-1 overflow-y-auto space-y-3">
                {users
                  .filter((u) => {
                    if (!userSearch.trim()) return true;
                    const q = userSearch.toLowerCase();
                    return (
                      u.name?.toLowerCase().includes(q) ||
                      u.login?.toLowerCase().includes(q) ||
                      u.email?.toLowerCase().includes(q) ||
                      u.cpf?.includes(q) ||
                      u.phone?.includes(q)
                    );
                  })
                  .map((u) => {
                    const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
                    const isDoctor = u.role === 'MEDICO';
                    return (
                      <div
                        key={u.id}
                        className={`p-4 rounded-2xl border space-y-3 transition ${isDoctor
                          ? 'bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border-emerald-300 shadow-xs ring-1 ring-emerald-300/50'
                          : 'bg-slate-50/80 border-slate-200/80'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-slate-900 text-base">{u.name}</span>
                              {isDoctor && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-[#005a43] border border-emerald-300 flex items-center gap-1">
                                  ⭐ Médico Titular
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-[#005a43] bg-emerald-100/60 px-2 py-0.5 rounded-md">
                                @{u.login || 'sem_login'}
                              </span>
                              <span className="text-xs text-slate-700 font-semibold">
                                {u.specialty || (isDoctor ? 'Pediatria' : u.role)}
                              </span>
                              {isDoctor && u.crm && (
                                <span className="text-xs text-slate-500 font-mono">
                                  • {u.crm}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleUserStatus(u)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition shrink-0 ${u.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-200 text-slate-600'
                              }`}
                          >
                            {u.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                          </button>
                        </div>

                        <div className="space-y-1 text-xs text-slate-600">
                          {u.cpf && <div><strong>CPF:</strong> {u.cpf}</div>}
                          <div><strong>E-mail:</strong> <span className="font-mono">{u.email}</span></div>
                          {u.phone && <div><strong>Celular:</strong> {u.phone}</div>}
                        </div>

                        {/* PERMISSÕES RESUMO */}
                        <div className="pt-2 border-t border-slate-200/60">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-bold text-slate-700">Permissões de Acesso:</span>
                            <span className="font-bold text-[#005a43]">{perms.length} de 9 ativas</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {perms.map((pId) => {
                              const permObj = USER_PERMISSIONS.find((p) => p.id === pId);
                              return (
                                <span
                                  key={pId}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700"
                                >
                                  {permObj?.label || pId}
                                </span>
                              );
                            })}
                            {perms.length === 0 && (
                              <span className="text-xs text-amber-600 italic">Nenhuma permissão concedida</span>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200/60">
                          <button
                            onClick={() => handleOpenUserModal(u)}
                            className="py-1.5 px-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs hover:bg-slate-100"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="py-1.5 px-3.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-xs font-bold shadow-2xs hover:bg-rose-50"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* TABELA DE USUÁRIOS EM DESKTOP (>= md) */}
              <div className="hidden md:block flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Usuário e Login</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Especialidade / Função</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Contato e CPF</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Permissões de Acesso</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Status</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs text-right border-b border-slate-200">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users
                      .filter((u) => {
                        if (!userSearch.trim()) return true;
                        const q = userSearch.toLowerCase();
                        return (
                          u.name?.toLowerCase().includes(q) ||
                          u.login?.toLowerCase().includes(q) ||
                          u.email?.toLowerCase().includes(q) ||
                          u.cpf?.includes(q) ||
                          u.phone?.includes(q)
                        );
                      })
                      .map((u) => {
                        const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
                        const isDoctor = u.role === 'MEDICO';
                        return (
                          <tr
                            key={u.id}
                            className={`transition ${isDoctor ? 'bg-emerald-50/50 hover:bg-emerald-50/80 font-medium' : 'hover:bg-slate-50/80'
                              }`}
                          >
                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 block text-sm">{u.name}</span>
                                {isDoctor && (
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-[#005a43] border border-emerald-300 flex items-center gap-1 shadow-2xs">
                                    ⭐ Titular da Agenda
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-xs font-extrabold text-[#005a43] bg-emerald-50 border border-emerald-200/80 px-2 py-0.2 rounded-md">
                                  @{u.login || 'sem_login'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5">
                              <span className={`block text-xs ${isDoctor ? 'font-extrabold text-[#005a43]' : 'font-semibold text-slate-800'}`}>
                                {u.specialty || (isDoctor ? 'Pediatria' : 'Secretária')}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {isDoctor ? (u.crm ? `CRM: ${u.crm}` : 'Médico Responsável') : (u.role === 'ADMIN' ? 'Administrador' : 'Operador do sistema')}
                              </span>
                            </td>
                            <td className="p-3.5 text-xs">
                              <span className="font-mono text-slate-700 block">{u.email}</span>
                              <span className="text-slate-500 font-medium block">
                                {u.phone ? formatPhone(u.phone) : 'Sem celular'} {u.cpf ? `• CPF: ${u.cpf}` : ''}
                              </span>
                            </td>
                            <td className="p-3.5 max-w-xs">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-xs font-bold text-slate-800">
                                  {perms.length} de 9 liberadas
                                </span>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {perms.slice(0, 3).map((pId) => {
                                  const p = USER_PERMISSIONS.find((item) => item.id === pId);
                                  return (
                                    <span
                                      key={pId}
                                      className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 truncate max-w-[120px]"
                                    >
                                      {p?.label || pId}
                                    </span>
                                  );
                                })}
                                {perms.length > 3 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-[#005a43] border border-emerald-200">
                                    +{perms.length - 3} mais
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <button
                                onClick={() => handleToggleUserStatus(u)}
                                className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition ${u.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                  }`}
                              >
                                {u.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                              </button>
                            </td>
                            <td className="p-3.5 text-right space-x-1.5">
                              <button
                                onClick={() => handleOpenUserModal(u)}
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                title="Editar Usuário e Permissões"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: CRIAR AGENDA & PARÂMETROS DE ATENDIMENTO DO MÉDICO
          --------------------------------------------------------------------- */}
          {activeTab === 'settings' && clinic && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 overflow-y-auto">
              {/* CABEÇALHO DA ABA CRIAR AGENDA */}
              <div className="pb-4 border-b border-slate-100 mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#e8f7f0] text-[#00875a] flex items-center justify-center shrink-0 border border-[#d1fae5] shadow-2xs">
                    <CalendarPlus className="w-6 h-6 text-[#005a43]" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      Criar Agenda & Parâmetros de Atendimento
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                      Configure o período de abertura da agenda, dias de atendimento, horários de expediente, intervalos e duração das consultas.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-[#005a43] border border-emerald-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse"></span>
                    Agenda do Dr(a). {activeDoctor.name}
                  </span>
                </div>
              </div>

              {/* BANNER DE SUCESSO AO SALVAR */}
              {saveSuccessMsg && (
                <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div className="flex-1 text-xs sm:text-sm font-bold">
                    {saveSuccessMsg}
                  </div>
                  <button
                    onClick={() => setSaveSuccessMsg(null)}
                    className="text-emerald-700 hover:text-emerald-900 font-bold p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* FORMULÁRIO DE CRIAÇÃO E CONFIGURAÇÃO DA AGENDA */}
              <form onSubmit={handleSaveSettings} className="space-y-6 max-w-4xl text-sm">
                {/* =========================================================================
                    1. PERÍODO DE ABERTURA DA AGENDA (DATA INÍCIO E DATA FIM)
                ========================================================================= */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <CalendarRange className="w-5 h-5 text-[#005a43]" />
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">1. Período de Abertura da Agenda</h3>
                        <p className="text-[11px] text-slate-400 font-medium">Intervalo de datas em que o médico estará com a agenda aberta para atendimentos</p>
                      </div>
                    </div>
                    {scheduleDateSpanDays > 0 && (
                      <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-50 text-[#005a43] border border-emerald-200">
                        {scheduleDateSpanDays} dias abertos
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5 text-xs">
                        Data de Início da Abertura da Agenda
                      </label>
                      <input
                        type="date"
                        required
                        value={scheduleStartDate}
                        onChange={(e) => setScheduleStartDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] shadow-2xs"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">Início da liberação de consultas</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5 text-xs">
                        Data de Término da Abertura da Agenda
                      </label>
                      <input
                        type="date"
                        required
                        value={scheduleEndDate}
                        onChange={(e) => setScheduleEndDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] shadow-2xs"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">Limite máximo de agendamento futuro</span>
                    </div>
                  </div>

                  {/* ATALHOS RÁPIDOS DE PERÍODO */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-50">
                    <span className="text-[11px] font-bold text-slate-400">Atalhos de período:</span>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(30)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      Próximos 30 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(60)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      Próximos 60 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(90)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      Próximos 90 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => applyEndOfYearPreset()}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      Até 31 de Dezembro
                    </button>
                  </div>

                  {/* AVISO DE CONSULTAS PREVIAMENTE AGENDADAS NO PERÍODO */}
                  {existingApptsInRange.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Aviso sobre horários já marcados anteriormente:</p>
                        <p className="mt-0.5 text-amber-800">
                          Existem <strong>{existingApptsInRange.length} consulta(s) previamente agendada(s)</strong> no período de {scheduleStartDate} a {scheduleEndDate}.
                          Ao salvar a abertura desta agenda, <strong>nenhuma consulta anterior será substituída ou apagada</strong>; todos os horários marcados anteriormente permanecerão preservados e mantidos na agenda.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* =========================================================================
                    2. DIAS DA SEMANA QUE VAI ATENDER (ESTILO CHECKBOX)
                ========================================================================= */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-5 h-5 text-[#005a43]" />
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">2. Dias da Semana que vai Atender</h3>
                        <p className="text-[11px] text-slate-400 font-medium">Marcador estilo checkbox dos dias com expediente habilitado para o médico</p>
                      </div>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {selectedDays.length} {selectedDays.length === 1 ? 'dia ativo' : 'dias ativos'}
                    </span>
                  </div>

                  {/* CARDS COM CHECKBOX PARA CADA DIA DA SEMANA */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                    {DAYS_OF_WEEK.map((day) => {
                      const isChecked = selectedDays.includes(day.id);
                      return (
                        <label
                          key={day.id}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 cursor-pointer select-none transition-all duration-150 ${
                            isChecked
                              ? 'bg-[#e8f7f0] border-[#00875a] text-[#005a43] shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleDay(day.id)}
                              className="w-4 h-4 rounded text-[#005a43] accent-[#005a43] focus:ring-[#005a43] border-slate-300 cursor-pointer"
                            />
                            <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              isChecked ? 'bg-[#005a43] text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isChecked ? 'ON' : 'OFF'}
                            </span>
                          </div>
                          <span className="text-base font-black tracking-tight mt-0.5">
                            {day.label}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 text-center truncate max-w-full">
                            {day.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* AÇÕES RÁPIDAS DE SELEÇÃO DE DIAS */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-50">
                    <span className="text-[11px] font-bold text-slate-400">Seleção rápida:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDays(['1', '2', '3', '4', '5'])}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#005a43] border border-emerald-200 transition"
                    >
                      Segunda a Sexta (Padrão)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDays(['1', '2', '3', '4', '5', '6'])}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      Segunda a Sábado
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDays(['0', '1', '2', '3', '4', '5', '6'])}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      Todos os Dias
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDays([])}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                {/* =========================================================================
                    3. EXPEDIENTE DE ATENDIMENTO (Ex: 08:00 às 17:00)
                ========================================================================= */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[#005a43]" />
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">3. Expediente de Atendimento Diário</h3>
                        <p className="text-[11px] text-slate-400 font-medium">Horário de início e término dos atendimentos (exemplo: das 08:00 às 17:00)</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {workStartTime} às {workEndTime}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5 text-xs">
                        Início do Expediente
                      </label>
                      <input
                        type="time"
                        required
                        value={workStartTime}
                        onChange={(e) => setWorkStartTime(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] shadow-2xs"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">Exemplo comum: 08:00</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5 text-xs">
                        Término do Expediente
                      </label>
                      <input
                        type="time"
                        required
                        value={workEndTime}
                        onChange={(e) => setWorkEndTime(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] shadow-2xs"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">Exemplo comum: 17:00 ou 18:00</span>
                    </div>
                  </div>

                  {/* ATALHOS RÁPIDOS DE JORNADA */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-50">
                    <span className="text-[11px] font-bold text-slate-400">Sugestões de expediente:</span>
                    <button
                      type="button"
                      onClick={() => { setWorkStartTime('08:00'); setWorkEndTime('17:00'); }}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#005a43] border border-emerald-200 transition"
                    >
                      08:00 às 17:00 (Padrão)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWorkStartTime('08:00'); setWorkEndTime('18:00'); }}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      08:00 às 18:00
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWorkStartTime('07:00'); setWorkEndTime('16:00'); }}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      07:00 às 16:00
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWorkStartTime('09:00'); setWorkEndTime('19:00'); }}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      09:00 às 19:00
                    </button>
                  </div>
                </div>

                {/* =========================================================================
                    4. PERÍODO DE INTERVALO DURANTE O EXPEDIENTE (BLOQUEIO DE CONSULTA)
                ========================================================================= */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Coffee className="w-5 h-5 text-amber-600" />
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">4. Intervalo durante o Expediente (Almoço / Pausa)</h3>
                        <p className="text-[11px] text-slate-400 font-medium">
                          Durante esse período o médico pode almoçar ou resolver outros compromissos — <strong>não haverá marcação de consultas</strong>
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={breakEnabled}
                        onChange={(e) => setBreakEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-[#005a43] accent-[#005a43] focus:ring-[#005a43] border-slate-300 cursor-pointer"
                      />
                      <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
                        breakEnabled ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {breakEnabled ? 'Intervalo Habilitado' : 'Sem Intervalo'}
                      </span>
                    </label>
                  </div>

                  {breakEnabled ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-bold text-slate-800 mb-1.5 text-xs">
                            Início do Intervalo (Almoço)
                          </label>
                          <input
                            type="time"
                            required={breakEnabled}
                            value={breakStartTime}
                            onChange={(e) => setBreakStartTime(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] shadow-2xs"
                          />
                          <span className="text-[11px] text-slate-400 mt-1 block">Ex: 12:00</span>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-800 mb-1.5 text-xs">
                            Fim do Intervalo (Retorno do Almoço)
                          </label>
                          <input
                            type="time"
                            required={breakEnabled}
                            value={breakEndTime}
                            onChange={(e) => setBreakEndTime(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] shadow-2xs"
                          />
                          <span className="text-[11px] text-slate-400 mt-1 block">Ex: 13:00</span>
                        </div>
                      </div>

                      {/* CALLOUT DE BLOQUEIO DE CONSULTA */}
                      <div className="p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-xl flex items-start gap-3 text-xs text-amber-900">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-extrabold block text-amber-950">
                            Bloqueio Automático de Agendamento:
                          </span>
                          Entre <strong>{breakStartTime}</strong> e <strong>{breakEndTime}</strong>, nenhum paciente poderá marcar consulta pelo WhatsApp Bot, recepcionista ou encaixe.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-medium">
                      Atendimento contínuo sem intervalo configurado. Os horários serão gerados sequencialmente das {workStartTime} às {workEndTime}.
                    </div>
                  )}
                </div>

                {/* =========================================================================
                    5. DURAÇÃO DAS CONSULTAS (FUTURA E RETORNO EM MINUTOS)
                ========================================================================= */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[#005a43]" />
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">5. Duração das Consultas (em minutos)</h3>
                        <p className="text-[11px] text-slate-400 font-medium">Tempo previsto de atendimento para consultas novas e consultas de retorno</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* DURAÇÃO CONSULTA FUTURA / PRIMEIRA CONSULTA */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-white border border-emerald-100/90 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#005a43]"></span>
                          Duração de Consulta Futura / 1ª Vez
                        </label>
                        <span className="text-xs font-black px-2 py-0.5 rounded-md bg-emerald-100 text-[#005a43]">
                          {slotDurationMinutes} min
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Tempo de duração reservado para novas consultas e avaliações completas do paciente.
                      </p>
                      <input
                        type="number"
                        min="5"
                        step="5"
                        required
                        value={slotDurationMinutes}
                        onChange={(e) => setSlotDurationMinutes(Math.max(5, parseInt(e.target.value) || 5))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] shadow-2xs"
                      />
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {[15, 20, 30, 40, 45, 60].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setSlotDurationMinutes(mins)}
                            className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition ${
                              slotDurationMinutes === mins
                                ? 'bg-[#005a43] text-white border-[#005a43] shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {mins} min
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DURAÇÃO CONSULTA DE RETORNO */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50/50 to-white border border-sky-100/90 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                          Duração de Consulta de Retorno
                        </label>
                        <span className="text-xs font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-800">
                          {returnSlotDurationMinutes} min
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Tempo previsto para retorno, reavaliação de exames e pós-tratamento.
                      </p>
                      <input
                        type="number"
                        min="5"
                        step="5"
                        required
                        value={returnSlotDurationMinutes}
                        onChange={(e) => setReturnSlotDurationMinutes(Math.max(5, parseInt(e.target.value) || 5))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                      />
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {[10, 15, 20, 25, 30, 40].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setReturnSlotDurationMinutes(mins)}
                            className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition ${
                              returnSlotDurationMinutes === mins
                                ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {mins} min
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* =========================================================================
                      OPÇÕES ESPECÍFICAS DE CONSULTAS DE RETORNO (QUANTIDADE & HORÁRIOS)
                  ========================================================================= */}
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50/60 to-white border border-sky-200/90 space-y-4 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-sky-100">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-sky-700" />
                          <div>
                            <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                              Consultas de Retorno por Dia & Horários Reservados
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Configure o limite diário de consultas de retorno e marque em quais horários da grade essas consultas devam ficar
                            </p>
                          </div>
                        </div>

                        <span className="text-xs font-black px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-300">
                          {returnSlotTimes.length} de {maxReturnSlotsPerDay} horários selecionados
                        </span>
                      </div>

                      {/* 1. QUANTIDADE DE CONSULTAS DE RETORNO POR DIA */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="font-extrabold text-slate-800 text-xs">
                            Quantas consultas de retorno por dia?
                          </label>
                          <span className="text-xs font-black px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-900">
                            Máximo: {maxReturnSlotsPerDay} retornos/dia
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                          <input
                            type="number"
                            min="0"
                            max="30"
                            required
                            value={maxReturnSlotsPerDay}
                            onChange={(e) => setMaxReturnSlotsPerDay(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[1, 2, 3, 4, 5, 6, 8].map((qtd) => (
                              <button
                                key={qtd}
                                type="button"
                                onClick={() => setMaxReturnSlotsPerDay(qtd)}
                                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                                  maxReturnSlotsPerDay === qtd
                                    ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                {qtd} por dia
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 2. HORÁRIOS QUE ESSAS CONSULTAS DEVAM FICAR */}
                      <div className="space-y-2.5 pt-2 border-t border-sky-100/80">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="font-extrabold text-slate-800 text-xs">
                            Horários em que essas consultas devam ficar (Selecione na grade):
                          </label>

                          {/* ATALHOS RÁPIDOS DE DISTRIBUIÇÃO DOS RETORNOS */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400">Atalhos:</span>
                            <button
                              type="button"
                              onClick={() => applyReturnPresets('end')}
                              className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 hover:bg-sky-100 transition"
                            >
                              Últimos horários
                            </button>
                            <button
                              type="button"
                              onClick={() => applyReturnPresets('start')}
                              className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 hover:bg-sky-100 transition"
                            >
                              Primeiros horários
                            </button>
                            <button
                              type="button"
                              onClick={() => applyReturnPresets('split')}
                              className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 hover:bg-sky-100 transition"
                            >
                              Início & Fim
                            </button>
                            <button
                              type="button"
                              onClick={() => applyReturnPresets('clear')}
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-rose-600 transition"
                            >
                              Limpar
                            </button>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-500">
                          Clique diretamente nos horários da grade abaixo para definir quais horários do expediente serão reservados para consultas de retorno:
                        </p>

                        {/* GRADE CLICÁVEL DE HORÁRIOS PARA RETORNO */}
                        <div className="flex flex-wrap gap-2 p-2 rounded-xl bg-white border border-sky-200/80 max-h-48 overflow-y-auto">
                          {generatedPreviewSlots
                            .filter((s) => !s.isBreak)
                            .map((slot) => {
                              const isSelectedReturn = returnSlotTimes.includes(slot.time);
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  onClick={() => toggleReturnSlotTime(slot.time)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-black border transition flex items-center gap-1.5 cursor-pointer ${
                                    isSelectedReturn
                                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-sky-50 hover:border-sky-300'
                                  }`}
                                >
                                  {isSelectedReturn && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                  <span>{slot.time} - {slot.endTime}</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    isSelectedReturn ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-600'
                                  }`}>
                                    {isSelectedReturn ? `Retorno (${slot.duration}m)` : `1ª Vez (${slot.duration}m)`}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* =========================================================================
                    6. VISUALIZAÇÃO EM TEMPO REAL DA GRADE GERADA (PREVIEW INTERATIVO)
                ========================================================================= */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-[#005a43]" />
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">Previsão em Tempo Real da Grade de Horários</h3>
                        <p className="text-[11px] text-slate-400 font-medium">Visualização clara das consultas de 1ª vez, retornos e intervalo do médico</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-50 text-[#005a43] border border-emerald-200">
                        {generatedPreviewSlots.filter((s) => !s.isBreak && !s.isReturn).length} 1ª Vez ({slotDurationMinutes}m)
                      </span>
                      <span className="text-xs font-black px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                        {generatedPreviewSlots.filter((s) => !s.isBreak && s.isReturn).length} Retornos ({returnSlotDurationMinutes}m)
                      </span>
                      {breakEnabled && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Coffee className="w-3 h-3" />
                          Pausa {breakStartTime} - {breakEndTime}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    Grade gerada para atendimentos das <strong>{workStartTime}</strong> às <strong>{workEndTime}</strong>:
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1 max-h-48 overflow-y-auto p-1 bg-slate-50/60 rounded-xl border border-slate-100">
                    {generatedPreviewSlots.map((slot, idx) => (
                      <span
                        key={idx}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition flex items-center gap-1.5 ${
                          slot.isBreak
                            ? 'bg-amber-100/80 text-amber-900 border-amber-300 opacity-90 cursor-not-allowed'
                            : slot.isReturn
                            ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-2xs font-black'
                            : 'bg-white text-[#005a43] border-emerald-200 shadow-2xs hover:border-[#005a43]'
                        }`}
                        title={
                          slot.isBreak
                            ? `Intervalo Bloqueado (${slot.time} - ${slot.endTime})`
                            : slot.isReturn
                            ? `Consulta de Retorno Reservada (${slot.time} às ${slot.endTime})`
                            : `Consulta Nova / 1ª Vez (${slot.time} às ${slot.endTime})`
                        }
                      >
                        {slot.isBreak && <Coffee className="w-3.5 h-3.5 text-amber-700" />}
                        {slot.isReturn && <Clock className="w-3.5 h-3.5 text-sky-600" />}
                        <span>{slot.time} - {slot.endTime}</span>
                        {slot.isBreak && <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">Pausa Almoço</span>}
                        {slot.isReturn && <span className="text-[10px] text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded font-bold">Retorno ({slot.duration}m)</span>}
                        {!slot.isBreak && !slot.isReturn && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">1ª Vez ({slot.duration}m)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* BOTÃO PRINCIPAL DE SALVAR E CRIAR AGENDA */}
                <div className="pt-4 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
                  <div className="text-xs text-slate-500 font-medium">
                    Ao salvar, a agenda e os horários de atendimento são recalculados para o período selecionado.
                  </div>

                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="w-full sm:w-auto px-8 py-3.5 bg-[#005a43] hover:bg-[#004735] text-white font-black rounded-2xl shadow-lg shadow-[#005a43]/20 transition-all duration-150 active:scale-95 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {savingSettings ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Criando e Salvando Agenda...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        <span>Criar e Salvar Agenda</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              NOVA ABA: DADOS PROFISSIONAIS (MÉDICO TITULAR DA AGENDA)
          --------------------------------------------------------------------- */}
          {activeTab === 'profissionais' && clinic && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 overflow-y-auto">
              {/* CABEÇALHO DADOS PROFISSIONAIS */}
              <div className="pb-4 border-b border-slate-100 mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#e8f7f0] text-[#00875a] flex items-center justify-center shrink-0 border border-[#d1fae5] shadow-2xs">
                    <Stethoscope className="w-6 h-6 text-[#005a43]" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      Dados Profissionais
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                      Informações profissionais do médico titular da agenda exibidas nas mensagens automáticas de confirmação do WhatsApp, receitas e identificação do consultório.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-[#005a43] border border-emerald-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse"></span>
                    {clinic.doctorName || clinic.name || 'Médico Titular'} • {clinic.crm || 'CRM pendente'}
                  </span>
                </div>
              </div>

              {/* BANNER DE CONFIRMAÇÃO DE SALVAMENTO */}
              {saveProfissionaisMsg && (
                <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div className="flex-1 text-xs sm:text-sm font-bold">
                    {saveProfissionaisMsg}
                  </div>
                  <button
                    onClick={() => setSaveProfissionaisMsg(null)}
                    className="text-emerald-700 hover:text-emerald-900 font-bold p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* FORMULÁRIO DE DADOS PROFISSIONAIS */}
              <form onSubmit={handleSaveProfissionais} className="space-y-6 max-w-4xl text-sm">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200/70">
                    <Stethoscope className="w-4.5 h-4.5 text-[#005a43]" />
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">Identificação do Médico Titular</h3>
                      <p className="text-[11px] text-slate-400 font-medium">
                        Nome, especialidade e registro de conselho de classe
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">Nome Completo do Médico</label>
                      <input
                        type="text"
                        required
                        value={clinic.doctorName || clinic.name || ''}
                        onChange={(e) => setClinic({ ...clinic, doctorName: e.target.value, name: e.target.value })}
                        placeholder="Ex: Dr. Renato Silva"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">CRM / Registro Profissional</label>
                      <input
                        type="text"
                        value={clinic.crm || ''}
                        onChange={(e) => setClinic({ ...clinic, crm: e.target.value })}
                        placeholder="Ex: CRM/SP 148.910"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">Especialidade Médica Principal</label>
                    <input
                      type="text"
                      required
                      value={clinic.specialty || ''}
                      onChange={(e) => setClinic({ ...clinic, specialty: e.target.value })}
                      placeholder="Ex: Cardiologia, Pediatria, Dermatologia..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[11px] font-bold text-slate-400">Sugestões rápidas:</span>
                      {['Cardiologia', 'Pediatria', 'Dermatologia', 'Clínica Geral', 'Ginecologia', 'Ortopedia', 'Oftalmologia', 'Endocrinologia'].map((esp) => (
                        <button
                          key={esp}
                          type="button"
                          onClick={() => setClinic({ ...clinic, specialty: esp })}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-[#005a43] text-slate-600 transition cursor-pointer"
                        >
                          {esp}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CONTATOS E ENDEREÇO DO CONSULTÓRIO */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200/70">
                    <Building2 className="w-4.5 h-4.5 text-[#005a43]" />
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">Contatos e Local de Atendimento</h3>
                      <p className="text-[11px] text-slate-400 font-medium">
                        Canais de contato direto e endereço fornecido aos pacientes
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">E-mail Profissional</label>
                      <input
                        type="email"
                        value={clinic.email || ''}
                        onChange={(e) => setClinic({ ...clinic, email: e.target.value })}
                        placeholder="contato@medico.med.br"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">Celular / WhatsApp do Consultório</label>
                      <input
                        type="text"
                        value={clinic.phone || ''}
                        onChange={(e) => setClinic({ ...clinic, phone: e.target.value })}
                        placeholder="(11) 98888-7777"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">Consultório / Sala / Endereço Completo</label>
                    <input
                      type="text"
                      value={clinic.address || ''}
                      onChange={(e) => setClinic({ ...clinic, address: e.target.value })}
                      placeholder="Ex: Av. Paulista, 1000 - Conjunto 402 - Bela Vista, São Paulo - SP"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                    />
                  </div>

                  <div className="pt-2">
                    <label className="block font-bold text-slate-800 mb-1 text-xs">
                      Antecedência Mínima para Cancelamento / Remarcação (horas)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={clinic.minCancelHours || 2}
                      onChange={(e) => setClinic({ ...clinic, minCancelHours: parseInt(e.target.value) || 2 })}
                      className="w-full sm:w-48 px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white shadow-2xs"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Tempo mínimo que o paciente precisa para cancelar via bot antes de exigir contato com a recepção.
                    </p>
                  </div>
                </div>

                {/* BOTÃO SALVAR DADOS PROFISSIONAIS */}
                <div className="pt-4 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
                  <div className="text-xs text-slate-500 font-medium">
                    As informações salvas são sincronizadas em tempo real nos canais de atendimento e mensagens de confirmação.
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfissionais}
                    className="w-full sm:w-auto px-8 py-3.5 bg-[#005a43] hover:bg-[#004735] text-white font-black rounded-2xl shadow-lg shadow-[#005a43]/20 transition-all duration-150 active:scale-95 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {savingProfissionais ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Salvando Dados Profissionais...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        <span>Salvar Dados Profissionais</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================================
          BARRA DE NAVEGAÇÃO INFERIOR MOBILE (iOS / Android TabBar)
      ========================================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#e5efe9] z-40 px-2 py-1.5 flex items-center justify-around shadow-lg pb-safe">
        <button
          onClick={() => setActiveTab('agenda')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${activeTab === 'agenda' ? 'text-[#00875a] font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
            }`}
        >
          <div className="relative">
            <CalendarIcon className="w-5 h-5" />
            {appointments.length > 0 && (
              <span className="absolute -top-1 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-[#00875a] text-white">
                {appointments.length}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5">Agenda</span>
        </button>

        <button
          onClick={() => setActiveTab('patients')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${activeTab === 'patients' ? 'text-[#00875a] font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
            }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Pacientes</span>
        </button>

        <button
          onClick={() => setActiveTab('fila')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${activeTab === 'fila' ? 'text-teal-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
        >
          <div className="relative">
            <Inbox className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="text-[10px] mt-0.5">Fila de Espera</span>
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${activeTab === 'whatsapp' ? 'text-teal-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <span className="text-[10px] mt-0.5">WhatsApp</span>
        </button>
      </nav>

      {/* FAB: NOVA CONSULTA (MOBILE) - EXCLUSIVO NO MENU AGENDA */}
      {activeTab === 'agenda' && (
        <button
          onClick={() => {
            setNewApptTime('');
            setShowModalNewAppt(true);
          }}
          className="lg:hidden fixed right-4 bottom-20 z-40 bg-teal-600 hover:bg-teal-700 text-white rounded-full px-4 py-3 shadow-xl shadow-teal-900/30 flex items-center gap-1.5 font-bold text-xs active:scale-95 transition"
          aria-label="Nova Consulta"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>+ Consulta</span>
        </button>
      )}

      {/* MODAL / BOTTOM SHEET MOBILE DE FILTROS & CALENDÁRIO */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end sm:items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto z-10 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-teal-600" />
                Calendário & Filtros da Agenda
              </h3>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* MINI CALENDÁRIO MENSAL */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">{monthLabel}</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      const m = new Date(calendarMonth);
                      m.setMonth(m.getMonth() - 1);
                      setCalendarMonth(m);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const m = new Date(calendarMonth);
                      m.setMonth(m.getMonth() + 1);
                      setCalendarMonth(m);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* GRID DO MÊS */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                <span className="text-[10px] font-bold text-slate-400">D</span>
                <span className="text-[10px] font-bold text-slate-400">S</span>
                <span className="text-[10px] font-bold text-slate-400">T</span>
                <span className="text-[10px] font-bold text-slate-400">Q</span>
                <span className="text-[10px] font-bold text-slate-400">Q</span>
                <span className="text-[10px] font-bold text-slate-400">S</span>
                <span className="text-[10px] font-bold text-slate-400">S</span>

                {miniCalendarDays.map((item, idx) => {
                  const isSelected = item.dateObj.toDateString() === selectedDate.toDateString();
                  const isToday = item.dateObj.toDateString() === new Date().toDateString();

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(item.dateObj);
                        setMobileFiltersOpen(false);
                      }}
                      className={`h-7 w-7 mx-auto rounded-xl flex items-center justify-center text-xs font-semibold transition ${isSelected
                        ? 'bg-slate-900 text-white font-bold shadow-xs'
                        : isToday
                          ? 'border border-teal-500 text-teal-700 font-bold'
                          : item.inMonth
                            ? 'text-slate-800 hover:bg-slate-200'
                            : 'text-slate-300'
                        }`}
                    >
                      {item.dayNumber}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FILTROS DE STATUS */}
            <div className="space-y-2 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Filtrar por Status
              </span>
              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterConfirmed}
                  onChange={(e) => setFilterConfirmed(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-bold text-slate-800 flex-1">Confirmados ({confirmedCount})</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterWaiting}
                  onChange={(e) => setFilterWaiting(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-bold text-slate-800 flex-1">Aguardando ({waitingCount})</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterEncaixe}
                  onChange={(e) => setFilterEncaixe(e.target.checked)}
                  className="rounded text-sky-500 focus:ring-sky-400 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span className="font-bold text-slate-800 flex-1">Encaixe Confirmado ({encaixeCount})</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterCanceled}
                  onChange={(e) => setFilterCanceled(e.target.checked)}
                  className="rounded text-rose-500 focus:ring-rose-400 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="font-bold text-slate-800 flex-1">Cancelados</span>
              </label>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  setFilterConfirmed(true);
                  setFilterWaiting(true);
                  setFilterEncaixe(true);
                  setFilterCanceled(false);
                  setSearchQuery('');
                }}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
              >
                Limpar Filtros
              </button>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          4. MODAL: NOVA CONSULTA
      ========================================================================= */}
      {showModalNewAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-teal-600" />
                Agendar Nova Consulta
              </h3>
              <button onClick={() => setShowModalNewAppt(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Paciente Cadastrado *</label>
                <select
                  required
                  value={selectedPatientId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedPatientId(id);
                    const p = patients.find((x) => x.id === id);
                    if (p) {
                      setNewApptName(p.name);
                      setNewApptPhone(p.phone);
                    } else {
                      setNewApptName('');
                      setNewApptPhone('');
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                >
                  <option value="">-- Selecione um Paciente Cadastrado --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.cpf ? `(CPF: ${applyCPFMask(p.cpf)})` : ''} — {formatPhoneBR(p.phone)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Data e Horário *</label>
                <input
                  type="datetime-local"
                  required
                  value={newApptTime}
                  onChange={(e) => setNewApptTime(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              {/* AVISO VISUAL DE ENCAIXE CASO O HORÁRIO JÁ ESTEJA OCUPADO */}
              {conflictingAppt && (
                <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 flex items-start gap-2.5 shadow-xs animate-in fade-in">
                  <div className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold shadow-xs">
                    ⚡
                  </div>
                  <div className="text-xs">
                    <p className="font-extrabold text-purple-950 flex items-center gap-1.5">
                      <span>Horário Ocupado • Agendamento como Encaixe</span>
                    </p>
                    <p className="mt-1 text-purple-800 leading-snug">
                      Já existe uma consulta neste horário para <strong>{conflictingAppt.patient?.name || 'outro paciente'}</strong> ({new Date(conflictingAppt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).
                    </p>
                    <p className="mt-1 text-[11px] text-purple-700 font-semibold">
                      Ao confirmar, esta consulta será registrada como <strong>ENCAIXE</strong> e destacada na cor roxa na agenda.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Procedimento / Observações</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Retorno cardiológico, check-up preventivo..."
                  value={newApptNotes}
                  onChange={(e) => setNewApptNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalNewAppt(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedPatientId}
                  className={`px-4 py-2 text-white rounded-xl font-bold shadow-xs disabled:opacity-40 transition flex items-center gap-1.5 ${
                    conflictingAppt
                      ? 'bg-purple-700 hover:bg-purple-800 shadow-purple-900/20'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {conflictingAppt ? (
                    <>
                      <span>⚡</span>
                      <span>Confirmar Encaixe</span>
                    </>
                  ) : (
                    'Confirmar Agendamento'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          5. MODAL: DETALHES / PRONTUÁRIO RÁPIDO
      ========================================================================= */}
      {selectedApptDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                Detalhes do Agendamento
              </h3>
              <button onClick={() => setSelectedApptDetails(null)} className="text-slate-400 hover:text-slate-700 font-bold p-1">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Paciente</span>
                <p className="font-bold text-slate-900 text-sm">{selectedApptDetails.patient?.name}</p>
                <p className="text-slate-600 font-mono">{formatPhoneBR(selectedApptDetails.patient?.phone)}</p>
                {selectedApptDetails.patient?.cpf && (
                  <p className="text-slate-500 font-mono text-[11px]">CPF: {applyCPFMask(selectedApptDetails.patient.cpf)}</p>
                )}
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Horário Marcado</span>
                <p className="font-bold text-slate-800">
                  {new Date(selectedApptDetails.startTime).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} às{' '}
                  {new Date(selectedApptDetails.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-slate-500">Status atual:</span>
                  {(selectedApptDetails.status === 'ENCAIXE' || (selectedApptDetails.notes && selectedApptDetails.notes.includes('ENCAIXE'))) ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 font-extrabold text-[11px] shadow-2xs flex items-center gap-1">
                      ⚡ Consulta de Encaixe
                    </span>
                  ) : (
                    <span className="font-bold text-slate-800">{getStatusLabel(selectedApptDetails.status)}</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Observações Cadastrais (Horários e Preferências)</span>
                <p className="text-slate-700 leading-relaxed font-medium">{selectedApptDetails.notes || 'Nenhuma anotação inserida.'}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(selectedApptDetails.startTime);
                    setRescheduleDate(d.toISOString().split('T')[0]);
                    setRescheduleTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    setShowModalReschedule(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                  <span>Remarcar Consulta</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleManualCancel(selectedApptDetails.id)}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Cancelar</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedApptDetails(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REMARCAR CONSULTA (COM DISPARO AUTOMÁTICO PARA A FILA DE ESPERA)
      ========================================================================= */}
      {showModalReschedule && selectedApptDetails && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-sky-600" />
                Remarcar Consulta
              </h3>
              <button onClick={() => setShowModalReschedule(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-sky-50 border border-sky-100 text-xs text-sky-950 space-y-1">
              <p className="font-bold">Paciente: {selectedApptDetails.patient?.name}</p>
              <p className="text-sky-800 font-medium">
                Ao remarcar, o horário antigo ({new Date(selectedApptDetails.startTime).toLocaleDateString('pt-BR')} às {new Date(selectedApptDetails.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) ficará vago e o <strong>1º paciente da Fila de Espera</strong> será contactado automaticamente pelo WhatsApp!
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleManualReschedule(selectedApptDetails.id, rescheduleDate, rescheduleTime);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-800 mb-1">Nova Data</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Novo Horário</label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-black text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalReschedule(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={rescheduling}
                  className="px-5 py-2 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl font-bold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {rescheduling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Remarcando e acionando fila...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Confirmar Remarcação</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: INSERIR PACIENTE NA FILA DE ESPERA
      ========================================================================= */}
      {showModalAddWaitlist && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#005a43]" />
                Adicionar Paciente à Fila de Espera
              </h3>
              <button onClick={() => setShowModalAddWaitlist(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddWaitlistEntry} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Nome Completo do Paciente <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newWaitName}
                  onChange={(e) => setNewWaitName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Celular / WhatsApp com DDD <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newWaitPhone}
                  onChange={(e) => setNewWaitPhone(e.target.value)}
                  placeholder="(11) 98888-7777"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Turno Preferido</label>
                  <select
                    value={newWaitShift}
                    onChange={(e: any) => setNewWaitShift(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white"
                  >
                    <option value="Qualquer Horário">Qualquer Horário</option>
                    <option value="Manhã">Manhã</option>
                    <option value="Tarde">Tarde</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Dias Preferidos</label>
                  <input
                    type="text"
                    value={newWaitDays}
                    onChange={(e) => setNewWaitDays(e.target.value)}
                    placeholder="Ex: Segundas/Quartas"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Observações da Fila</label>
                <textarea
                  rows={2}
                  value={newWaitNotes}
                  onChange={(e) => setNewWaitNotes(e.target.value)}
                  placeholder="Ex: Aguardando retorno com urgência; aceita qualquer horário pela tarde..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalAddWaitlist(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Salvar na Fila
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          6. MODAL: NOVO / EDITAR PACIENTE
      ========================================================================= */}
      {showModalPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Contact className="w-5 h-5 text-[#005a43]" />
                {editingPatient ? 'Editar Ficha do Paciente' : 'Novo Cadastro de Paciente'}
              </h3>
              <button
                onClick={() => setShowModalPatient(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
              {/* BLOCO 1: DADOS OBRIGATÓRIOS E PESSOAIS */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                  1. Identificação do Paciente
                </span>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={patName}
                    onChange={(e) => setPatName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Telefone (WhatsApp) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={patPhone}
                      onChange={(e) => setPatPhone(applyPhoneMask(e.target.value))}
                      placeholder="(11) 99999-9999"
                      maxLength={15}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Recebe confirmações e lembretes automáticos.
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Data de Nascimento 🎂
                    </label>
                    <input
                      type="date"
                      value={patBirthDate}
                      onChange={(e) => setPatBirthDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                    <span className="text-[10px] text-emerald-700 font-medium mt-0.5 block">
                      Usado para disparo de parabéns no WhatsApp.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      CPF <span className="text-slate-400 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={patCpf}
                      onChange={(e) => setPatCpf(applyCPFMask(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      E-mail <span className="text-slate-400 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="email"
                      value={patEmail}
                      onChange={(e) => setPatEmail(e.target.value)}
                      placeholder="paciente@email.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCO 2: ENDEREÇO COM CONSULTA AUTOMÁTICA DE CEP */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                    2. Endereço Residencial
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Busca Automática via CEP
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700">CEP</label>
                      {loadingCep && (
                        <span className="text-[10px] font-bold text-[#005a43] animate-pulse">
                          Buscando...
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={patCep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">Rua / Logradouro</label>
                    <input
                      type="text"
                      value={patStreet}
                      onChange={(e) => setPatStreet(e.target.value)}
                      placeholder="Ex: Av. Paulista ou Rua das Flores"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Número</label>
                    <input
                      type="text"
                      value={patNumber}
                      onChange={(e) => setPatNumber(e.target.value)}
                      placeholder="Ex: 120 ou S/N"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Bairro</label>
                    <input
                      type="text"
                      value={patNeighborhood}
                      onChange={(e) => setPatNeighborhood(e.target.value)}
                      placeholder="Ex: Jardins, Centro..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Cidade / UF</label>
                    <input
                      type="text"
                      value={patCity}
                      onChange={(e) => setPatCity(e.target.value)}
                      placeholder="Ex: São Paulo - SP"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCO 3: OBSERVAÇÕES */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Observações Clínicas / Preferências <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={patNotes}
                  onChange={(e) => setPatNotes(e.target.value)}
                  placeholder="Ex: Alergias, histórico familiar ou observações relevantes..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalPatient(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl font-bold shadow-md shadow-[#005a43]/20 transition active:scale-95 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Paciente</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          7. MODAL: NOVO / EDITAR USUÁRIO & CONTROLE DE PERMISSÕES
      ========================================================================= */}
      {showModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-5 my-auto max-h-[92vh] flex flex-col">
            {/* CABEÇALHO DO MODAL */}
            <div className="flex items-start justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-[#005a43] flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    {editingUser ? 'Editar Usuário e Permissões' : 'Cadastrar Novo Usuário'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Preencha os dados e defina o que o operador poderá fazer no aplicativo do médico
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModalUser(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* FORMULÁRIO COM SCROLL INTERNO */}
            <form onSubmit={handleSaveUser} className="space-y-5 overflow-y-auto flex-1 pr-1 text-xs">
              {/* BLOCO 1: DADOS PESSOAIS E PROFISSIONAIS */}
              <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                  1. Perfil e Identificação do Usuário
                </span>

                {/* SELETOR DE FUNÇÃO / PAPEL */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Função no Sistema <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUserRole('MEDICO');
                        if (!userSpecialty || userSpecialty.includes('Secretária')) setUserSpecialty('Pediatria');
                        if (!userCrm) setUserCrm('CRM/SP 148.910');
                        applyPermissionPreset('all');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${userRole === 'MEDICO'
                        ? 'bg-emerald-50 border-[#005a43] ring-2 ring-[#005a43]/20 text-[#005a43] shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <span>⭐</span>
                        <span>Médico(a) Titular</span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Dono da agenda no aplicativo
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUserRole('SECRETARIA');
                        if (userSpecialty === 'Pediatria') setUserSpecialty('Secretária Executiva');
                        applyPermissionPreset('secretary');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${userRole === 'SECRETARIA'
                        ? 'bg-emerald-50 border-[#005a43] ring-2 ring-[#005a43]/20 text-[#005a43] shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>📋</span>
                        <span>Secretária / Recepção</span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Operador de consultas
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUserRole('ADMIN');
                        applyPermissionPreset('all');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${userRole === 'ADMIN'
                        ? 'bg-emerald-50 border-[#005a43] ring-2 ring-[#005a43]/20 text-[#005a43] shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>🛡️</span>
                        <span>Administrador</span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Acesso irrestrito
                      </span>
                    </button>
                  </div>

                  {userRole === 'MEDICO' && (
                    <div className="mt-2.5 p-3 rounded-xl bg-emerald-100/70 border border-emerald-300 text-emerald-950 text-xs flex items-start gap-2.5">
                      <span className="text-base shrink-0">⭐</span>
                      <div>
                        <strong>Titular da Agenda:</strong> O sistema vai reconhecer de quem é a agenda a partir deste médico (Ex: <em>Marcação de consultas • {userName || 'Dra. Mariana'} ({userSpecialty || 'Pediatra'})</em>).
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={userName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={userRole === 'MEDICO' ? 'Ex: Dra. Mariana Souza' : 'Ex: Juliana Rocha Santos'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {userRole === 'MEDICO' ? 'Especialidade Médica *' : 'Especialidade / Função *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={userSpecialty}
                      onChange={(e) => setUserSpecialty(e.target.value)}
                      placeholder={userRole === 'MEDICO' ? 'Ex: Pediatria, Cardiologia...' : 'Ex: Secretária Executiva, Recepção...'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(userRole === 'MEDICO'
                        ? ['Pediatria', 'Cardiologia', 'Dermatologia', 'Ginecologia', 'Ortopedia', 'Clínica Geral']
                        : ['Secretária Executiva', 'Recepção', 'Atendimento', 'Gestão']
                      ).map((esp) => (
                        <button
                          key={esp}
                          type="button"
                          onClick={() => setUserSpecialty(esp)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-[#005a43] text-slate-600 transition"
                        >
                          {esp}
                        </button>
                      ))}
                    </div>
                  </div>

                  {userRole === 'MEDICO' ? (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        CRM / Registro Profissional <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={userCrm}
                        onChange={(e) => setUserCrm(e.target.value)}
                        placeholder="Ex: CRM/SP 148.910"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Exibido nos cabeçalhos e confirmações.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        CPF <span className="text-slate-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={userCpf}
                        onChange={(e) => setUserCpf(formatCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {userRole === 'MEDICO' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        CPF <span className="text-slate-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={userCpf}
                        onChange={(e) => setUserCpf(formatCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      E-mail <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder={userRole === 'MEDICO' ? 'dra.mariana@consultorio.med.br' : 'usuario@consultorio.med.br'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Celular / WhatsApp <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={userPhone}
                      onChange={(e) => setUserPhone(formatPhone(e.target.value))}
                      placeholder="(11) 98888-8888"
                      maxLength={15}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCO 2: CREDENCIAIS DE ACESSO (LOGIN GERADO AUTOMATICAMENTE E SENHA) */}
              <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                  2. Acesso ao Sistema
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* CAMPO LOGIN */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700">
                        Login (Nome + iniciais sobrenome) <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleRegenerateLogin}
                        className="text-[10px] font-bold text-[#005a43] hover:underline flex items-center gap-1"
                        title="Recalcular login a partir do nome"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Gerar</span>
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold">@</span>
                      <input
                        type="text"
                        required
                        value={userLogin}
                        onChange={(e) => {
                          setUserLogin(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                          setIsAutoLogin(false);
                        }}
                        placeholder="login_unico"
                        className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-slate-200 font-mono font-bold text-xs bg-white text-[#005a43] focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Gerado automaticamente com nome e iniciais do sobrenome (único).
                    </p>
                  </div>

                  {/* CAMPO SENHA */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700">
                        Senha <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        className="text-[10px] font-bold text-teal-700 hover:underline flex items-center gap-1"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Gerar Senha</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Senha provisória de acesso ao aplicativo.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="font-bold text-slate-700 text-xs">Status da Conta:</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUserStatus('ACTIVE')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition ${userStatus === 'ACTIVE'
                        ? 'bg-emerald-100 text-[#005a43] border border-emerald-300'
                        : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                    >
                      ✓ Ativo
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserStatus('INACTIVE')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition ${userStatus === 'INACTIVE'
                        ? 'bg-slate-200 text-slate-800 border border-slate-300'
                        : 'bg-white border border-slate-200 text-slate-500'
                        }`}
                    >
                      Inativo
                    </button>
                  </div>
                </div>
              </div>

              {/* BLOCO 3: PERMISSÕES DE ACESSO (AS 9 OPÇÕES) */}
              <div className="space-y-3 p-4 rounded-2xl bg-gradient-to-br from-emerald-50/40 via-teal-50/20 to-slate-50 border border-emerald-100">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-emerald-200/60">
                  <div>
                    <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                      3. Permissões de Acesso no Perfil
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Escolha exatamente o que este usuário poderá fazer no aplicativo:
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#005a43] bg-emerald-100 px-2 py-0.5 rounded-md">
                    {userPermissions.length} de 9 selecionadas
                  </span>
                </div>

                {/* BOTÕES DE PRESETS RÁPIDOS */}
                <div className="flex flex-wrap items-center gap-1.5 pb-2">
                  <span className="text-[10px] font-bold text-slate-400">Atalhos rápidos:</span>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('secretary')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 text-[#005a43] transition"
                  >
                    ⚡ Perfil Secretária (Recepção)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('all')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition"
                  >
                    👑 Acesso Total
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('view_only')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition"
                  >
                    👁️ Somente Consulta
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('none')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-500 transition"
                  >
                    🧹 Limpar
                  </button>
                </div>

                {/* GRID COM AS 9 OPÇÕES */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {USER_PERMISSIONS.map((perm) => {
                    const isChecked = userPermissions.includes(perm.id);
                    return (
                      <div
                        key={perm.id}
                        onClick={() => togglePermission(perm.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition select-none flex items-start gap-2.5 ${isChecked
                          ? 'bg-white border-[#005a43] shadow-xs'
                          : 'bg-white/60 border-slate-200 hover:border-slate-300 opacity-80'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => { }}
                          className="mt-0.5 w-4 h-4 rounded text-[#005a43] focus:ring-[#005a43] border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={`font-bold text-xs block ${isChecked ? 'text-slate-900' : 'text-slate-700'
                              }`}
                          >
                            {perm.label}
                          </span>
                          <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
                            {perm.description}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalUser(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl font-bold shadow-md shadow-[#005a43]/15 transition active:scale-95 text-xs flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Usuário & Permissões</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
