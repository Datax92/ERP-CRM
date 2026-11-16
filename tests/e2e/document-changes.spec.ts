import { test, expect } from '@playwright/test';
const base='http://127.0.0.1:8080/v1/projects/demo-erp/databases/(default)/documents';
async function put(col:string,id:string, data:Record<string,string|boolean|number>){ const fields=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{doubleValue:v}:{stringValue:v}])); const res=await fetch(`${base}/${col}/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields})});expect(res.ok).toBeTruthy(); }
test.beforeAll(async()=>{
 await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-erp/databases/(default)/documents',{method:'DELETE'});
 const res=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'document@test.local',password:'test1234'})}); let user=await res.json(); if (!user.localId) { const login=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'document@test.local',password:'test1234',returnSecureToken:true})});user=await login.json(); } expect(user.localId).toBeTruthy(); await put('members',user.localId,{enabled:true});
 await put('clients','doc-client',{name:'Document Cement',region:'Gulf',country:'Oman',sector:'Cement',email:'cement@example.test',jobTitle:'Purchase manager',headOffice:'Muscat',remarks:'Preferred customer'});
 await put('clients','doc-other',{name:'Document Power',region:'Asia',country:'Pakistan',sector:'Power & Energy',email:'power@example.test'});
 await put('expenses','doc-expense',{serial:'DOC-EXP',description:'Column total check',kind:'Expense',amountValue:125,amountPKR:125,currency:'PKR',exchangeRate:1,date:'2026-11-15'});
 await put('suppliers','doc-supplier',{name:'Document Supplier',country:'China',email:'supplier@example.test',remarks:'Factory contact'});
 for(const [id,status] of [['open','Open'],['costing','Costing'],['closed','Close without Success'],['converted','Converted']]) await put('rfqs',`doc-${id}`,{serial:`DOC-${id}`,clientId:'doc-client',date:'2026-11-15',status});
});
test.beforeEach(async({page})=>{ await page.goto('/');await page.getByLabel(/^Email/).fill('document@test.local');await page.getByLabel(/^Password/).fill('test1234');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Customize',exact:true})).toBeVisible(); });
test('contact filters, grouping, copy emails and editable fields',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/clients/');
 await page.getByLabel('Region',{exact:true}).selectOption('Gulf'); await page.getByLabel('Sector',{exact:true}).selectOption('Cement');
 await expect(page.getByRole('cell',{name:'Document Cement',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Document Power',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Copy all emails'}).click();await expect(page.getByRole('status')).toContainText('All 1 email'); expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('cement@example.test');
 await page.getByLabel('Group contacts by').selectOption('hierarchy'); await expect(page.getByRole('rowheader',{name:'Gulf / Oman / Cement',exact:true})).toBeVisible();
 await page.getByRole('cell',{name:'Document Cement',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Job title',{exact:true})).toHaveValue('Purchase manager');await dialog.getByRole('textbox',{name:'Remarks',exact:true}).fill('Reviewed remarks');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog.getByRole('button',{name:'Saved',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('dialog').getByRole('textbox',{name:'Remarks',exact:true})).toHaveValue('Reviewed remarks');
});
test('columns hide, restore, reorder, resize and persist independently per module',async({page})=>{
 await page.goto('/clients/'); const table=page.getByRole('table',{name:'Clients',exact:true});
 await page.getByText('Columns + / −',{exact:true}).click(); await page.getByRole('checkbox',{name:'Show Email column',exact:true}).uncheck(); await expect(table.getByRole('columnheader').filter({hasText:/^Email$/})).toHaveCount(0);await page.getByText('Columns + / −',{exact:true}).click();
 const handle=page.getByRole('button',{name:'Move Company column',exact:true});await handle.focus();await handle.press('ArrowLeft');await expect(table.locator('th').nth(2)).toContainText('Company');
 const edge=page.getByRole('separator',{name:'Resize Company column',exact:true});await edge.focus();await edge.press('ArrowRight');
 await page.reload();await expect(table.locator('th').nth(2)).toContainText('Company');expect(await table.locator('th').nth(2).evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(200,0);
 await page.getByText('Columns + / −',{exact:true}).click();await expect(page.getByRole('checkbox',{name:'Show Email column',exact:true})).not.toBeChecked();await page.getByRole('checkbox',{name:'Show Email column',exact:true}).check();await page.getByRole('button',{name:'Reset columns',exact:true}).click();await page.getByText('Columns + / −',{exact:true}).click();
 const moving=(await table.locator('thead [data-column-key="name"]').boundingBox())!;const destination=(await table.locator('thead th').first().boundingBox())!;await page.mouse.move(moving.x+moving.width/2,moving.y+moving.height/2);await page.mouse.down();await page.mouse.move(destination.x+destination.width/2,destination.y+destination.height/2,{steps:12});await page.mouse.up();await expect(table.locator('th').first()).toContainText('Company');
 await expect.poll(()=>table.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 const resize=page.getByRole('separator',{name:'Resize Company column',exact:true});const box=await resize.boundingBox();expect(box).toBeTruthy();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+50,box!.y+box!.height/2,{steps:5});await page.mouse.up();expect(await table.locator('th').first().evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(230,0);
 await page.goto('/suppliers/');await expect(page.getByRole('table').locator('thead input')).toHaveCount(0);await expect(page.getByRole('cell',{name:'Factory contact',exact:true})).toBeAttached();
});
test('RFQ sections preserve open work and unsuccessful history',async({page})=>{
 await page.goto('/rfqs/');await expect(page.getByRole('cell',{name:'DOC-open',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'DOC-costing',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'DOC-closed',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:/^Closed RFQs/}).click();await expect(page.getByRole('cell',{name:'DOC-closed',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'DOC-converted',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'DOC-open',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Search rfqs',exact:true}).fill('DOC-closed');await expect(page.getByRole('cell',{name:'DOC-converted',exact:true})).toHaveCount(0);await page.getByRole('button',{name:/^Clear/}).click();await expect(page.getByRole('cell',{name:'DOC-converted',exact:true})).toBeVisible();
});

test('financial total remains under its column when moved to the first position', async({page})=>{
 await page.goto('/expenses/');await page.getByRole('textbox',{name:'Search expenses / charity / zakat',exact:true}).fill('DOC-EXP');
 const table=page.getByRole('table',{name:'Expenses / Charity / Zakat',exact:true});
 const amountHandle=page.getByRole('button',{name:'Move Amount column',exact:true});await amountHandle.focus();for(let i=0;i<7;i++) await amountHandle.press('ArrowLeft');
 await expect(table.locator('thead th').first()).toContainText('Amount');
 await expect(table.locator('tfoot tr').last().locator('td').first()).toHaveText(/PKR 125/);
});


test('compact headers and animated whole column movement persist and cancel cleanly', async({page}) => {
 await page.goto('/clients/');
 const table=page.getByRole('table',{name:'Clients',exact:true});
 const company=table.locator('thead [data-column-key="name"]');
 const region=table.locator('thead [data-column-key="region"]');
 await expect(table.locator('thead input')).toHaveCount(0);
 expect((await company.boundingBox())!.height).toBeLessThan(55);
 const companyEdge=page.getByRole('separator',{name:'Resize Company column',exact:true});await companyEdge.focus();await companyEdge.press('ArrowRight');await companyEdge.press('ArrowRight');
 await expect.poll(async()=>(await company.boundingBox())!.width).toBe(220);
 const start=(await company.boundingBox())!;const target=(await region.boundingBox())!;
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
 await page.mouse.move(target.x+target.width/2,start.y+start.height/2,{steps:12});
 await expect(table.locator('.erp-column-lifted')).toHaveCount(3);
 await expect.poll(async()=>await company.evaluate(el=>el.getBoundingClientRect().left)).toBeLessThan(start.x-300);
 const xs=await table.locator('[data-column-key="name"]').evaluateAll(cells=>cells.map(el=>el.getBoundingClientRect().left));
 expect(Math.max(...xs)-Math.min(...xs)).toBeLessThan(1);
 await expect.poll(async()=>await region.evaluate(el=>el.getBoundingClientRect().left)).toBeGreaterThan(target.x+100);
 await page.screenshot({path:'/tmp/erp-browser-tools/column-drag-in-progress.png'});
 await page.mouse.up();
 const dropped=await table.locator('[data-column-key="name"]').evaluateAll(cells=>cells.map(el=>el.getBoundingClientRect().left));expect(Math.max(...dropped)-Math.min(...dropped)).toBeLessThan(1);
 await expect(table.locator('tbody tr').first()).toContainText('Document Cement');
 await expect(table.locator('thead th').first()).toContainText('Company');await expect(table.locator('.erp-column-lifted')).toHaveCount(0);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.reload();await expect(table.locator('thead th').first()).toContainText('Company');
 const before=await table.locator('thead th').allTextContents();const again=(await company.boundingBox())!;
 await page.mouse.move(again.x+again.width/2,again.y+again.height/2);await page.mouse.down();await page.mouse.move(again.x+again.width*2,again.y+again.height/2,{steps:8});
 await expect(table.locator('.erp-column-lifted')).toHaveCount(3);await page.keyboard.press('Escape');await page.mouse.up();
 await expect(table.locator('.erp-column-lifted')).toHaveCount(0);expect(await table.locator('thead th').allTextContents()).toEqual(before);
 await expect.poll(()=>table.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 await page.screenshot({path:'/tmp/erp-browser-tools/compact-client-table.png'});
});

test('column dragging scrolls the grid to reach columns outside the viewport', async({page}) => {
 await page.goto('/clients/');const table=page.getByRole('table',{name:'Clients',exact:true});const wrap=page.locator('.erp-column-viewport');
 const header=table.locator('thead [data-column-key="country"]');const a=(await header.boundingBox())!;const box=(await wrap.boundingBox())!;
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-8,a.y+a.height/2,{steps:10});
 await expect.poll(()=>wrap.evaluate(el=>el.scrollLeft)).toBeGreaterThan(80);
 await page.mouse.up();await expect(table.locator('.erp-column-lifted')).toHaveCount(0);
 await page.reload();await expect(table.locator('thead [data-column-key="country"]')).toBeVisible();const order=await table.locator('thead th').evaluateAll(cells=>cells.map(el=>el.getAttribute('data-column-key')));expect(order.indexOf('country')).toBeGreaterThan(1);
});

test('contact polish shows flags and readable tags without changing export text', async({page}) => {
 await put('clients','style-client',{name:'Tabuk Style Demo',region:'Middle East',country:'Saudi Arabia',sector:'Cement',email:'ali@tabuk.example',mobile:'+966 123 456 789',registration:'Registered',remarks:'Cement plant contact for the Saudi region'});
 await page.goto('/clients/');await page.getByRole('textbox',{name:'Search clients',exact:true}).fill('Tabuk Style Demo');
 const row=page.getByRole('table',{name:'Clients',exact:true}).locator('tbody tr').first();
 await expect(row.locator('.contact-flag')).toHaveText('🇸🇦');
 await expect(row.locator('.contact-region')).toHaveText('Middle East');await expect(row.locator('.contact-sector')).toHaveText('Cement');
 await expect(row.getByRole('cell',{name:'Tabuk Style Demo',exact:true})).toBeAttached();
 const email=row.getByRole('link',{name:'ali@tabuk.example',exact:true});await expect(email).toHaveAttribute('href','mailto:ali%40tabuk.example');
 const mobile=row.getByRole('link',{name:'+966 123 456 789',exact:true});await expect(mobile).toHaveAttribute('href','tel:+966123456789');
 await expect(row.locator('[data-column-key="remarks"]')).toHaveAttribute('title','Cement plant contact for the Saudi region');
 const csvDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();const csv=await csvDownload;const fs=await import('node:fs/promises');const data=await fs.readFile((await csv.path())!,'utf8');expect(data).toContain('Saudi Arabia');expect(data).not.toContain('🇸🇦');
 // Choose the same concise contact layout used in the client screenshot.
 await page.getByText('Columns + / −',{exact:true}).click();const keep=['Region','Country','Sector','Company','Email','Cell / mobile','Remarks'];
 for(const checkbox of await page.getByRole('checkbox').all()){const label=await checkbox.getAttribute('aria-label');if(label?.startsWith('Show ')&&!keep.some(name=>label===`Show ${name} column`))await checkbox.uncheck();}
 await page.getByText('Columns + / −',{exact:true}).click();
 await row.locator('[data-column-key="name"]').hover();
 await page.screenshot({path:'/tmp/erp-browser-tools/contact-polish.png'});
});


test('country aliases use the correct flag and unknown countries use a globe', async({page}) => {
 await put('clients','flag-uk',{name:'Flag UK Demo',country:'United Kingdom'});await put('clients','flag-unknown',{name:'Flag Unknown Demo',country:'Custom territory'});
 await page.goto('/clients/');const search=page.getByRole('textbox',{name:'Search clients',exact:true});await search.fill('Flag UK Demo');await expect(page.locator('tbody .contact-flag')).toHaveText('🇬🇧');
 await search.fill('Flag Unknown Demo');await expect(page.locator('tbody .contact-flag')).toHaveCount(0);await expect(page.locator('tbody .contact-country svg')).toBeVisible();
});
