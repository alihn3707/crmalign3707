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
