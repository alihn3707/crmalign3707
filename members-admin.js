/* مدیریت اعضا (فقط مدیر): در index.html قبل از </body> با <script src="members-admin.js"></script> لود می‌شود */
var MEMS=null,MEMLOAD=false;
async function memRpc(fn,body){const r=await sbReq('/rest/v1/rpc/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const t=await r.text();try{return JSON.parse(t)}catch(e){return t}}
async function loadMems(){try{MEMS=await memRpc('list_members')}catch(e){MEMS=[];alert('لیست اعضا خوانده نشد. فایل setup.sql را اجرا کرده‌اید؟')}render()}
function addMem(){form('افزودن عضو',[{k:'n',l:'نام عضو'},{k:'e',l:'ایمیل عضو (همانی که در Supabase ساخته‌اید)'}],v=>{
  if(!v.e){alert('ایمیل را وارد کنید.');return}
  memRpc('add_member',{p_email:v.e,p_name:v.n||''}).then(r=>{
    if(r==='ok'){alert('عضو اضافه شد.');loadMems()}
    else if(r==='no_user')alert('کاربری با این ایمیل پیدا نشد. اول در Supabase بخش Authentication ← Users بسازید.');
    else if(r==='is_owner')alert('این ایمیل مال خود شماست.');
    else alert('انجام نشد.')
  }).catch(()=>alert('انجام نشد؛ اینترنت یا setup.sql را بررسی کنید.'))
},'افزودن')}
function delMem(uid){const m=(MEMS||[]).find(x=>x.user_id===uid);if(!m)return;
  form('دسترسی «'+esc(m.name)+'» برداشته شود؟',[],()=>{memRpc('remove_member',{p_uid:uid}).then(loadMems).catch(()=>alert('انجام نشد.'))},'بله، حذف شود')}
function doLogin(){const p=nd($('#lp').value);
  if(p&&p===nd(S.pw)){S.user='مدیر';S.admin=true;render()}
  else{$('#le').textContent='رمز درست نیست.';$('#le').style.color='var(--bad)'}}
function setV(){
  if(MEMS===null&&!MEMLOAD){MEMLOAD=true;loadMems()}
  const ml=MEMS===null?'<div class="mu">در حال خواندن…</div>':(MEMS.length?MEMS.map(m=>'<div class="row" style="margin-top:8px"><span>'+esc(m.name)+'<div class="mu" dir="ltr" style="text-align:right">'+esc(m.email)+'</div></span><button class="btn g" onclick="delMem(\''+m.user_id+'\')">حذف</button></div>').join(''):'<div class="mu">عضوی اضافه نشده.</div>');
  return '<h2>تنظیمات</h2><div class="card"><label>نام دپارتمان<input value="'+esc(S.name)+'" onchange="S.name=this.value;render()"></label></div>'
  +'<div class="card"><b>اعضا</b>'+ml+'<div style="margin-top:10px"><button class="btn" onclick="addMem()">افزودن عضو</button></div><div class="note">عضو با ایمیل و رمز خودش وارد صفحه‌ی member.html می‌شود و فقط فایل‌های فعال را می‌بیند: آدرس، نام مالک، قیمت و عکس‌ها. شماره‌ی مالک و بقیه‌ی بخش‌ها برایش بسته است.</div></div>'
  +'<div class="card"><b>رمز مدیر</b><div style="margin-top:10px"><button class="btn" onclick="chPw()">تغییر رمز</button></div></div><div class="card"><b>پشتیبان‌گیری</b><div class="note">اطلاعات روی سرور Supabase ذخیره می‌شود. با این حال هر چند وقت یک بار پشتیبان بگیرید.</div><div style="margin-top:10px"><button class="btn" onclick="backup()">دریافت فایل پشتیبان</button></div><label style="margin-top:10px">بازگردانی از پشتیبان<input type="file" accept=".json,application/json" onchange="restore(this)"></label></div>';
}
