const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({headless:true});
 const context = await browser.newContext({reducedMotion:'reduce'});
 await context.addInitScript(() => { if (!['/iniciar-sesion','/crear-cuenta','/admin/login'].includes(location.pathname)) localStorage.setItem('partly.user', JSON.stringify({id:'responsive-test',name:'Cuenta de prueba con nombre largo',email:'responsive@example.test',role:'ADMIN'})); else localStorage.removeItem('partly.user'); });
 // Isolated UI audit: never contact or mutate real backend data.
 await context.route('**/api/**', r => r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Datos no disponibles en la prueba visual'})}));
 const page = await context.newPage();
 const routes=['/','/como-funciona-el-ciclo','/comparativa','/seguridad','/terminos','/privacidad','/iniciar-sesion','/crear-cuenta','/admin/login','/panel','/panel/explorar','/panel/grupos','/panel/grupos/nuevo','/panel/perfil','/panel/soporte','/panel/soporte/nueva','/admin','/admin/proveedores','/admin/grupos','/admin/pagos','/admin/retiros','/admin/incidencias','/admin/usuarios'];
 const results=[];
 for (const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({width,height:900});
  for (const route of routes) {
   await page.goto('http://127.0.0.1:4200'+route, {waitUntil:'domcontentloaded'});
   await page.waitForTimeout(450); await page.evaluate(() => document.fonts.ready);
   const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&getComputedStyle(e).position!=='absolute'&&!e.closest('[class*="overflow-hidden"], [class*="overflow-x-auto"], .table-wrap')}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.trim().slice(0,60)}))}));
   results.push({route,...result});
   if(result.scroll>width+2) console.log(JSON.stringify({route,...result}));
   if(['/','/panel','/panel/grupos/nuevo','/admin/usuarios','/iniciar-sesion'].includes(route)&&[390,768,1440].includes(width)) await page.screenshot({path:`qa/${route.replaceAll('/','-')||'home'}-${width}.png`});
  }
  console.log('Finished width '+width);
 }
 fs.writeFileSync('qa/responsive-audit.json',JSON.stringify(results,null,2));
 await browser.close();
})();
