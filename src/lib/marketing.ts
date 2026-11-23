import type { Rec } from './types';

/** One group send: every client's activity stays stored, but the list shows it as a single line. */
export type MarketingCampaign = { key: string; row: Rec; members: Rec[] };
const campaignKey = (r: Rec) => r.campaignBatch || (r.campaignGroup ? [r.campaignGroup, r.date, r.channel, r.subject].join('|') : '');
export function collapseCampaigns(rows: Rec[]): MarketingCampaign[] {
  const out: MarketingCampaign[] = [];
  const byKey = new Map<string, MarketingCampaign>();
  for (const r of rows) {
    const key = campaignKey(r);
    const hit = key ? byKey.get(key) : undefined;
    if (hit) { hit.members.push(r); continue; }
    const c = { key: key || r.id, row: r, members: [r] };
    if (key) byKey.set(key, c);
    out.push(c);
  }
  return out;
}
/** Distinct values, or a count once there are too many to read in a cell. */
export const summarize = (values: unknown[], noun: string) => {
  const u = [...new Set(values.filter(Boolean).map(String))];
  return u.length > 3 ? `${u.length} ${noun}: ${u.slice(0, 3).join(', ')}…` : u.join(', ');
};

export type MarketingChannel = 'all' | 'email' | 'whatsapp' | 'call' | 'other';
export function marketingChannel(value?: string): Exclude<MarketingChannel, 'all'> {
  const key = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (key === 'email') return 'email';
  if (key === 'whatsapp') return 'whatsapp';
  if (key === 'call' || key === 'phone' || key === 'phonecall') return 'call';
  return 'other';
}
export const marketingChannelName = (value?: string) => ({email:'Email',whatsapp:'WhatsApp',call:'Call',other:value || 'Other'})[marketingChannel(value)];
export const MARKETING_STATUSES = ['Planned', 'Contacted', 'Follow-up', 'Closed', 'Recorded'];
export const marketingStatus = (r: Rec): string => r.status || 'Recorded';
export const contactDate = (r: Rec): string => r.lastContactDate || (!r.status ? r.date || '' : '');
export const contactDetails = (r: Rec): string => r.lastContactDetails || (!r.status ? r.notes || r.subject || '' : '');
/** The latest actual contact for the selected client, across all marketing channels. */
export function latestMarketingContact(r: Rec, activities: Rec[]): Rec | undefined {
  const candidates = r.clientId ? activities.filter(x => x.clientId === r.clientId) : [r];
  return candidates.filter(x => contactDate(x)).sort((a,b) => contactDate(b).localeCompare(contactDate(a)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || b.id.localeCompare(a.id))[0];
}
export const marketingFollowUpDue = (r: Rec, date: string): boolean => marketingStatus(r) !== 'Closed' && Boolean(r.nextFollowUpDate) && r.nextFollowUpDate <= date;

/** WhatsApp wants the number in international form with digits only; a leading 0 is taken as Pakistan. */
export const waNumber = (raw: string) => {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.slice(1);
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return `92${d.slice(1)}`;
  return d;
};
