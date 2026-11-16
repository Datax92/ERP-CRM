"use client";

import { Mail, MessageCircle, Phone } from 'lucide-react';
import { marketingChannel, marketingFollowUpDue, type MarketingChannel } from '@/lib/marketing';
import { today } from '@/lib/calc';
import type { Rec } from '@/lib/types';

export function MarketingChannels({ rows, value, onChange }: { rows: Rec[]; value: MarketingChannel; onChange: (v: MarketingChannel) => void }) {
  const channels = [
    { key: 'email' as const, label: 'By Email', Icon: Mail },
    { key: 'whatsapp' as const, label: 'By WhatsApp', Icon: MessageCircle },
    { key: 'call' as const, label: 'By Call', Icon: Phone },
  ];
  return <section className="marketing-channel-section" aria-label="Marketing outreach">
    <div role="tablist" aria-label="Marketing channels" className="marketing-channel-tabs">
      {channels.map(({key,label,Icon}) => {
        const entries = rows.filter(r => marketingChannel(r.channel) === key);
        const due = entries.filter(r => marketingFollowUpDue(r, today())).length;
        return <button type="button" role="tab" aria-selected={value === key} aria-label={`${label} (${entries.length})`} key={key} className={`marketing-channel marketing-channel-${key}`} onClick={() => onChange(key)}>
          <span className="marketing-channel-icon"><Icon size={19} aria-hidden="true" /></span>
          <span className="marketing-channel-name">{label}<small>{due ? `${due} follow-up${due === 1 ? '' : 's'} due` : 'No follow-ups due'}</small></span>
          <strong>{entries.length}</strong>
        </button>;
      })}
      <button type="button" role="tab" className="btn marketing-channel-all" aria-selected={value === 'all'} onClick={() => onChange('all')}>All channels ({rows.length})</button>
      {rows.some(r => marketingChannel(r.channel) === 'other') && <button type="button" role="tab" className="btn marketing-channel-all" aria-selected={value === 'other'} onClick={() => onChange('other')}>Other channels ({rows.filter(r => marketingChannel(r.channel) === 'other').length})</button>}
    </div>
    <p className="text-xs text-muted">Select a channel to view client activities, status, contact history and next follow-up. Counts include all activities in that channel.</p>
  </section>;
}
