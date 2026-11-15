import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  HeartPulse,
  Home,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  Pill,
  LockKeyhole,
  Copy,
  Stethoscope,
  LoaderCircle,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  addCalendarDays,
  buildDoseSchedule,
  formatDate,
  formatTime,
  localDateTime,
  safeError,
  today,
  isStrongPassword,
} from './utils';
import './style.css';

function AuthScreen() {
  const [mode, setMode] = useState('signin'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'signup' && !isStrongPassword(password)) {
      setNotice('Use at least 12 characters with uppercase, lowercase, a number and a symbol.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        setNotice(
          data.session
            ? 'Account created.'
            : 'Account created. Check your email to confirm your address, then sign in.',
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) {
      setNotice(safeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="authwrap" role="main">
      <div className="authcard">
        <div className="brand authbrand">
          <span>
            <HeartPulse />
          </span>
          <div>
            <b>everkind</b>
            <small>CARE, CONNECTED.</small>
          </div>
        </div>
        <p className="eyebrow">A SHARED SPACE FOR BETTER CARE</p>
        <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p>Securely coordinate care routines with the people you trust.</p>
        <form onSubmit={submit}>
          <label htmlFor="auth-email">Email address</label>
          <input
            id="auth-email"
            name="email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            name="password"
            required
            minLength={mode === 'signin' ? 8 : 12}
            pattern={
              mode === 'signin'
                ? undefined
                : '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,}'
            }
            title={
              mode === 'signin'
                ? undefined
                : 'Use 12+ characters with uppercase, lowercase, a number and a symbol.'
            }
            aria-describedby={mode === 'signin' ? undefined : 'password-help'}
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === 'signin' ? 'Your password' : '12+ characters, mixed case, number and symbol'
            }
          />
          {mode === 'signup' && (
            <small id="password-help" className="password-help">
              12+ characters, uppercase and lowercase letters, a number and a symbol.
            </small>
          )}
          <button type="submit" className="primary full" disabled={busy} aria-busy={busy}>
            {busy ? <LoaderCircle className="spin" /> : null}
            {mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={15} />
          </button>
        </form>
        {notice && (
          <div className="authnotice" role="status" aria-live="polite">
            {notice}
          </div>
        )}
        <button
          type="button"
          className="authswitch"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setNotice('');
          }}
        >
          {mode === 'signin'
            ? 'New to Everkind? Create an account'
            : 'Already have an account? Sign in'}
        </button>
        <small className="authlegal">
          Your care data is private to your authorized care circle. Everkind is not a medical device
          and does not provide medical advice.
        </small>
      </div>
    </div>
  );
}

function Onboarding({ user, onCreated, onJoin }) {
  const [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const { data, error } = await supabase
        .from('care_profiles')
        .insert({ owner_id: user.id, display_name: name.trim(), timezone: 'Asia/Kolkata' })
        .select()
        .single();
      if (error) throw error;
      onCreated(data);
    } catch (e) {
      setNotice(safeError(e));
    } finally {
      setBusy(false);
    }
  };
  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const { data, error } = await supabase.functions.invoke('redeem-invite', {
        body: { code: code.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await onJoin();
    } catch (e) {
      setNotice(safeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="authwrap" role="main">
      <div className="authcard onboarding">
        <div className="brand authbrand">
          <span>
            <HeartPulse />
          </span>
          <div>
            <b>everkind</b>
            <small>CARE, CONNECTED.</small>
          </div>
        </div>
        <p className="eyebrow">LET'S SET UP YOUR CARE SPACE</p>
        <h1>Care works better together.</h1>
        <p>
          Create a care profile for yourself or someone you support. The care recipient remains
          central to every decision.
        </p>
        <form onSubmit={create}>
          <label htmlFor="care-recipient-name">Care recipient's name</label>
          <input
            id="care-recipient-name"
            name="display_name"
            required
            maxLength="100"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lakshmi"
          />
          <button type="submit" className="primary full" disabled={busy} aria-busy={busy}>
            Create care profile <ArrowRight size={15} />
          </button>
        </form>
        <div className="orline">
          <span />
          OR JOIN AN EXISTING CIRCLE
          <span />
        </div>
        <form onSubmit={join}>
          <label htmlFor="invite-code">Invitation code</label>
          <input
            id="invite-code"
            name="invite_code"
            required
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="EVER-XXXXXXXXXXXX"
          />
          <button type="submit" className="outline full" disabled={busy} aria-busy={busy}>
            Join care circle
          </button>
        </form>
        {notice && (
          <div className="authnotice" role="alert" aria-live="assertive">
            {notice}
          </div>
        )}
        <small className="authlegal">
          Only use an invitation code shared directly by a person you trust.
        </small>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null),
    [authLoading, setAuthLoading] = useState(true),
    [profiles, setProfiles] = useState([]),
    [selectedProfile, setSelectedProfile] = useState(null),
    [role, setRole] = useState(''),
    [members, setMembers] = useState([]),
    [meds, setMeds] = useState([]),
    [doses, setDoses] = useState([]),
    [appts, setAppts] = useState([]),
    [logs, setLogs] = useState([]),
    [prefs, setPrefs] = useState(null);
  const [tab, setTab] = useState('Overview'),
    [modal, setModal] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [invite, setInvite] = useState(null),
    [inviteForm, setInviteForm] = useState({ email: '', role: 'family' });
  const profile =
    profiles.find((item) => item.id === selectedProfile?.id) ||
    selectedProfile ||
    profiles[0] ||
    null;
  const [medForm, setMedForm] = useState({
    name: '',
    dose: '',
    time: '08:00',
    frequency: 'Daily',
    instructions: '',
  });
  const [visitForm, setVisitForm] = useState({
    clinician_name: '',
    specialty: '',
    date: today(),
    time: '10:00',
    location: '',
    notes: '',
  });
  const modalRef = useRef(null);
  const medicationIds = useRef(new Set());
  useEffect(() => {
    medicationIds.current = new Set(meds.map((medication) => medication.id));
  }, [meds]);
  const toastTimer = useRef(null);
  const toast = useCallback((msg) => {
    setNotice(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setNotice(''), 5000);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const root = modalRef.current;
    const focusable = () =>
      root?.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      ) || [];
    (
      root?.querySelector(
        'input:not([disabled]),select:not([disabled]),textarea:not([disabled])',
      ) || focusable()[0]
    )?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModal('');
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...focusable()];
      if (!items.length) {
        e.preventDefault();
        root?.focus();
        return;
      }
      const start = items[0],
        end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, []);
  const loadProfiles = useCallback(async () => {
    if (!session?.user) return;
    const { data, error } = await supabase
      .from('care_profiles')
      .select('id,display_name,timezone,created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    setProfiles(data || []);
  }, [session]);
  const loadWorkspace = useCallback(
    async (p) => {
      if (!p || !session?.user) return;
      const zone = p.timezone || 'Asia/Kolkata';
      const start = localDateTime(today(zone), '00:00', zone);
      const end = localDateTime(addCalendarDays(today(zone), 2), '23:59', zone);
      const [
        { data: m, error: me },
        { data: a, error: ae },
        { data: mem, error: meme },
        { data: pr, error: pe },
        { data: ev, error: ee },
        { data: d, error: de },
        { data: membership, error: roleError },
      ] = await Promise.all([
        supabase
          .from('medications')
          .select('*')
          .eq('profile_id', p.id)
          .eq('active', true)
          .order('created_at'),
        supabase.from('appointments').select('*').eq('profile_id', p.id).order('starts_at'),
        supabase
          .from('care_members')
          .select('id,user_id,role,status,created_at')
          .eq('profile_id', p.id)
          .eq('status', 'active'),
        supabase.from('notification_preferences').select('*').eq('profile_id', p.id).maybeSingle(),
        supabase
          .from('audit_events')
          .select('*')
          .eq('profile_id', p.id)
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('medication_doses')
          .select('*,medications!inner(id,name,dose,profile_id,instructions,schedule)')
          .eq('medications.profile_id', p.id)
          .gte('due_at', start)
          .lte('due_at', end)
          .order('due_at'),
        supabase
          .from('care_members')
          .select('role')
          .eq('profile_id', p.id)
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);
      if (me) throw me;
      if (ae) throw ae;
      if (meme) throw meme;
      if (pe) throw pe;
      if (ee) throw ee;
      if (de) throw de;
      if (roleError) throw roleError;
      setMeds(m || []);
      setAppts(a || []);
      setMembers(mem || []);
      setPrefs(pr);
      setLogs(ev || []);
      setDoses(d || []);
      setRole(membership?.role || 'family');
    },
    [session],
  );
  useEffect(() => {
    if (!session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote data synchronization
    loadProfiles().catch((e) => toast(safeError(e)));
  }, [session, loadProfiles, toast]);
  useEffect(() => {
    if (profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote data synchronization
      loadWorkspace(profile).catch((e) => toast(safeError(e)));
    }
  }, [profile, loadWorkspace, toast]);
  useEffect(() => {
    if (!profile) return;
    let refreshTimer;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => loadWorkspace(profile), 180);
    };
    const relevantDose = (payload) => {
      const id = payload.new?.medication_id || payload.old?.medication_id;
      return medicationIds.current.has(id);
    };
    const channel = supabase
      .channel('care-' + profile.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'medications',
          filter: 'profile_id=eq.' + profile.id,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: 'profile_id=eq.' + profile.id,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'care_members',
          filter: 'profile_id=eq.' + profile.id,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'medication_doses' },
        (payload) => {
          if (relevantDose(payload)) refresh();
        },
      )
      .subscribe();
    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [profile, loadWorkspace]);
  const logout = async () => {
    await supabase.auth.signOut();
    setProfiles([]);
    setSelectedProfile(null);
    setMeds([]);
    setDoses([]);
  };
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(safeError(e));
    } finally {
      setBusy(false);
    }
  };
  const addMedication = async (e) => {
    e.preventDefault();
    await run(async () => {
      const { data: med, error } = await supabase
        .from('medications')
        .insert({
          profile_id: profile.id,
          name: medForm.name.trim(),
          dose: medForm.dose.trim(),
          instructions: medForm.instructions || null,
          schedule: { frequency: medForm.frequency, times: [medForm.time] },
          created_by: session.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      const rows = buildDoseSchedule(
        med.id,
        medForm.time,
        medForm.frequency,
        new Date(),
        profile.timezone || 'Asia/Kolkata',
      );
      const { error: de } = await supabase.from('medication_doses').insert(rows);
      if (de) throw de;
      setModal('');
      setMedForm({ name: '', dose: '', time: '08:00', frequency: 'Daily', instructions: '' });
      await loadWorkspace(profile);
      toast('Medication schedule saved');
    });
  };
  const markDose = async (dose) =>
    run(async () => {
      const { error } = await supabase
        .from('medication_doses')
        .update({
          status: 'taken',
          taken_at: new Date().toISOString(),
          recorded_by: session.user.id,
        })
        .eq('id', dose.id);
      if (error) throw error;
      await loadWorkspace(profile);
      toast('Dose recorded');
    });
  const addAppointment = async (e) => {
    e.preventDefault();
    await run(async () => {
      const { error } = await supabase.from('appointments').insert({
        profile_id: profile.id,
        clinician_name: visitForm.clinician_name.trim(),
        specialty: visitForm.specialty || null,
        starts_at: localDateTime(
          visitForm.date,
          visitForm.time,
          profile.timezone || 'Asia/Kolkata',
        ),
        location: visitForm.location || null,
        notes: visitForm.notes || null,
        created_by: session.user.id,
      });
      if (error) throw error;
      setModal('');
      await loadWorkspace(profile);
      toast('Appointment saved');
    });
  };
  const createInvite = async (e) => {
    e.preventDefault();
    await run(async () => {
      const { data, error } = await supabase.functions.invoke('create-invite', {
        body: { profile_id: profile.id, email: inviteForm.email || null, role: inviteForm.role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInvite(data);
      toast('Invitation created. Share it securely.');
    });
  };
  const savePrefs = async (e) => {
    e.preventDefault();
    await run(async () => {
      const { error } = await supabase
        .from('notification_preferences')
        .update({
          email_enabled: prefs.email_enabled,
          dose_lead_minutes: Number(prefs.dose_lead_minutes),
          appointment_lead_hours: Number(prefs.appointment_lead_hours),
          missed_dose_delay_minutes: Number(prefs.missed_dose_delay_minutes),
        })
        .eq('profile_id', profile.id);
      if (error) throw error;
      setModal('');
      toast('Reminder preferences saved');
    });
  };
  const todayDoses = doses.filter(
      (d) =>
        today(profile?.timezone || 'Asia/Kolkata', new Date(d.due_at)) ===
        today(profile?.timezone || 'Asia/Kolkata'),
    ),
    taken = todayDoses.filter((d) => d.status === 'taken').length,
    pending = todayDoses.filter((d) => d.status === 'pending');
  const upcoming = appts
    .filter((a) => a.status === 'scheduled' && new Date(a.starts_at) >= new Date())
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const pct = todayDoses.length ? Math.round((taken / todayDoses.length) * 100) : 0;
  if (!isSupabaseConfigured)
    return (
      <div className="authwrap" role="main">
        <div className="authcard">
          <div className="brand authbrand">
            <span>
              <HeartPulse />
            </span>
            <div>
              <b>everkind</b>
              <small>CARE, CONNECTED.</small>
            </div>
          </div>
          <h1>Cloud workspace not configured</h1>
          <p>
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment, then
            rebuild.
          </p>
        </div>
      </div>
    );
  if (authLoading)
    return (
      <div className="loading" role="status" aria-live="polite">
        <LoaderCircle className="spin" aria-hidden="true" /> Loading secure workspace…
      </div>
    );
  if (!session) return <AuthScreen />;
  if (!profile)
    return (
      <Onboarding
        user={session.user}
        onCreated={async (p) => {
          await loadProfiles();
          setSelectedProfile(p);
        }}
        onJoin={loadProfiles}
      />
    );
  const nav = [
    ['Overview', Home],
    ['Medications', Pill],
    ['Appointments', CalendarDays],
    ['Care circle', Users],
  ];
  const isManager = ['owner', 'care_recipient', 'caregiver'].includes(role);
  const copyInvite = async () => {
    if (!invite?.code) return;
    await navigator.clipboard.writeText(invite.code);
    toast('Invitation code copied');
  };
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="side" aria-label="Care workspace sidebar">
        <div className="brand">
          <span>
            <HeartPulse />
          </span>
          <div>
            <b>everkind</b>
            <small>CARE, CONNECTED.</small>
          </div>
        </div>
        <div className="profile">
          <i>{profile.display_name[0]?.toUpperCase()}</i>
          <span>
            <b>{profile.display_name}</b>
            <small>Care profile · {role.replace('_', ' ')}</small>
          </span>
        </div>
        <span className="navlabel">WORKSPACE</span>
        <nav className="workspace-nav" aria-label="Primary navigation">
          {nav.map(([n, I]) => (
            <button
              type="button"
              key={n}
              className={'nav ' + (tab === n ? 'selected' : '')}
              aria-current={tab === n ? 'page' : undefined}
              onClick={() => setTab(n)}
            >
              <I size={18} aria-hidden="true" />
              <span>{n}</span>
              {n === 'Medications' && (
                <em aria-label={pending.length + ' pending doses'}>{pending.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidefoot">
          <div className="invite-mini">
            <HeartPulse size={17} />
            <b>Care is a team effort.</b>
            <p>Invite someone you trust to stay in the loop.</p>
            <button
              type="button"
              onClick={() => {
                setInvite(null);
                setModal('invite');
              }}
            >
              Invite a member <ArrowRight size={14} />
            </button>
          </div>
          <button type="button" className="nav" onClick={() => setModal('settings')}>
            <Settings size={18} /> Reminder settings
          </button>
          <button type="button" className="nav" onClick={logout}>
            <LogOut size={18} /> Sign out
          </button>
          <div className="user">
            <i>{session.user.email?.[0]?.toUpperCase()}</i>
            <span>
              <b>{session.user.email}</b>
              <small>Signed in securely</small>
            </span>
          </div>
        </div>
      </aside>
      <main id="main-content" tabIndex="-1">
        <header>
          <div className="crumb">
            Care workspace <ChevronRight size={14} />
            <b>{tab}</b>
          </div>
          <div className="headright">
            <span>
              <CalendarDays size={15} />{' '}
              {formatDate(today(), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              type="button"
              className="bell"
              aria-label="Open reminder settings"
              onClick={() => setModal('settings')}
            >
              <Bell size={18} aria-hidden="true" />
            </button>
            <button type="button" className="signout" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <article aria-label={tab + ' content'}>
          {tab === 'Overview' && (
            <>
              <div className="intro">
                <div>
                  <p className="eyebrow">
                    <i /> YOUR FAMILY CARE, AT A GLANCE
                  </p>
                  <h1>Care, connected.</h1>
                  <p>A live view of {profile.display_name}'s routines and upcoming care.</p>
                </div>
                {isManager && (
                  <button type="button" className="primary" onClick={() => setModal('med')}>
                    <Plus size={17} /> Add medication
                  </button>
                )}
              </div>
              <section className="hero">
                <div>
                  <span className="hero-kicker">✧ &nbsp; YOUR CARE, IN SYNC</span>
                  <h2>
                    A little care goes
                    <br />a long way.
                  </h2>
                  <p>
                    Every dose, every visit, every check-in —<br />
                    the people who care are right here.
                  </p>
                  <button onClick={() => setTab('Care circle')}>
                    Meet your care circle <ArrowRight size={15} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orb" />
                  <div className="heart-art">
                    <HeartPulse size={48} />
                  </div>
                  <div className="leaf" />
                </div>
                <small>♥ &nbsp; Care that connects</small>
              </section>
              <div className="sectiontitle">
                <div>
                  <h2>Today's overview</h2>
                  <p>Live records from your care circle.</p>
                </div>
                <small>
                  {formatDate(today(), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  }).toUpperCase()}
                </small>
              </div>
              <div className="stats">
                <div className="stat">
                  <span className="stat-label">Medication adherence</span>
                  <strong>
                    {pct}
                    <small>%</small>
                  </strong>
                  <div
                    className="bar"
                    role="meter"
                    aria-label="Medication adherence today"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={pct}
                    aria-valuetext={pct + '% of scheduled doses recorded as taken'}
                  >
                    <i style={{ width: pct + '%' }} />
                  </div>
                  <footer>
                    {taken} of {todayDoses.length} doses <span>today</span>
                  </footer>
                </div>
                <div className="stat">
                  <span className="stat-label">Doses remaining</span>
                  <strong>
                    {pending.length}
                    <small> doses</small>
                  </strong>
                  <footer>
                    {pending.length
                      ? 'Next: ' + formatTime(pending[0]?.due_at)
                      : 'No pending doses'}
                    <span>Today</span>
                  </footer>
                </div>
                <div className="stat">
                  <span className="stat-label">Next appointment</span>
                  <strong className="date">
                    {upcoming[0] ? formatDate(upcoming[0].starts_at) : '—'}
                  </strong>
                  <footer>
                    {upcoming[0]?.clinician_name || 'No appointments'}
                    <span>{upcoming[0] ? formatTime(upcoming[0].starts_at) : ''}</span>
                  </footer>
                </div>
                <div className="stat">
                  <span className="stat-label">Care circle</span>
                  <strong>
                    {members.length}
                    <small> members</small>
                  </strong>
                  <footer>
                    Authorized members<span className="good">● Active</span>
                  </footer>
                </div>
              </div>
              <div className="columns">
                <section className="panel">
                  <div className="panelhead">
                    <div>
                      <h2>Medication schedule</h2>
                      <p>Record today's doses as they are completed.</p>
                    </div>
                    <button type="button" className="link" onClick={() => setTab('Medications')}>
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  {todayDoses.map((d) => (
                    <div className="medrow" key={d.id}>
                      <div className="time">
                        <b>{formatTime(d.due_at)}</b>
                        <small>{d.status}</small>
                      </div>
                      <div className="pill">
                        <Pill size={18} />
                      </div>
                      <div className="medinfo">
                        <b>{d.medications?.name}</b>
                        <small>{d.medications?.dose}</small>
                      </div>
                      {d.status === 'pending' && (
                        <button
                          type="button"
                          className="dose"
                          aria-label={'Mark taken: ' + (d.medications?.name || 'medication')}
                          onClick={() => markDose(d)}
                        >
                          Mark taken
                        </button>
                      )}
                      {d.status === 'taken' && (
                        <span className="dose isdone">
                          <Check size={14} /> Taken
                        </span>
                      )}
                    </div>
                  ))}
                  {!todayDoses.length && (
                    <div className="empty">
                      No doses scheduled for today. Add a medication to create a schedule.
                    </div>
                  )}
                  <div className="safetyline">
                    <ShieldCheck size={15} /> Only authorized care-circle members can access these
                    records.
                  </div>
                </section>
                <section className="panel">
                  <div className="panelhead">
                    <div>
                      <h2>Coming up</h2>
                      <p>Appointments worth remembering.</p>
                    </div>
                    <button
                      type="button"
                      className="round"
                      aria-label="View appointments"
                      onClick={() => setTab('Appointments')}
                    >
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                  {upcoming.slice(0, 3).map((a) => (
                    <div className="visitrow" key={a.id}>
                      <div className="visitdate">
                        <b>{formatDate(a.starts_at, { day: '2-digit' })}</b>
                        <small>{formatDate(a.starts_at, { month: 'short' }).toUpperCase()}</small>
                      </div>
                      <div>
                        <b>{a.clinician_name}</b>
                        <small>{a.specialty}</small>
                        <small>
                          ◷ {formatTime(a.starts_at)} · {a.location || 'Location not added'}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!upcoming.length && <div className="empty">No upcoming appointments.</div>}
                  {isManager && (
                    <button
                      type="button"
                      className="outline full"
                      onClick={() => setModal('appointment')}
                    >
                      <Plus size={15} /> Add appointment
                    </button>
                  )}
                  <div className="reminder">
                    <Bell size={15} />
                    <span>
                      <b>Email reminders {prefs?.email_enabled ? 'enabled' : 'disabled'}</b>
                      <small>Preferences are stored with this care profile.</small>
                    </span>
                    <strong>{prefs?.email_enabled ? 'ON' : 'OFF'}</strong>
                  </div>
                </section>
              </div>
              <section className="panel activity">
                <div className="panelhead">
                  <div>
                    <h2>Care activity</h2>
                    <p>Recent changes in this care profile.</p>
                  </div>
                  <small>LIVE AUDIT</small>
                </div>
                {logs.slice(0, 5).map((x) => (
                  <div className="activityrow" key={x.id}>
                    <span>
                      <Activity />
                    </span>
                    <div>
                      <b>{x.action.replaceAll('_', ' ')}</b>
                      <small>{x.entity_type}</small>
                    </div>
                    <time>
                      {formatDate(x.created_at)} · {formatTime(x.created_at)}
                    </time>
                  </div>
                ))}
                {!logs.length && (
                  <div className="empty">
                    Activity will appear here as the care plan is updated.
                  </div>
                )}
              </section>
            </>
          )}
          {tab === 'Medications' && (
            <>
              <div className="intro">
                <div>
                  <p className="eyebrow">CARE PLAN / MEDICATIONS</p>
                  <h1>Medication routine</h1>
                  <p>Schedules and adherence records shared securely.</p>
                </div>
                {isManager && (
                  <button type="button" className="primary" onClick={() => setModal('med')}>
                    <Plus size={17} /> Add medication
                  </button>
                )}
              </div>
              <div className="stats three">
                <div className="stat">
                  <span className="stat-label">Active medicines</span>
                  <strong>{meds.length}</strong>
                </div>
                <div className="stat">
                  <span className="stat-label">Today's adherence</span>
                  <strong>{pct}%</strong>
                </div>
                <div className="stat">
                  <span className="stat-label">Upcoming doses</span>
                  <strong>{doses.filter((d) => d.status === 'pending').length}</strong>
                </div>
              </div>
              <section className="panel">
                <div className="panelhead">
                  <div>
                    <h2>All medications</h2>
                    <p>Search the current care plan.</p>
                  </div>
                  <label className="search">
                    <Search size={15} aria-hidden="true" />
                    <span className="sr-only">Search medications</span>
                    <input
                      type="search"
                      name="medication-search"
                      aria-label="Search medications"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search medicines"
                    />
                  </label>
                </div>
                {meds
                  .filter((m) => (m.name + m.dose).toLowerCase().includes(search.toLowerCase()))
                  .map((m) => (
                    <div className="medrow" key={m.id}>
                      <div className="pill">
                        <Pill size={18} />
                      </div>
                      <div className="medinfo">
                        <b>{m.name}</b>
                        <small>
                          {m.dose} · {m.schedule?.frequency || 'Schedule not specified'}
                        </small>
                        <small>
                          {(m.schedule?.times || []).join(', ')}
                          {m.instructions ? ' · ' + m.instructions : ''}
                        </small>
                      </div>
                      <span className="tag">ACTIVE</span>
                    </div>
                  ))}
                {!meds.length && <div className="empty">No medications have been added.</div>}
              </section>
              <div className="notice">
                <ShieldCheck />
                <div>
                  <b>Medication safety</b>
                  <p>
                    Everkind organizes routines; it does not prescribe, change dosages or replace
                    advice from a licensed clinician. Verify every regimen with the care team.
                  </p>
                </div>
              </div>
            </>
          )}
          {tab === 'Appointments' && (
            <>
              <div className="intro">
                <div>
                  <p className="eyebrow">CARE PLAN / VISITS</p>
                  <h1>Appointments</h1>
                  <p>Shared appointments and visit details.</p>
                </div>
                {isManager && (
                  <button type="button" className="primary" onClick={() => setModal('appointment')}>
                    <Plus size={17} /> Add appointment
                  </button>
                )}
              </div>
              <div className="visitgrid">
                {appts.map((a) => (
                  <section className="panel visitcard" key={a.id}>
                    <span className="tag">{a.status.toUpperCase()}</span>
                    <div className="datebig">
                      {formatDate(a.starts_at, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <h2>{a.clinician_name}</h2>
                    <p>{a.specialty}</p>
                    <div>
                      <Clock /> {formatTime(a.starts_at)}
                    </div>
                    <div>
                      <Stethoscope /> {a.location || 'Location not added'}
                    </div>
                    <aside>{a.notes}</aside>
                  </section>
                ))}
              </div>
              {!appts.length && (
                <div className="empty">
                  No appointments yet. Add the next visit to keep everyone informed.
                </div>
              )}
            </>
          )}
          {tab === 'Care circle' && (
            <>
              <div className="intro">
                <div>
                  <p className="eyebrow">PEOPLE WHO CARE</p>
                  <h1>Your care circle</h1>
                  <p>Trusted people, with role-based access to {profile.display_name}'s care.</p>
                </div>
                {isManager && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setInvite(null);
                      setModal('invite');
                    }}
                  >
                    <Plus size={17} /> Invite member
                  </button>
                )}
              </div>
              <section className="panel">
                <div className="panelhead">
                  <div>
                    <h2>Connected members</h2>
                    <p>Access is permission-based and revocable by a care administrator.</p>
                  </div>
                  <span className="tag">{members.length} MEMBERS</span>
                </div>
                {members.map((m) => (
                  <div className="member" key={m.id}>
                    <i className="face">{m.role[0].toUpperCase()}</i>
                    <div>
                      <b>{m.user_id === session.user.id ? 'You' : m.user_id.slice(0, 8) + '…'}</b>
                      <small>
                        {m.role.replaceAll('_', ' ')} · {m.status}
                      </small>
                    </div>
                    <label>{m.role.toUpperCase()}</label>
                    {isManager && m.role !== 'owner' && m.user_id !== session.user.id && (
                      <button
                        type="button"
                        className="revoke"
                        onClick={() =>
                          run(async () => {
                            const { data, error } = await supabase.functions.invoke(
                              'revoke-member',
                              { body: { member_id: m.id } },
                            );
                            if (error) throw error;
                            if (data?.error) throw new Error(data.error);
                            await loadWorkspace(profile);
                            toast('Care access revoked');
                          })
                        }
                      >
                        Revoke access
                      </button>
                    )}
                  </div>
                ))}
              </section>
              <div className="invitebox">
                <div className="lock">
                  <LockKeyhole />
                </div>
                <div>
                  <h2>Invite someone you trust</h2>
                  <p>
                    Generate an expiring, one-time invitation. You control who joins the care
                    circle.
                  </p>
                </div>
                {isManager && (
                  <button
                    type="button"
                    className="outline"
                    onClick={() => {
                      setInvite(null);
                      setModal('invite');
                    }}
                  >
                    Create invitation <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <div className="notice">
                <ShieldCheck />
                <div>
                  <b>Your care, your choice</b>
                  <p>
                    Care recipients remain central to decisions. Share only what is needed and
                    review access regularly.
                  </p>
                </div>
              </div>
            </>
          )}
        </article>
        <footer>
          everkind · Care, connected. <span>Designed with dignity, for every generation.</span>
          <button type="button" onClick={() => setModal('safety')}>
            Safety & privacy
          </button>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status" aria-live="polite" aria-atomic="true">
          <CheckCircle2 size={17} aria-hidden="true" />
          {notice}
        </div>
      )}
      {modal && (
        <div className="shade">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex="-1"
            ref={modalRef}
          >
            <div className="modalhead">
              <div>
                <p className="eyebrow">EVERKIND CARE WORKSPACE</p>
                <h2 id="modal-title">
                  {modal === 'med'
                    ? 'Add medication'
                    : modal === 'appointment'
                      ? 'Add appointment'
                      : modal === 'invite'
                        ? 'Invite to care circle'
                        : modal === 'settings'
                          ? 'Reminder preferences'
                          : 'Care & privacy'}
                </h2>
              </div>
              <button
                type="button"
                className="round"
                aria-label="Close dialog"
                onClick={() => setModal('')}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {modal === 'med' && (
              <form onSubmit={addMedication}>
                <label>
                  Medication name
                  <input
                    required
                    maxLength="120"
                    value={medForm.name}
                    onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                    placeholder="Medication name"
                  />
                </label>
                <div className="formtwo">
                  <label>
                    Dosage
                    <input
                      required
                      value={medForm.dose}
                      onChange={(e) => setMedForm({ ...medForm, dose: e.target.value })}
                      placeholder="As prescribed"
                    />
                  </label>
                  <label>
                    First dose time
                    <input
                      required
                      type="time"
                      value={medForm.time}
                      onChange={(e) => setMedForm({ ...medForm, time: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Frequency
                  <select
                    value={medForm.frequency}
                    onChange={(e) => setMedForm({ ...medForm, frequency: e.target.value })}
                  >
                    <option>Daily</option>
                    <option>Weekly</option>
                  </select>
                </label>
                <label>
                  Instructions
                  <input
                    value={medForm.instructions}
                    onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })}
                    placeholder="Optional instructions from clinician"
                  />
                </label>
                <p className="formnote">
                  <ShieldCheck /> Adds the selected time for the next 14 days. Confirm the schedule
                  with the clinician.
                </p>
                <button type="submit" className="primary full" disabled={busy} aria-busy={busy}>
                  {busy ? 'Saving…' : 'Save medication'} <ArrowRight size={15} />
                </button>
              </form>
            )}
            {modal === 'appointment' && (
              <form onSubmit={addAppointment}>
                <label>
                  Doctor's name
                  <input
                    required
                    value={visitForm.clinician_name}
                    onChange={(e) => setVisitForm({ ...visitForm, clinician_name: e.target.value })}
                    placeholder="Doctor's name"
                  />
                </label>
                <label>
                  Specialty
                  <input
                    value={visitForm.specialty}
                    onChange={(e) => setVisitForm({ ...visitForm, specialty: e.target.value })}
                    placeholder="Specialty"
                  />
                </label>
                <div className="formtwo">
                  <label>
                    Date
                    <input
                      required
                      type="date"
                      min={today(profile?.timezone || 'Asia/Kolkata')}
                      value={visitForm.date}
                      onChange={(e) => setVisitForm({ ...visitForm, date: e.target.value })}
                    />
                  </label>
                  <label>
                    Time
                    <input
                      required
                      type="time"
                      value={visitForm.time}
                      onChange={(e) => setVisitForm({ ...visitForm, time: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Location
                  <input
                    value={visitForm.location}
                    onChange={(e) => setVisitForm({ ...visitForm, location: e.target.value })}
                    placeholder="Clinic or online"
                  />
                </label>
                <label>
                  Notes
                  <input
                    value={visitForm.notes}
                    onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <button type="submit" className="primary full" disabled={busy} aria-busy={busy}>
                  Save appointment <ArrowRight size={15} />
                </button>
              </form>
            )}
            {modal === 'invite' && (
              <>
                <form onSubmit={createInvite}>
                  <label>
                    Email address (optional)
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      placeholder="family@example.com"
                    />
                  </label>
                  <label>
                    Access role
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    >
                      <option value="family">Family · View and record doses</option>
                      <option value="caregiver">Caregiver · Manage care plan</option>
                      <option value="care_recipient">Care recipient · Own care decisions</option>
                    </select>
                  </label>
                  <button type="submit" className="primary full" disabled={busy} aria-busy={busy}>
                    Generate one-time invitation
                  </button>
                </form>
                {invite && (
                  <div className="generated">
                    <p className="generated-label">
                      Share this code securely · expires in 48 hours
                    </p>
                    <div className="code">
                      <b>{invite.code}</b>
                      <button type="button" onClick={copyInvite}>
                        <Copy size={14} /> Copy
                      </button>
                    </div>
                    <small>
                      Only the invited email can redeem it when an email address was specified.
                    </small>
                  </div>
                )}
              </>
            )}
            {modal === 'settings' && prefs && (
              <form onSubmit={savePrefs}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={prefs.email_enabled}
                    onChange={(e) => setPrefs({ ...prefs, email_enabled: e.target.checked })}
                  />{' '}
                  Enable email reminders
                </label>
                <label>
                  Dose reminder lead time
                  <select
                    value={prefs.dose_lead_minutes}
                    onChange={(e) => setPrefs({ ...prefs, dose_lead_minutes: e.target.value })}
                  >
                    <option value="0">At scheduled time</option>
                    <option value="15">15 minutes before</option>
                    <option value="30">30 minutes before</option>
                    <option value="60">1 hour before</option>
                  </select>
                </label>
                <label>
                  Missed dose alert delay
                  <select
                    value={prefs.missed_dose_delay_minutes}
                    onChange={(e) =>
                      setPrefs({ ...prefs, missed_dose_delay_minutes: e.target.value })
                    }
                  >
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                  </select>
                </label>
                <label>
                  Appointment reminder
                  <select
                    value={prefs.appointment_lead_hours}
                    onChange={(e) => setPrefs({ ...prefs, appointment_lead_hours: e.target.value })}
                  >
                    <option value="24">24 hours before</option>
                    <option value="48">48 hours before</option>
                    <option value="72">3 days before</option>
                  </select>
                </label>
                <button type="submit" className="primary full" disabled={busy} aria-busy={busy}>
                  Save preferences
                </button>
                <small className="authlegal">
                  Email delivery requires a verified sender and configured reminder service.
                </small>
              </form>
            )}
            {modal === 'safety' && (
              <div className="safetycopy">
                <p>
                  Care records are stored in the connected Supabase project and protected by
                  row-level access policies. Only signed-in members of this care profile can read
                  its records. Invitation codes are one-use and expire after 48 hours.
                </p>
                <p>
                  Everkind is not a clinical system and does not provide medical advice. Do not use
                  it for emergency care or as a substitute for clinician instructions.
                </p>
                <button className="primary full" onClick={() => setModal('')}>
                  Close
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
