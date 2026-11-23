import { beforeEach, expect, it } from 'vitest';
import { marketingChannel, marketingFollowUpDue, marketingStatus, contactDate, latestMarketingContact } from '@/lib/marketing';
import { mergeSettings } from '@/lib/settings';
import { clientInfo } from '@/lib/derive';
import { mem, store } from './memory-db';

beforeEach(()=>mem.reset());
it('groups legacy phone and email spelling into the expected channel, retaining other channels',()=>{
 expect(marketingChannel('Phone Call')).toBe('call');expect(marketingChannel('Call')).toBe('call');expect(marketingChannel('E-MAIL')).toBe('email');expect(marketingChannel('Whatsapp')).toBe('whatsapp');expect(marketingChannel('Advertisement')).toBe('other');
});
it('keeps legacy activities readable and includes all required channels for existing settings',()=>{
 expect(marketingStatus({id:'old'})).toBe('Recorded');expect(contactDate({id:'old',date:'2026-01-01'})).toBe('2026-01-01');
 expect(mergeSettings({marketingChannels:['Phone Call','Custom channel']}).marketingChannels).toEqual(['Email','WhatsApp','Call','Phone Call','Custom channel']);
});
it('finds latest real contact across channels for the same client and ignores future plans',()=>{
 const activities=[{id:'email',clientId:'a',channel:'Email',lastContactDate:'2026-01-01',status:'Contacted'}, {id:'call',clientId:'a',channel:'Call',lastContactDate:'2026-02-01',status:'Contacted'}, {id:'plan',clientId:'a',channel:'Email',date:'2099-01-01',status:'Planned'}, {id:'other-client',clientId:'b',lastContactDate:'2026-03-01',status:'Contacted'}];
 expect(latestMarketingContact(activities[0],activities)?.id).toBe('call');expect(latestMarketingContact({id:'new',clientId:'none'},activities)).toBeUndefined();
});
it('does not combine unlinked prospect contact history',()=>{
 const prospect={id:'p',prospectName:'Prospect',date:'2026-01-01'};expect(latestMarketingContact(prospect,[prospect,{id:'x',prospectName:'Other',date:'2026-02-01'}])?.id).toBe('p');
});
it('counts today and overdue follow-ups but not closed or future follow-ups',()=>{
 expect(marketingFollowUpDue({id:'a',nextFollowUpDate:'2026-01-01'},'2026-01-01')).toBe(true);expect(marketingFollowUpDue({id:'a',status:'Closed',nextFollowUpDate:'2026-01-01'},'2026-02-01')).toBe(false);expect(marketingFollowUpDue({id:'a',nextFollowUpDate:'2026-02-01'},'2026-01-01')).toBe(false);
});
it('a planned campaign does not reset client inactivity, but actual contact does',()=>{
 const client={id:'client',name:'Test',createdAt:'2020-01-01'};mem.data.clients.set(client.id,client);mem.data.marketing.set('plan',{id:'plan',clientId:'client',date:'2099-01-01',status:'Planned'});
 expect(clientInfo(client,store()).lastActivity).toBe('2020-01-01');mem.data.marketing.set('actual',{id:'actual',clientId:'client',date:'2099-01-01',status:'Contacted',lastContactDate:'2026-01-01'});expect(clientInfo(client,store()).lastActivity).toBe('2026-01-01');
});

import { collapseCampaigns } from '@/lib/marketing';
it('shows one group send as one line but keeps each client', () => {
  const send = { campaignBatch: 'b1', campaignGroup: 'Middle East', date: '2026-11-01', channel: 'Email' };
  const lines = collapseCampaigns([{ id: 'a', clientId: 'c1', ...send }, { id: 'x', clientId: 'c3', date: '2026-11-01' }, { id: 'b', clientId: 'c2', ...send }]);
  expect(lines.map((l) => l.members.map((m) => m.id))).toEqual([['a', 'b'], ['x']]);
});
