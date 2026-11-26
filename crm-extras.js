/* crm-extras.js — مدیریت اعضا + مشخصات آپارتمان + تطبیق خودکار (یک فایل واحد) */

/* مدیریت اعضا (فقط مدیر): ساخت و حذف عضو روی سرور، بدون ذخیره‌ی رمز داخل برنامه */
(function () {
  var MEM = null, LOAD = false, MERR = false;

  function rpc(name, body) {
    return sbReq('/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } });
  }

  function load() {
    if (LOAD) return;
    LOAD = true;
    rpc('admin_list_members').then(function (a) {
      MEM = Array.isArray(a) ? a : [];
      MERR = !Array.isArray(a);
      LOAD = false;
      if (S.tab === 's') render();
    }).catch(function () {
      MEM = []; MERR = true; LOAD = false;
      if (S.tab === 's') render();
    });
  }

  function card() {
    var link = location.href.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + 'member.html';
    var rows = (MEM || []).map(function (u) {
      return '<div class="row" style="margin-top:8px"><span dir="ltr">' + esc(u) +
        '</span><button class="btn g" onclick="delMem(\'' + esc(u) + '\')">حذف</button></div>';
    }).join('');
    var old = (S.members || []).map(function (m, i) {
      return '<div class="row" style="margin-top:8px"><span>' + esc(m.u) +
        ' <span class="st r">قدیمی</span></span><button class="btn g" onclick="S.members.splice(' + i + ',1);render()">حذف</button></div>';
    }).join('');
    return '<div class="card"><b>اعضا</b>' +
      (MEM === null ? '<div class="mu" style="margin-top:8px">در حال بارگذاری…</div>'
        : MERR ? '<div class="mu" style="margin-top:8px;color:var(--bad)">ارتباط با سرور برقرار نشد یا setup.sql هنوز اجرا نشده.</div>'
        : (rows || '<div class="mu" style="margin-top:8px">عضوی اضافه نشده.</div>')) +
      old +
      '<div style="margin-top:10px"><button class="btn" onclick="addMem()">افزودن عضو</button></div>' +
      '<div class="note">عضو فقط فایل‌های فعال را می‌بیند: محله، آدرس، مشخصات ساختمان، قیمت و عکس. نام و شماره‌ی مالک، معرف و توضیحات برایش نمایش داده نمی‌شود.</div>' +
      '<div class="note" dir="ltr" style="text-align:left;word-break:break-all">' + esc(link) + '</div></div>';
  }

  var origSet = window.setV;
  window.setV = function () {
    var h = origSet();
    var a = h.indexOf('<div class="card"><b>اعضا</b>');
    var b = h.indexOf('<div class="card"><b>رمز مدیر</b>');
    if (a < 0 || b < 0) return h;
    if (MEM === null) load();
    return h.slice(0, a) + card() + h.slice(b);
  };

  window.addMem = function () {
    form('عضو جدید', [
      { k: 'u', l: 'نام کاربری (حروف انگلیسی کوچک یا عدد)' },
      { k: 'p', l: 'رمز (حداقل ۴ حرف؛ به عضو بدهید)' }
    ], function (v) {
      var u = normD(v.u || '').trim().toLowerCase(), p = normD(v.p || '');
      if (!/^[a-z0-9._-]+$/.test(u) || p.length < 4) {
        alert('نام کاربری باید انگلیسی باشد و رمز حداقل ۴ حرف.');
        return;
      }
      rpc('admin_add_member', { p_u: u, p_p: p }).then(function () {
        MEM = null; render();
        alert('عضو ذخیره شد.');
      }).catch(function () { alert('ساخت عضو انجام نشد؛ setup.sql را اجرا کرده‌ای؟'); });
    });
  };

  /* برنامه‌ی اصلی فقط با رمز مدیر باز می‌شود؛ اعضا فقط از member.html وارد می‌شوند */
  window.doLogin = function () {
    var p = nd(document.querySelector('#lp').value);
    if (p && p === nd(S.pw)) { S.user = 'مدیر'; S.admin = true; render(); }
    else {
      var e = document.querySelector('#le');
      e.textContent = 'رمز درست نیست.';
      e.style.color = 'var(--bad)';
    }
  };

  window.delMem = function (u) {
    form('عضو ' + u + ' حذف شود؟', [], function () {
      rpc('admin_del_member', { p_u: u }).then(function () { MEM = null; render(); })
        .catch(function () { alert('حذف انجام نشد.'); });
    }, 'بله، حذف شود');
  };
})();

/* مشخصات آپارتمان برای فایل‌های A (آپارتمان فروشی)، B (پیش‌فروش) و I (آپارتمان اجاره) */
(function () {
  var YN = ['دارد', 'ندارد'];
  var F = [
    ['bed', 'تعداد خواب', ['۱', '۲', '۳', '۴', '+۵']],
    ['dir', 'جهت واحد', ['شمالی', 'جنوبی', 'شرقی', 'غربی', 'دونبش']],
    ['floor', 'طبقه (همکف را بنویسید)', null],
    ['floors', 'تعداد کل طبقات ساختمان', null],
    ['park', 'پارکینگ', YN],
    ['stor', 'انباری', YN],
    ['elev', 'آسانسور', YN],
    ['deed', 'نوع سند', ['تک‌برگ', 'قولنامه‌ای', 'سایر']],
    ['occ', 'وضعیت واحد', ['تخلیه', 'مستأجر دارد', 'ساکن مالک']]
  ];
  var isApt = function (c) { return c === 'A' || c === 'B' || c === 'I'; };

  var origAdd = window.addFile;
  window.addFile = function (code) {
    origAdd.apply(this, arguments);
    var ms = document.querySelectorAll('.mo');
    var m = ms[ms.length - 1];
    if (!m) return;
    var o = code ? S.files.find(function (x) { return x.code === code; }) : null;
    var anchor = m.querySelector('[data-k="age"]');
    if (!anchor) return;
    var group = [anchor.parentNode];
    var after = anchor.parentNode;
    F.forEach(function (f) {
      var lab = document.createElement('label');
      var el = f[2]
        ? '<select data-k="' + f[0] + '"><option value="">—</option>' +
          f[2].map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select>'
        : '<input data-k="' + f[0] + '">';
      lab.innerHTML = f[1] + el;
      after.parentNode.insertBefore(lab, after.nextSibling);
      after = lab;
      group.push(lab);
      if (o && o[f[0]]) lab.querySelector('[data-k]').value = o[f[0]];
    });
    var cs = m.querySelector('[data-k="cat"]');
    var tg = function () {
      var c = cs ? cs.value : (o && o.cat);
      group.forEach(function (l) { l.style.display = isApt(c) ? '' : 'none'; });
    };
    if (cs) cs.addEventListener('change', tg);
    tg();
  };

  var origHcmp = window.hcmp;
  window.hcmp = function (f) {
    var base = origHcmp ? origHcmp(f) : '';
    if (!isApt(f.cat)) return base;
    var p = [];
    if (f.bed) p.push(f.bed + ' خواب');
    if (f.dir) p.push('جهت: ' + f.dir);
    if (f.floor) p.push('طبقه ' + f.floor + (f.floors ? ' از ' + f.floors : ''));
    [['park', 'پارکینگ'], ['stor', 'انباری'], ['elev', 'آسانسور']].forEach(function (x) {
      if (f[x[0]] === 'دارد') p.push(x[1]);
    });
    if (f.deed) p.push('سند: ' + f.deed);
    if (f.occ) p.push(f.occ);
    return base + (p.length ? '<div class="mu">' + p.map(esc).join(' · ') + '</div>' : '');
  };
})();

/* مشخصات خواسته‌ی مشتری + پیدا کردن خودکار فایل مناسب (و برعکس) */
(function () {
  var isApt = function (c) { return c === 'A' || c === 'B' || c === 'I'; };
  var bedN = function (s) { return +normD(String(s || '')).replace(/[^0-9]/g, '') || 0; };
  var NEED = ['لازم دارم'];
  var DIRS = ['شمالی', 'جنوبی', 'شرقی', 'غربی', 'دونبش'];
  var BEDS = ['۱', '۲', '۳', '۴', '+۵'];

  /* ---------- منطق تطبیق ---------- */
  function areaHit(c, f) {
    if (c.hood && f.hood) return c.hood === f.hood;
    if (c.hood && !f.hood) {
      var h = (S.hoods || []).find(function (x) { return x.code === c.hood; });
      return !!(h && f.area && String(f.area).indexOf(h.name) >= 0);
    }
    return null;
  }
  function areaTxt(c, f) {
    var toks = String(c.area || '').split(/[،,\/\s]+/).filter(function (t) { return t.length > 1; });
    if (!toks.length || !f.area) return null;
    return toks.some(function (t) { return String(f.area).indexOf(t) >= 0; });
  }
  function match(c, f) {
    if (c.off || f.st !== 'active' || c.cat !== f.cat) return null;
    var bmax = +c.bmax || 0, smin = +c.smin || 0;
    if (bmax && f.price && +f.price > bmax) return null;
    if (smin && f.size && +f.size < smin) return null;
    var cb = bedN(c.bed), fb = bedN(f.bed);
    if (cb && fb && fb < cb) return null;
    var tot = 0, ok = 0, miss = [];
    var ah = areaHit(c, f);
    if (ah === null && !c.hood) ah = areaTxt(c, f);
    if (c.hood || (c.area && String(c.area).trim())) { tot++; if (ah) ok++; else miss.push('محله/منطقه'); }
    if (cb && !fb) { tot++; miss.push('خواب ثبت نشده'); } else if (cb) { tot++; ok++; }
    if (c.dir) { tot++; if (f.dir === c.dir) ok++; else miss.push('جهت'); }
    [['park', 'پارکینگ'], ['stor', 'انباری'], ['elev', 'آسانسور']].forEach(function (x) {
      if (c[x[0]] === NEED[0]) { tot++; if (f[x[0]] === 'دارد') ok++; else miss.push(x[1]); }
    });
    return { sc: tot ? ok / tot : 1, miss: miss };
  }
  function line(main, r) {
    var pct = fa(Math.round(r.sc * 100)) + '٪';
    return '<div class="row" style="padding:5px 0;border-top:1px solid var(--bd);font-size:13px"><span>' + main +
      (r.miss.length ? '<div class="mu" style="font-size:11px">فرق دارد: ' + r.miss.join('، ') + '</div>' : '') +
      '</span><b style="color:var(--ac)">' + pct + '</b></div>';
  }
  function box(title, rows) {
    if (!rows.length) return '';
    rows.sort(function (a, b) { return b.r.sc - a.r.sc; });
    return '<details style="margin-top:8px"><summary class="mu" style="cursor:pointer">🎯 ' + title + ' (' + fa(rows.length) + ')</summary><div style="margin-top:4px">' +
      rows.slice(0, 10).map(function (x) { return line(x.h, x.r); }).join('') + '</div></details>';
  }
  function forCust(code) {
    var c = S.cust.find(function (x) { return x.code === code; });
    if (!c) return '';
    var rows = [];
    S.files.forEach(function (f) {
      var r = match(c, f);
      if (r) rows.push({ r: r, h: tag(f.code) + ' ' + esc(f.area) + ' · ' + fa(f.size) + ' متر · ' + fa(f.price) + ' تومان' });
    });
    return box('فایل‌های مناسب این مشتری', rows);
  }
  function forFile(code) {
    var f = S.files.find(function (x) { return x.code === code; });
    if (!f || f.st !== 'active') return '';
    var rows = [];
    S.cust.forEach(function (c) {
      var r = match(c, f);
      if (r) rows.push({ r: r, h: tag(c.code) + ' ' + esc(c.name) + (+c.bmax ? ' · تا ' + fa(c.bmax) + ' تومان' : '') });
    });
    return box('مشتری‌های مناسب این فایل', rows);
  }

  var origNote = window.noteBlk;
  window.noteBlk = function (k, code, note) {
    var b = origNote(k, code, note);
    if (k === 'm') return b + forCust(code);
    if (k === 'f') return b + forFile(code);
    return b;
  };

  /* ---------- فیلدهای فرم مشتری ---------- */
  function mk(f) {
    var lab = document.createElement('label'), el;
    if (f.t === 'num') el = '<input data-k="' + f.k + '" inputmode="decimal" data-num="1">';
    else {
      var o = f.t === 'hood'
        ? (S.hoods || []).slice().sort(function (a, b) { return (+String(a.code).slice(2) || 0) - (+String(b.code).slice(2) || 0); })
            .map(function (h) { return '<option value="' + h.code + '">' + h.code + ' · ' + esc(h.name) + '</option>'; }).join('')
        : f.o.map(function (x) { return '<option>' + x + '</option>'; }).join('');
      el = '<select data-k="' + f.k + '"><option value="">—</option>' + o + '</select>';
    }
    lab.innerHTML = f.l + el;
    return lab;
  }
  var GEN = [
    { k: 'bmax', l: 'حداکثر بودجه (تومان) — برای پیدا کردن خودکار فایل', t: 'num' },
    { k: 'smin', l: 'حداقل متراژ', t: 'num' },
    { k: 'hood', l: 'محله‌ی دلخواه', t: 'hood' }
  ];
  var APT = [
    { k: 'bed', l: 'حداقل تعداد خواب', o: BEDS },
    { k: 'dir', l: 'جهت دلخواه', o: DIRS },
    { k: 'park', l: 'پارکینگ', o: NEED },
    { k: 'stor', l: 'انباری', o: NEED },
    { k: 'elev', l: 'آسانسور', o: NEED }
  ];
  function inject(code) {
    var ms = document.querySelectorAll('.mo'), m = ms[ms.length - 1];
    if (!m) return;
    var c = code ? S.cust.find(function (x) { return x.code === code; }) : null;
    var anchor = m.querySelector('[data-k="area"]');
    if (!anchor) return;
    var after = anchor.parentNode, apt = [];
    function put(f, isA) {
      var lab = mk(f);
      after.parentNode.insertBefore(lab, after.nextSibling);
      after = lab;
      if (isA) apt.push(lab);
      var e = lab.querySelector('[data-k]');
      if (c && c[f.k]) e.value = f.t === 'num' ? fmtNum(c[f.k]) : c[f.k];
    }
    GEN.forEach(function (f) { put(f, false); });
    APT.forEach(function (f) { put(f, true); });
    var cs = m.querySelector('[data-k="cat"]');
    var tg = function () {
      var cat = cs ? cs.value : (c && c.cat);
      apt.forEach(function (l) { l.style.display = isApt(cat) ? '' : 'none'; });
    };
    if (cs) cs.addEventListener('change', tg);
    tg();
  }
  var oa = window.addCust, oe = window.editCust;
  window.addCust = function () { oa.apply(this, arguments); inject(null); };
  window.editCust = function (code) { oe.apply(this, arguments); inject(code); };
})();

/* ===== ارتباطات: ۱۶ گروه، هر کدام با فیلدهای مخصوص خودش ===== */
(function () {
  var CSL = ['فقط شماره دارم', 'تماس گرفته شده', 'همکاری داریم'];
  var YN = ['دارد', 'ندارد'];
  var SCORE = [];
  for (var i = 1; i <= 10; i++) SCORE.push([String(i), fa(i)]);

  var T = function (k, l) { return { k: k, l: l }; };
  var N = function (k, l) { return { k: k, l: l, t: 'num' }; };
  var D = function (k, l) { return { k: k, l: l, t: 'date' }; };
  var L = function (k, l, o, x) { return { k: k, l: l, t: 'sel', o: o, x: x }; };
  var R = function (k, l) { return { k: k, l: l, t: 'sel', o: SCORE, sc: 1 }; };

  var G = [
    { c: 'A', n: 'مدیر املاک‌ها', f: [T('a_office', 'نام املاک'), T('a_area', 'منطقه‌ی فعالیت یا آدرس املاک'), N('a_years', 'سابقه‌ی فعالیت (سال)'), N('a_staff', 'تعداد افراد فعال در املاک')] },
    { c: 'B', n: 'مشاور املاک‌ها', f: [N('b_years', 'سابقه‌ی کل در کار املاک (سال)'), T('b_cur', 'املاک فعلی')],
      list: { k: 'b_prev', l: 'سوابق قبلی (املاک‌هایی که قبلاً کار کرده)', add: '＋ افزودن سابقه', cols: [{ k: 'n', l: 'نام املاک' }, { k: 'a', l: 'منطقه' }, { k: 'd', l: 'مدت (چند سال یا از چه سالی تا چه سالی)' }] } },
    { c: 'C', n: 'مدیر ساختمان‌ها', f: [T('c_name', 'نام ساختمان'), T('c_addr', 'آدرس ساختمان'), N('c_floors', 'تعداد طبقه'), N('c_units', 'تعداد واحد')] },
    { c: 'D', n: 'مالک‌ها', f: [],
      list: { k: 'd_props', l: 'ملک‌ها (تعداد ملک خودکار حساب می‌شود)', add: '＋ افزودن ملک', cols: [{ k: 'a', l: 'آدرس ملک' }, { k: 't', l: 'نوع ملک', o: ['آپارتمان', 'ویلایی', 'زمین', 'مغازه/تجاری', 'اداری', 'صنعتی', 'کشاورزی'] }] } },
    { c: 'E', n: 'مستأجرها', f: [D('e_start', 'تاریخ قرارداد مستأجری'), D('e_end', 'تاریخ پایان قرارداد'), N('e_family', 'تعداد اعضای خانواده'), N('e_deposit', 'مبلغ رهن (تومان)'), N('e_rent', 'مبلغ اجاره‌ی ماهانه (تومان)')] },
    { c: 'F', n: 'مشتری‌های ثابت', f: [N('f_deals', 'تعداد معاملات انجام‌شده با ما'), L('f_type', 'نوع معامله‌ی قبلی', ['خرید', 'فروش', 'اجاره']), D('f_last', 'تاریخ آخرین معامله'), D('f_birth', 'تاریخ تولد'), N('f_refs', 'تعداد مشتری‌هایی که معرفی کرده')] },
    { c: 'G', n: 'سازنده‌ها و پیمانکارها', f: [T('g_company', 'نام شرکت یا تیم'), L('g_kind', 'نوع کار', ['ساخت', 'بازسازی', 'پیمانکاری']), T('g_spec', 'تخصص (اسکلت، نازک‌کاری، تأسیسات و...)'), N('g_active', 'تعداد فعالیت‌های فعال (پروژه‌های در حال انجام)'), N('g_years', 'سابقه‌ی کار (سال)'), N('g_workers', 'تعداد نیروی کار'), R('g_score', 'امتیاز کیفیت کار (۱ تا ۱۰)')] },
    { c: 'H', n: 'مهندس‌ها', f: [L('h_field', 'رشته‌ی مهندسی', ['عمران', 'معماری', 'تأسیسات', 'برق', 'مکانیک', 'نقشه‌برداری', 'شهرسازی', 'نقشه‌کش', 'سایر'], 1), N('h_years', 'سابقه‌ی کار (سال)'), N('h_active', 'تعداد پروژه‌های فعال')] },
    { c: 'I', n: 'مصالح‌فروش‌ها', f: [T('i_shop', 'نام فروشگاه یا شرکت'), T('i_kind', 'نوع مصالح (آهن، سیمان، سرامیک، لوله و...)'), T('i_addr', 'آدرس فروشگاه'), N('i_years', 'سابقه‌ی کار (سال)'), L('i_deliver', 'امکان حمل و تحویل', YN), L('i_credit', 'امکان خرید اقساطی یا نسیه', YN), T('i_disc', 'تخفیف یا سهم همکاری با ما'), R('i_score', 'امتیاز کیفیت و قیمت (۱ تا ۱۰)')] },
    { c: 'J', n: 'دفتر اسناد رسمی', f: [T('j_office', 'نام دفتر'), T('j_no', 'شماره‌ی دفترخانه (کد دفتر)'), T('j_addr', 'آدرس'), N('j_years', 'سابقه‌ی کار (سال)'), T('j_cert', 'مدرک'), T('j_mgr', 'مدیر دفتر'), N('j_staff', 'تعداد اعضای دفتر'), R('j_speed', 'سرعت و روانی انجام کار (۱ تا ۱۰)'), T('j_coop', 'همکاری و تخفیف با ما')] },
    { c: 'K', n: 'وکیل و مشاور حقوقی', f: [T('k_addr', 'آدرس دفتر'), L('k_field', 'زمینه‌ی فعالیت', ['ملکی و ثبتی', 'خانواده', 'کیفری', 'تجاری', 'اداری', 'سایر'], 1), N('k_years', 'سابقه‌ی کار (سال)'), T('k_fee', 'هزینه‌ی مشاوره یا حق‌الوکاله'), T('k_coop', 'همکاری و تخفیف با ما')] },
    { c: 'L', n: 'کارمندان ادارات', f: [T('l_office', 'نام اداره و واحد کاری'), T('l_post', 'سمت یا عنوان شغلی'), T('l_help', 'نوع کمکی که می‌تواند بکند (استعلام، پیگیری، مجوز)'), N('l_years', 'سابقه‌ی کار (سال)')] },
    { c: 'M', n: 'شوراها و دهیارها', f: [L('m_type', 'نوع', ['شورا', 'دهیار']), T('m_village', 'نام روستا'), N('m_pop', 'جمعیت یا تعداد خانوار روستا'), T('m_help', 'نوع کمکی که می‌تواند بکند (استعلام، مجوز، معرفی مالک)')] },
    { c: 'N', n: 'سرمایه‌گذارها', f: [N('n_budget', 'بودجه‌ی تقریبی سرمایه‌گذاری (تومان)'), L('n_type', 'نوع ملک مورد علاقه', ['آپارتمان', 'زمین', 'ویلا', 'تجاری']), T('n_area', 'منطقه‌ی مورد علاقه'), L('n_kind', 'نوع سرمایه‌گذاری', ['خرید و نگهداری', 'خرید و فروش', 'ساخت‌وساز']), L('n_speed', 'سرعت تصمیم‌گیری', ['سریع', 'متوسط', 'کند']), N('n_deals', 'تعداد معاملات قبلی با ما'), T('n_job', 'شغل یا کسب‌وکار'), T('n_know', 'نحوه‌ی آشنایی')] },
    { c: 'O', n: 'معرف‌های مردمی', f: [T('o_job', 'شغل یا کسب‌وکار'), T('o_area', 'محله یا منطقه‌ای که در آن نفوذ دارد'), T('o_rel', 'نسبت یا نحوه‌ی آشنایی با ما'), D('o_last', 'تاریخ آخرین معرفی'), N('o_cust', 'تعداد مشتری‌هایی که معرفی کرده'), N('o_files', 'تعداد فایل‌هایی که معرفی کرده'), N('o_deals', 'تعداد معاملات بسته‌شده از معرفی‌هایش'), T('o_share', 'سهم یا پاداش معرفی (درصد یا مبلغ)')] },
    { c: 'P', n: 'خدماتی‌ها', f: [L('p_kind', 'نوع خدمت', ['تأسیسات (لوله‌کشی، شوفاژ)', 'برق‌کار', 'نقاش ساختمان', 'کاشی و سرامیک', 'کابینت و نجاری', 'درب و پنجره', 'نظافت', 'اسباب‌کشی و باربری', 'باغبانی و محوطه‌سازی', 'تعمیرات عمومی', 'سایر'], 1), N('p_years', 'سابقه‌ی کار (سال)'), T('p_area', 'منطقه‌ی فعالیت'), R('p_speed', 'سرعت پاسخگویی و در دسترس بودن (۱ تا ۱۰)'), R('p_score', 'امتیاز کیفیت کار (۱ تا ۱۰)'), N('p_workers', 'تعداد کارگر یا نیروی کار'), T('p_coop', 'همکاری و تخفیف با ما'), D('p_last', 'تاریخ آخرین کار مشترک با ما')] }
  ];
  var GM = {};
  G.forEach(function (g) { GM[g.c] = g; });
  var OLD = { A: 'C', B: 'N', C: 'M', D: 'B', E: 'G', F: 'J', G: 'H', H: 'P', I: 'O' };

  /* لیست گروه‌ها (همان RC برنامه) */
  Object.keys(RC).forEach(function (k) { delete RC[k]; });
  G.forEach(function (g) { RC[g.c] = g.n; });

  function newCode(cat) {
    var m = 0, re = new RegExp('^R-' + cat + '(\\d+)$');
    S.cons.forEach(function (c) { var x = re.exec(c.code || ''); if (x) m = Math.max(m, +x[1]); });
    S.cnt = S.cnt || {};
    S.cnt['R' + cat] = m + 1;
    return 'R-' + cat + (m + 1);
  }

  /* انتقال ارتباط‌های قبلی به گروه‌های جدید (هر مورد فقط یک بار) */
  function mig() {
    var ch = false;
    (S.cons || []).forEach(function (c) {
      if (c.g2) return;
      var n = OLD[c.cat];
      if (!n) { c.g2 = 1; ch = true; return; }
      c.cat = n;
      if (c.area) { c.note = (c.note ? c.note + '\n' : '') + 'منطقه: ' + c.area; delete c.area; }
      c.code = newCode(n);
      c.g2 = 1;
      ch = true;
    });
    if (ch) save();
  }

  function selHTML(o) {
    return '<option value="">—</option>' + o.map(function (x) {
      return Array.isArray(x) ? '<option value="' + x[0] + '">' + x[1] + '</option>' : '<option>' + x + '</option>';
    }).join('');
  }
  function ff(f, c) {
    if (f.t === 'num') return { k: f.k, l: f.l, t: 'number' };
    if (f.t === 'date') return { k: f.k, l: f.l, t: 'date', d: c && c[f.k] || undefined };
    if (f.t === 'sel') return { k: f.k, l: f.l, t: 's', o: selHTML(f.o) };
    return { k: f.k, l: f.l };
  }

  /* ردیف‌های قابل افزودن (سوابق مشاور، ملک‌های مالک) */
  function listWidget(modal, spec, initial) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:9px';
    wrap.innerHTML = '<div class="mu" style="margin-bottom:4px">' + spec.l + '</div><div data-rows></div><button type="button" class="btn g" data-add style="padding:4px 10px;font-size:12px">' + spec.add + '</button><input type="hidden" data-k="' + spec.k + '">';
    var rows = wrap.querySelector('[data-rows]'), hid = wrap.querySelector('[data-k]');
    function sync() {
      var arr = [].slice.call(rows.children).map(function (r) {
        var o = {};
        [].slice.call(r.querySelectorAll('[data-c]')).forEach(function (e) { o[e.dataset.c] = e.value.trim(); });
        return o;
      }).filter(function (o) { return Object.keys(o).some(function (k) { return o[k]; }); });
      hid.value = JSON.stringify(arr);
    }
    function add(v) {
      var r = document.createElement('div');
      r.style.cssText = 'border:1px solid var(--bd);border-radius:10px;padding:8px;margin-bottom:6px';
      r.innerHTML = spec.cols.map(function (c) {
        return '<label style="margin-bottom:6px">' + c.l + (c.o ? '<select data-c="' + c.k + '"><option value="">—</option>' + c.o.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select>' : '<input data-c="' + c.k + '">') + '</label>';
      }).join('') + '<button type="button" class="btn g" data-del style="padding:2px 10px;font-size:12px">حذف این ردیف</button>';
      [].slice.call(r.querySelectorAll('[data-c]')).forEach(function (e) {
        if (v && v[e.dataset.c] != null) e.value = v[e.dataset.c];
        e.addEventListener('input', sync);
        e.addEventListener('change', sync);
      });
      r.querySelector('[data-del]').onclick = function () { r.remove(); sync(); };
      rows.appendChild(r);
      sync();
    }
    (initial || []).forEach(add);
    wrap.querySelector('[data-add]').onclick = function () { add(); };
    var anchor = modal.querySelector('[data-k="cs"]');
    anchor.parentNode.parentNode.insertBefore(wrap, anchor.parentNode);
    sync();
  }

  function openCon(code, cat) {
    var o = code ? S.cons.find(function (x) { return x.code === code; }) : null;
    if (code && !o) return;
    cat = o ? o.cat : cat;
    var g = GM[cat];
    if (!g) return;
    var fields = [{ k: 'name', l: 'نام و نام خانوادگی' }, { k: 'phone', l: 'شماره‌ی اول', t: 'tel' }, { k: 'phone2', l: 'شماره‌ی دوم (اختیاری)', t: 'tel' }]
      .concat(g.f.map(function (f) { return ff(f, o); }))
      .concat([
        { k: 'cs', l: 'وضعیت ارتباط', t: 's', o: CSL.map(function (x) { return '<option>' + x + '</option>'; }).join('') },
        { k: 'rd', l: 'تاریخ ثبت', t: 'date', d: (o && o.rd) || iso(new Date()) },
        { k: 'note', l: 'توضیحات', t: 'a' }
      ]);
    form(o ? 'ویرایش ارتباط ' + code + ' — ' + g.n : 'ارتباط جدید — ' + g.n, fields, function (v) {
      var d = {};
      ['name', 'phone', 'phone2', 'cs', 'rd', 'note'].forEach(function (k) { d[k] = v[k] || ''; });
      g.f.forEach(function (f) { d[f.k] = v[f.k] || ''; if (f.x) d[f.k + '_x'] = v[f.k + '_x'] || ''; });
      if (g.list) { var a = []; try { a = JSON.parse(v[g.list.k] || '[]'); } catch (e) {} d[g.list.k] = a; }
      if (!d.rd) d.rd = (o && o.rd) || iso(new Date());
      if (!d.cs) d.cs = CSL[0];
      d.g2 = 1;
      if (o) Object.assign(o, d); else { d.cat = cat; d.code = newCode(cat); S.cons.push(d); }
    }, 'ذخیره');
    var ms = document.querySelectorAll('.mo'), m = ms[ms.length - 1];
    if (!m) return;
    g.f.forEach(function (f) {
      if (!f.x) return;
      var sel = m.querySelector('[data-k="' + f.k + '"]');
      var lab = document.createElement('label');
      lab.innerHTML = 'مورد دلخواه را بنویسید<input data-k="' + f.k + '_x">';
      sel.parentNode.parentNode.insertBefore(lab, sel.parentNode.nextSibling);
      var tg = function () { lab.style.display = sel.value === 'سایر' ? '' : 'none'; };
      sel.addEventListener('change', tg);
      lab.tg = tg;
    });
    if (g.list) listWidget(m, g.list, o && o[g.list.k]);
    if (o) {
      var keys = ['name', 'phone', 'phone2', 'cs', 'note'];
      g.f.forEach(function (f) { if (f.t !== 'date') keys.push(f.k); if (f.x) keys.push(f.k + '_x'); });
      fillF(o, keys);
    }
    g.f.forEach(function (f) { if (f.x) { var sel = m.querySelector('[data-k="' + f.k + '"]'); sel.dispatchEvent(new Event('change')); } });
  }

  window.addCon = function () {
    mig();
    form('ارتباط جدید', [{ k: 'cat', l: 'گروه ارتباط', t: 's', o: opts(RC) }], function (v) {
      if (v.cat && GM[v.cat]) openCon(null, v.cat);
    }, 'ادامه');
    if (GM[S.cat]) fillF({ cat: S.cat }, ['cat']);
  };
  window.editCon = function (code) { mig(); openCon(code); };

  /* نمایش */
  function fv(f, c) {
    var v = c[f.k];
    if (v === undefined || v === null || v === '') return '';
    if (f.t === 'num') return fa(v);
    if (f.t === 'date') return jd(v);
    if (f.sc) return fa(v) + ' از ۱۰';
    if (f.x && v === 'سایر') return esc(c[f.k + '_x'] || 'سایر');
    return esc(v);
  }
  function leaseDays(c) {
    if (c.cat !== 'E' || !c.e_end) return null;
    return Math.round((new Date(c.e_end + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5);
  }
  function leaseText(d) { return d >= 0 ? fa(d) + ' روز تا پایان قرارداد' : 'قرارداد ' + fa(-d) + ' روز پیش تمام شده'; }
  function details(c) {
    var g = GM[c.cat];
    if (!g) return '';
    var pcs = g.f.map(function (f) { var v = fv(f, c); return v ? '<span>' + esc(f.l) + ': <b style="font-weight:600;color:var(--tx)">' + v + '</b></span>' : ''; }).filter(Boolean);
    var out = '';
    if (c.cat === 'D') {
      var pr = c.d_props || [];
      pcs.push('<span>تعداد ملک: <b style="font-weight:600;color:var(--tx)">' + fa(pr.length) + '</b></span>');
      out += pr.map(function (p) { return '<div class="mu" style="font-size:12px">· ' + esc(p.t || 'ملک') + (p.a ? ' — ' + esc(p.a) : '') + '</div>'; }).join('');
    }
    if (c.cat === 'B') {
      var pv = c.b_prev || [];
      if (pv.length) pcs.push('<span>سوابق قبلی: <b style="font-weight:600;color:var(--tx)">' + fa(pv.length) + ' املاک</b></span>');
      out += pv.map(function (p) { return '<div class="mu" style="font-size:12px">· ' + esc(p.n || 'املاک') + (p.a ? ' — ' + esc(p.a) : '') + (p.d ? ' · ' + esc(p.d) : '') + '</div>'; }).join('');
    }
    return (pcs.length ? '<div class="mu" style="display:flex;flex-wrap:wrap;gap:2px 12px;margin-top:4px">' + pcs.join('') + '</div>' : '') + out;
  }

  window.consV = function () {
    mig();
    var cf = S.csf || '*', bs = 'padding:2px 10px;font-size:12px';
    var base = flt(S.cons);
    var cnt = function (x) { return base.filter(function (c) { return (c.cs || CSL[0]) === x; }).length; };
    var list = base.filter(function (c) { return cf === '*' || (c.cs || CSL[0]) === cf; });
    var sc = '<div class="chips">' + [['*', 'همه', base.length]].concat(CSL.map(function (x) { return [x, x, cnt(x)]; })).map(function (x) {
      return '<button class="' + (cf === x[0] ? 'on' : '') + '" onclick="S.csf=\'' + x[0] + '\';render()">' + x[1] + ' (' + fa(x[2]) + ')</button>';
    }).join('') + '</div>';
    var tl = function (p) { return '<a href="tel:' + esc(normD(p)) + '" style="color:var(--ac);font-weight:600">' + esc(p) + '</a>'; };
    var cards = list.map(function (c) {
      var cs = c.cs || CSL[0], ld = leaseDays(c);
      return '<div class="card"><div class="row"><div><b>' + esc(c.name) + '</b><div class="mu">' + esc(RC[c.cat] || '') + '</div>' +
        (S.admin && (c.phone || c.phone2) ? '<div class="mu">تلفن: ' + [c.phone, c.phone2].filter(Boolean).map(tl).join(' · ') + '</div>' : '') +
        details(c) +
        (ld !== null && ld <= 61 && ld >= -30 ? '<div style="margin-top:6px"><span class="st r">' + leaseText(ld) + '</span></div>' : '') +
        '<div class="mu" style="margin-top:4px">ثبت: ' + jd(c.rd) + '</div></div><div style="text-align:left">' + tag(c.code) +
        '<div style="margin-top:6px"><span class="st ' + (cs === CSL[2] ? 'g' : cs === CSL[1] ? 'y' : '') + '">' + cs + '</span></div>' +
        '<div style="margin-top:8px"><button class="btn g" style="' + bs + '" onclick="editCon(\'' + c.code + '\')">ویرایش</button></div>' +
        '<div style="margin-top:6px"><button class="btn g" style="' + bs + '" onclick="delCon(\'' + c.code + '\')">حذف</button></div></div></div>' +
        noteBlk('r', c.code, c.note) + '</div>';
    }).join('');
    return '<h2>ارتباطات <button class="btn" onclick="addCon()">افزودن</button></h2>' + chips(RC, S.cons) + sc +
      '<div class="mu" style="margin-bottom:8px">' + fa(list.length) + ' مورد</div>' + (cards || empty);
  };

  /* یادآوری تمدید قرارداد مستأجرها در داشبورد (از ۲ ماه مانده) */
  var od = window.dash;
  window.dash = function () {
    mig();
    var h = od();
    var items = S.cons.map(function (c) { return { c: c, d: leaseDays(c) }; })
      .filter(function (x) { return x.d !== null && x.d <= 61 && x.d >= -30; })
      .sort(function (a, b) { return a.d - b.d; });
    if (!items.length) return h;
    var card = '<div class="sec">تمدید قرارداد مستأجرها</div><div class="card warn">' + items.map(function (x) {
      return '<div class="mu" style="margin:4px 0">' + tag(x.c.code) + ' ' + esc(x.c.name) + ' · پایان قرارداد: ' + jd(x.c.e_end) + ' · ' + leaseText(x.d) + '</div>';
    }).join('') + '</div>';
    var mk = '<div class="sec">وضعیت دسته‌ها</div>', i = h.indexOf(mk);
    return i < 0 ? h + card : h.slice(0, i) + card + h.slice(i);
  };
})();
