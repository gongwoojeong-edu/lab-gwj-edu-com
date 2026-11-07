import asyncio,json,os
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={"width":1280,"height":1800})
  page=await context.new_page()
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  await page.goto('http://localhost:8080/teacher/bookshelf/L08/1/3')
  await page.wait_for_timeout(10000)
  fixture = await page.evaluate("""async () => {
    const {supabase:s}=await import('/src/integrations/supabase/client.ts');
    const {data:{user}}=await s.auth.getUser();
    const {data:book,error:be}=await s.from('textbooks').select('id').eq('level','L08').eq('volume_no',3).eq('series_id',(await s.from('textbook_series').select('id').eq('level','L08').eq('series_no',1).single()).data.id).single();
    if(be) throw be;
    const suffix=crypto.randomUUID();
    const {data:unit,error:ue}=await s.from('textbook_units').insert({textbook_id:book.id,unit_no:9999,title:'병합 검증 '+suffix}).select().single(); if(ue) throw ue;
    const codes=[1,2,3].map(n=>'merge-check-'+suffix+'-'+n);
    const {data:passages,error:pe}=await s.from('textbook_passages').insert(codes.map((code,i)=>({textbook_id:book.id,unit_id:unit.id,passage_no:i+1,code,english:['First sentence.','Second sentence.','Third sentence.'][i],korean:['첫 문장','둘째 문장','셋째 문장'][i]}))).select(); if(pe) throw pe;
    const {error:te}=await s.from('sentence_translations').insert(codes.map((sentence_id,i)=>({user_id:user.id,sentence_id,text:[' 첫 학생 해석 ',' 둘째 학생 해석 ','   '][i]})));if(te) throw te;
    return {unit:unit.id,codes,passages:passages.map(p=>p.id)};
  }""")
  try:
   await page.reload()
   await page.get_by_text('병합 검증',exact=False).first.wait_for(timeout=20000)
   await page.get_by_role('button',name='본문 수정',exact=True).last.click()
   dialog=page.get_by_role('dialog')
   await dialog.get_by_role('checkbox').first.wait_for()
   for cb in await dialog.get_by_role('checkbox').all(): await cb.check()
   await dialog.get_by_role('button',name='합치기',exact=True).click()
   await page.get_by_role('alertdialog').get_by_role('button',name='합치기',exact=True).click()
   await page.get_by_text('3개 문장을 1개로 합쳤어요',exact=True).wait_for(timeout=20000)
   await page.wait_for_timeout(1000)
   assert await dialog.get_by_role('checkbox').count()==1
   result=await page.evaluate("""async f=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts'); const {data,error}=await s.from('sentence_translations').select('sentence_id,text').in('sentence_id',f.codes);if(error)throw error;return data;}""",fixture)
   target=next(r for r in result if r['sentence_id']==fixture['codes'][0])
   assert target['text']=='첫 학생 해석 둘째 학생 해석',target
   assert len(result)==3
   await page.screenshot(path='/tmp/browser/passage-merge/merged.png')
   print('PASS: actual UI merge, ordered interpretation, blank omitted, source interpretations retained')
  finally:
   await page.evaluate("""async f=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');for(const [table,key,values] of [['sentence_translations','sentence_id',f.codes],['sentence_word_extractions','sentence_id',f.codes],['textbook_units','id',[f.unit]]]) {const {error}=await s.from(table).delete().in(key,values);if(error)throw error;}}""",fixture)
   print('Temporary verification data removed')
  await browser.close()
asyncio.run(main())
