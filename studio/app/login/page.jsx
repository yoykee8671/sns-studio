'use client';

import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '로그인 실패');
      location.href = '/';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="center-msg">
      <form className="login-box" onSubmit={submit}>
        <h1>SNS Studio</h1>
        <input
          type="password"
          className="text-input"
          placeholder="비밀번호"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !password}>
          {busy ? '확인 중…' : '들어가기'}
        </button>
      </form>
    </main>
  );
}
