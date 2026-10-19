'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Two-step confirm: first click arms the button, second click deletes.
export default function DeletePostButton({ brand, id }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3500);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/posts/${brand}/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <button
      className={`post-delete ${armed ? 'armed' : ''}`}
      onClick={onClick}
      disabled={busy}
      aria-label={`${id} 삭제`}
      title="게시물 삭제"
    >
      {busy ? '삭제 중…' : armed ? '한 번 더 누르면 삭제' : '✕'}
    </button>
  );
}
