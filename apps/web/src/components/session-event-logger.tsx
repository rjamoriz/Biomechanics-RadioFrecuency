'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { CheckCircle } from 'lucide-react';

const EVENT_TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'shoe_change', label: 'Shoe Change' },
  { value: 'fatigue_onset', label: 'Fatigue Onset' },
  { value: 'discomfort', label: 'Discomfort' },
  { value: 'form_break', label: 'Form Break' },
  { value: 'other', label: 'Other' },
];

interface SessionEventLoggerProps {
  sessionId: string;
}

export function SessionEventLogger({ sessionId }: SessionEventLoggerProps) {
  const [eventType, setEventType] = useState('note');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(false);

  const handleLog = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: 'POST',
        body: {
          type: eventType,
          description: description.trim(),
          timestamp: Date.now(),
        },
      });
      setDescription('');
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">Log Manual Event</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Select
          label="Event Type"
          options={EVENT_TYPES}
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="sm:w-44"
        />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 200))}
          placeholder="Brief event description..."
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleLog}
          loading={submitting}
          disabled={!description.trim()}
        >
          Log Event
        </Button>
      </div>
      {flash && (
        <p className="inline-flex items-center gap-1 text-xs text-green-600">
          <CheckCircle className="h-3.5 w-3.5" /> Event logged
        </p>
      )}
    </div>
  );
}
