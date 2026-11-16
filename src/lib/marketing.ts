import type { Rec } from './types';

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
