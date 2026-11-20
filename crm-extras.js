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
