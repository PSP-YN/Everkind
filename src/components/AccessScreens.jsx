import React, { useState } from 'react';
import { ArrowRight, HeartPulse, LoaderCircle } from 'lucide-react';
import { supabase } from '../supabase';
import { isStrongPassword, safeError } from '../utils';

export function AuthScreen() {
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

export function Onboarding({ user, onCreated, onJoin }) {
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
            placeholder="EVER-32-CHARACTER-HEX-CODE"
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
