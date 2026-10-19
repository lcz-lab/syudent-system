/* ======================================================
 * 主应用：公开门户 / 登录 / 路由 / 三角色视图 / 可视化大屏 / 工作流
 * ====================================================== */

const State = {
  user: null,          // student: {role:'student', stu}  其他: {role, account, name, dept}
  currentView: null,
  listFilter: { keyword: '', status: '', major: '' },
  checkinResult: null, // 扫码核验结果
  bsTimer: null,
  bsClock: null,
};

/* ---------------- 通用工具 ---------------- */
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function showModal({ title, body, footer, wide, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'modal-lg' : ''}">
      <div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close">✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    </div>`;
  const bodyEl = typeof body === 'string' ? document.createElement('div') : body;
  if (typeof body === 'string') bodyEl.innerHTML = body;
  overlay.querySelector('.modal-body').appendChild(bodyEl);
  if (footer) {
    const fEl = typeof footer === 'string' ? document.createElement('div') : footer;
    if (typeof footer === 'string') fEl.innerHTML = footer;
    fEl.style.display = 'contents';
    overlay.querySelector('.modal-footer').appendChild(fEl);
  }
  const close = () => { overlay.remove(); onClose && onClose(); };
  overlay.querySelector('.modal-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  $('#modal-root').appendChild(overlay);
  return { overlay, close };
}

function confirmDialog(msg, onOk) {
  const box = document.createElement('div');
  box.innerHTML = `<p style="line-height:1.8">${esc(msg)}</p>`;
  const btnOk = document.createElement('button');
  btnOk.className = 'btn btn-danger'; btnOk.textContent = '确定';
  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-ghost'; btnCancel.textContent = '取消';
  btnCancel.onclick = () => h.close();
  btnOk.onclick = () => { h.close(); onOk(); };
  const h = showModal({ title: '操作确认', body: box, footer: null });
  h.overlay.querySelector('.modal-footer').appendChild(btnCancel);
  h.overlay.querySelector('.modal-footer').appendChild(btnOk);
}

function statusTag(online, offline) {
  const map = { '未填报': 'gray', '待审核': 'yellow', '已驳回': 'red', '预报到完成': 'green' };
  if (offline === '已报到') return `<span class="tag green">已现场报到</span>`;
  return `<span class="tag ${map[online] || 'gray'}">${esc(online)}</span>`;
}
function offlineTag(s) { return s === '已报到' ? `<span class="tag green">已报到</span>` : `<span class="tag gray">未报到</span>`; }
function matStatusTag(s) {
  const map = { '待审核': 'yellow', '通过': 'green', '驳回': 'red' };
  return `<span class="tag ${map[s] || 'gray'}">${esc(s)}</span>`;
}

function myStudent() { return State.user && State.user.role === 'student' ? State.user.stu : null; }
function isAdmin() { return State.user && State.user.role === 'admin'; }
function isCounselor() { return State.user && State.user.role === 'counselor'; }

// 本院学生（辅导员）
function deptStudents() {
  return DB.students.filter(s => s.dept === State.user.dept).sort((a, b) => a.id.localeCompare(b.id));
}

// 学生通知未读数
function unreadCount(stuId) {
  const read = getReadSet();
  return noticesForStudent(stuId).filter(n => !read.has(n.id)).length;
}

/* ======================================================
 * 公开迎新门户页
 * ====================================================== */
function initPublic() {
  // 轮播
  const slides = $$('#pub-slides .pub-slide');
  const dots = $('#pub-dots');
  dots.innerHTML = slides.map((_, i) => `<span class="${i === 0 ? 'on' : ''}" data-i="${i}"></span>`).join('');
  let cur = 0;
  function go(i) {
    cur = i % slides.length;
    slides.forEach((s, k) => s.classList.toggle('active', k === cur));
    $$('#pub-dots span').forEach((d, k) => d.classList.toggle('on', k === cur));
  }
  $$('#pub-dots span').forEach(d => d.onclick = () => go(+d.dataset.i));
  setInterval(() => go(cur + 1), 4500);

  // 公告（已启用 & 全部范围）
  renderPublicNotices();
  $$('.pub-notice').forEach(n => n.onclick = () => n.classList.toggle('open'));

  // 角色入口 / 顶部登录按钮 → 打开登录弹窗
  $$('.pub-entry').forEach(e => e.onclick = () => openLogin(e.dataset.role));
  $('#pub-login-btn').onclick = () => openLogin('student');
}

function renderPublicNotices() {
  const list = DB.notices.filter(n => n.enabled && n.scope === 'all').sort((a, b) => b.publishTime - a.publishTime).slice(0, 5);
  $('#pub-notices').innerHTML = list.length ? list.map(n => `
    <div class="pub-notice">
      <div>
        <div class="n-title">📌 ${esc(n.title)}</div>
        <div class="n-content">${esc(n.content)}</div>
      </div>
      <span class="n-date">${fmtTime(n.publishTime)}</span>
    </div>`).join('') : '<div class="empty"><div class="empty-icon">📢</div>暂无公告</div>';
  $$('.pub-notice').forEach(n => n.onclick = () => n.classList.toggle('open'));
}

/* ---------------- 登录 ---------------- */
const LOGIN_HINTS = {
  student: '演示账号（学号 + 身份证后6位）：<br>S20250001 / 011234（预报到完成，含二维码）<br>S20250003 / 039012（已驳回，可演示重新提交）<br>S20250005 / 057890（未填报，可演示完整流程）',
  counselor: '演示账号（账号 + 密码）：<br>jsds01 / 123456（计算机学院）<br>dzds01 / 123456（电子工程学院）<br>jgds01 / 123456（经济管理学院）· wgds01 / 123456（外国语学院）',
  admin: '演示账号（账号 + 密码）：<br>admin / 123456<br>可进入数据导入、公告管理、报表导出与可视化大屏',
};

function openLogin(role) {
  $('#login-role').value = role;
  syncLoginUI();
  $('#login-overlay').classList.remove('hidden');
  setTimeout(() => $('#login-account').focus(), 50);
}

function syncLoginUI() {
  const role = $('#login-role').value;
  const isStu = role === 'student';
  $('#login-account-label').textContent = isStu ? '学号' : '账号';
  $('#login-pwd-label').textContent = isStu ? '身份证后 6 位' : '密码';
  $('#login-account').placeholder = isStu ? '请输入学号，如 S20250001' : '请输入账号';
  $('#login-pwd').placeholder = isStu ? '请输入身份证后 6 位' : '请输入密码';
  $('#login-hint').innerHTML = LOGIN_HINTS[role] || '';
}

function initLoginModal() {
  $('#login-role').onchange = syncLoginUI;
  $('#login-close').onclick = () => $('#login-overlay').classList.add('hidden');
  $('#login-overlay').addEventListener('click', e => { if (e.target.id === 'login-overlay') $('#login-overlay').classList.add('hidden'); });
  $('#btn-login').onclick = doLogin;
  $('#login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#login-account').addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-pwd').focus(); });
}

function doLogin() {
  const role = $('#login-role').value;
  const account = $('#login-account').value.trim();
  const pwd = $('#login-pwd').value.trim();
  if (!account || !pwd) { toast('请输入完整的登录信息', 'error'); return; }

  if (role === 'student') {
    const stu = DB.students.find(s => s.id.toLowerCase() === account.toLowerCase());
    if (!stu) { toast('学号不存在，请核对后重试', 'error'); return; }
    if (stu.idCard.slice(-6).toUpperCase() !== pwd.toUpperCase()) { toast('身份证后 6 位不正确', 'error'); return; }
    State.user = { role: 'student', stu };
  } else {
    const acc = DB.accounts.find(a => a.account === account && a.pwd === pwd && a.role === role);
    if (!acc) { toast('账号或密码错误', 'error'); return; }
    State.user = acc;
  }

  $('#login-overlay').classList.add('hidden');
  $('#login-pwd').value = '';
  $('#public-view').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const name = State.user.role === 'student' ? State.user.stu.name : State.user.name;
  $('#user-name').textContent = name;
  $('#user-avatar').textContent = name.charAt(0);
  $('#user-role-text').textContent = { student: '新生', counselor: '辅导员', admin: '超级管理员' }[role]
    + (State.user.dept ? ` · ${State.user.dept}` : '');
  $('#btn-bigscreen').classList.toggle('hidden', role !== 'admin');
  renderNav();
  navigate(firstPageOf(role));
  toast(`欢迎，${name}`, 'success');
}

function firstPageOf(role) {
  return { student: 'myHome', counselor: 'stuList', admin: 'dataImport' }[role];
}

function doLogout() {
  State.user = null;
  State.checkinResult = null;
  stopBigScreen();
  Charts.destroyAll();
  $('#app').classList.add('hidden');
  $('#public-view').classList.remove('hidden');
  renderPublicNotices();
}

/* ======================================================
 * 导航
 * ====================================================== */
const NAV_ITEMS = {
  myHome:      { icon: '🏠', label: '报到首页', roles: ['student'] },
  myForm:      { icon: '📝', label: '信息填报', roles: ['student'] },
  myMaterials: { icon: '📎', label: '材料上传', roles: ['student'] },
  myMessages:  { icon: '🔔', label: '通知消息', roles: ['student'] },
  stuList:     { icon: '👥', label: '新生名单', roles: ['counselor'] },
  checkin:     { icon: '📷', label: '扫码核验', roles: ['counselor'] },
  exportC:     { icon: '📥', label: '数据导出', roles: ['counselor'] },
  dataImport:  { icon: '📤', label: '数据导入', roles: ['admin'] },
  accounts:    { icon: '👤', label: '账号管理', roles: ['admin'] },
  notices:     { icon: '📢', label: '公告管理', roles: ['admin'] },
  exportAll:   { icon: '📊', label: '报表导出', roles: ['admin'] },
};

function pagesOf(role) { return Object.keys(NAV_ITEMS).filter(k => NAV_ITEMS[k].roles.includes(role)); }

function renderNav() {
  const role = State.user.role;
  const read = role === 'student' ? unreadCount(myStudent().id) : 0;
  const pending = role === 'counselor' ? deptStudents().filter(s => s.onlineStatus === '待审核').length : 0;

  $('#nav-menu').innerHTML = pagesOf(role).map(p => {
    const it = NAV_ITEMS[p];
    let badge = '';
    if (p === 'myMessages' && read > 0) badge = `<span class="nav-badge">${read > 99 ? '99+' : read}</span>`;
    if (p === 'stuList' && pending > 0) badge = `<span class="nav-badge">${pending}</span>`;
    return `<div class="nav-item" data-view="${p}"><span class="nav-icon">${it.icon}</span><span>${it.label}</span>${badge}</div>`;
  }).join('');
  $$('.nav-item').forEach(el => el.onclick = () => navigate(el.dataset.view));
}

const RENDERERS = {};

function navigate(view) {
  State.currentView = view;
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('#breadcrumb').textContent = NAV_ITEMS[view].label;
  Charts.destroyAll();
  (RENDERERS[view] || (() => {}))();
  $('#content').scrollTop = 0;
}

/* ======================================================
 * 新生端
 * ====================================================== */

// 状态步条
function stepperHTML(stu) {
  const steps = ['信息填报', '材料审核', '预报到完成', '现场报到'];
  const st = stu.onlineStatus, off = stu.offlineStatus;
  const state = [
    stu.submitTime ? 'done' : 'current',
    st === '已驳回' ? 'reject' : (st === '预报到完成' || off === '已报到') ? 'done' : st === '待审核' ? 'current' : '',
    (st === '预报到完成' || off === '已报到') ? 'done' : '',
    off === '已报到' ? 'done' : st === '预报到完成' ? 'current' : '',
  ];
  return `<div class="stepper">${steps.map((s, i) => `
    <div class="step-node ${state[i]}">
      <div class="step-line"></div>
      <div class="step-dot">${state[i] === 'done' ? '✓' : i + 1}</div>
      <div class="step-label">${s}</div>
    </div>`).join('')}</div>`;
}

// 个人信息是否已完整填写
function formComplete(stu) {
  return stu.kaosheng && stu.hometown && stu.phone && stu.emergencyName && stu.emergencyPhone
    && Validators.kaosheng(stu.kaosheng) && Validators.phone(stu.phone) && Validators.phone(stu.emergencyPhone);
}

RENDERERS.myHome = function renderMyHome() {
  const stu = myStudent();
  const mats = materialsOf(stu.id);
  const reqReady = MATERIAL_TYPES.filter(t => t.required).filter(t => { const m = materialOf(stu.id, t.key); return m && m.fileName; }).length;
  const unread = unreadCount(stu.id);

  let statusBanner = '';
  if (stu.onlineStatus === '未填报') statusBanner = `<div class="card" style="border-left:4px solid var(--yellow);margin-bottom:16px">⏳ 你还未完成线上预报到，请先完成 <a href="javascript:;" onclick="navigate('myForm')">信息填报</a> 和 <a href="javascript:;" onclick="navigate('myMaterials')">材料上传</a>。</div>`;
  if (stu.onlineStatus === '待审核') statusBanner = `<div class="card" style="border-left:4px solid var(--yellow);margin-bottom:16px">📨 材料已提交，等待辅导员审核中，审核结果将通过【通知消息】告知。</div>`;
  if (stu.onlineStatus === '已驳回') statusBanner = `<div class="card" style="border-left:4px solid var(--red);margin-bottom:16px">❌ 材料审核<b>未通过</b>，请查看驳回原因并重新上传材料后再次提交。<a href="javascript:;" onclick="navigate('myMaterials')">前往处理 →</a></div>`;
  if (stu.offlineStatus === '已报到') statusBanner = `<div class="card" style="border-left:4px solid var(--green);margin-bottom:16px">🎉 恭喜你已完成现场报到，报到流程全部结束，开启美好的大学生活吧！</div>`;

  $('#content').innerHTML = `
    <div class="hero-banner">
      <div>
        <h2>你好，${esc(stu.name)} 同学 👋</h2>
        <p>${esc(stu.dept)} · ${esc(stu.major)} · 学号 ${esc(stu.id)}</p>
      </div>
      <div class="hero-date">2026 级新生线上报到<br>迎新工作办公室</div>
    </div>
    ${statusBanner}
    <div class="grid-2" style="grid-template-columns:1.4fr 1fr;margin-bottom:16px">
      <div class="card">
        <div class="card-title">📍 我的报到进度</div>
        ${stepperHTML(stu)}
        ${stu.onlineStatus === '已驳回' ? `<p style="font-size:12.5px;color:var(--red);margin-top:10px">驳回原因：${esc(materialsOf(stu.id).filter(m => m.status === '驳回' && m.remark).map(m => m.remark).join('；') || '材料不符合要求')}</p>` : ''}
      </div>
      <div class="card qr-box" id="qr-card">
        ${stu.qrToken && stu.onlineStatus === '预报到完成' ? `
          <div class="card-title" style="margin-bottom:0">🔲 我的报到二维码</div>
          <div class="qr-frame"><div id="qr-target"></div></div>
          <div style="font-size:13px;color:var(--text-sub)">现场报到时出示，由辅导员扫码核验</div>
          ${stu.offlineStatus === '已报到' ? '<span class="tag green">已完成现场报到 ✓</span>' : ''}
        ` : `
          <div class="card-title">🔲 报到二维码</div>
          <div class="empty" style="padding:30px 0"><div class="empty-icon">🔒</div>完成预报到审核后<br>将自动生成个人报到二维码</div>
        `}
      </div>
    </div>
    <div class="grid-3">
      <div class="card" style="cursor:pointer" onclick="navigate('myForm')">
        <div class="card-title">📝 信息填报</div>
        <div class="stat-num" style="font-size:18px">${formComplete(stu) && stu.submitTime ? '✅ 已提交' : stu.onlineStatus === '已驳回' ? '⚠️ 需检查' : formComplete(stu) ? '已填写未提交' : '待填写'}</div>
        <div class="stat-label" style="margin-top:6px">个人信息与联系方式</div>
      </div>
      <div class="card" style="cursor:pointer" onclick="navigate('myMaterials')">
        <div class="card-title">📎 材料上传</div>
        <div class="stat-num" style="font-size:18px">${reqReady} / 4 必传已传</div>
        <div class="stat-label" style="margin-top:6px">身份证 · 通知书 · 证件照</div>
      </div>
      <div class="card" style="cursor:pointer;position:relative" onclick="navigate('myMessages')">
        <div class="card-title">🔔 通知消息</div>
        <div class="stat-num" style="font-size:18px">${unread > 0 ? unread + ' 条未读' : '无未读'}</div>
        <div class="stat-label" style="margin-top:6px">公告与审核结果通知</div>
      </div>
    </div>`;

  if (stu.qrToken && stu.onlineStatus === '预报到完成' && $('#qr-target')) {
    new QRCode($('#qr-target'), { text: stu.qrToken, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
  }
};

/* ---------------- 信息填报 ---------------- */
RENDERERS.myForm = function renderMyForm() {
  const stu = myStudent();
  const locked = stu.onlineStatus === '待审核' || stu.onlineStatus === '预报到完成' || stu.offlineStatus === '已报到';

  $('#content').innerHTML = `
    <div class="card" style="max-width:860px;margin:0 auto">
      <div class="card-title">📝 个人信息填报</div>
      ${locked ? `<div class="tag yellow" style="margin-bottom:14px;display:inline-block">${stu.onlineStatus === '待审核' ? '材料审核中，信息已锁定' : '预报到已完成，信息已锁定'}</div>` : ''}
      ${stu.onlineStatus === '已驳回' ? `<div class="tag red" style="margin-bottom:14px;display:inline-block">材料被驳回，请核对信息并重新上传材料后提交</div>` : ''}
      <div class="form-grid">
        <div class="form-item"><label>学号</label><input value="${esc(stu.id)}" readonly><div class="tip">以录取数据为准，不可修改</div></div>
        <div class="form-item"><label>姓名</label><input value="${esc(stu.name)}" readonly></div>
        <div class="form-item"><label>性别</label><select id="f-gender" ${locked ? 'disabled' : ''}><option ${stu.gender === '男' ? 'selected' : ''}>男</option><option ${stu.gender === '女' ? 'selected' : ''}>女</option></select></div>
        <div class="form-item"><label>身份证号</label><input value="${esc(stu.idCard)}" readonly><div class="tip">仅展示前 4 位和后 6 位之外内容已脱敏存储</div></div>
        <div class="form-item"><label>院系</label><input value="${esc(stu.dept)}" readonly></div>
        <div class="form-item"><label>专业</label><input value="${esc(stu.major)}" readonly></div>
        <div class="form-item" id="fi-kaosheng"><label>考生号 <b style="color:var(--red)">*</b></label>
          <input id="f-kaosheng" value="${esc(stu.kaosheng || '')}" ${locked ? 'readonly' : ''} placeholder="请输入 10-16 位考生号"><div class="err">考生号须为 10-16 位数字</div></div>
        <div class="form-item" id="fi-hometown"><label>生源地 <b style="color:var(--red)">*</b></label>
          <input id="f-hometown" value="${esc(stu.hometown || '')}" ${locked ? 'readonly' : ''} placeholder="如：河北省石家庄市"><div class="err">请填写生源地</div></div>
        <div class="form-item" id="fi-phone"><label>本人手机号 <b style="color:var(--red)">*</b></label>
          <input id="f-phone" value="${esc(stu.phone || '')}" ${locked ? 'readonly' : ''} maxlength="11" placeholder="11 位手机号"><div class="err">请输入正确的 11 位手机号</div></div>
        <div class="form-item" id="fi-ename"><label>紧急联系人姓名 <b style="color:var(--red)">*</b></label>
          <input id="f-ename" value="${esc(stu.emergencyName || '')}" ${locked ? 'readonly' : ''} placeholder="一般为父母或亲属"><div class="err">请填写紧急联系人姓名</div></div>
        <div class="form-item" id="fi-ephone"><label>紧急联系人电话 <b style="color:var(--red)">*</b></label>
          <input id="f-ephone" value="${esc(stu.emergencyPhone || '')}" ${locked ? 'readonly' : ''} maxlength="11" placeholder="11 位手机号"><div class="err">请输入正确的 11 位手机号</div></div>
      </div>
      ${locked ? '' : `<div style="margin-top:20px;display:flex;gap:10px">
        <button class="btn btn-primary" id="f-submit">${stu.submitTime ? '重新提交并进入审核' : '提交并进入审核'}</button>
        <button class="btn btn-ghost" id="f-goto-mat">下一步：上传材料 →</button>
      </div>`}
    </div>`;

  if (!locked) {
    $('#f-goto-mat').onclick = () => navigate('myMaterials');
    $('#f-submit').onclick = () => submitAll(false);
  }
};

function readFormInputs() {
  return {
    gender: $('#f-gender') ? $('#f-gender').value : myStudent().gender,
    kaosheng: $('#f-kaosheng') ? $('#f-kaosheng').value.trim() : myStudent().kaosheng,
    hometown: $('#f-hometown') ? $('#f-hometown').value.trim() : myStudent().hometown,
    phone: $('#f-phone') ? $('#f-phone').value.trim() : myStudent().phone,
    emergencyName: $('#f-ename') ? $('#f-ename').value.trim() : myStudent().emergencyName,
    emergencyPhone: $('#f-ephone') ? $('#f-ephone').value.trim() : myStudent().emergencyPhone,
  };
}

function validateForm(data) {
  const checks = [
    ['fi-kaosheng', Validators.kaosheng(data.kaosheng)],
    ['fi-hometown', Validators.required(data.hometown)],
    ['fi-phone', Validators.phone(data.phone)],
    ['fi-ename', Validators.required(data.emergencyName)],
    ['fi-ephone', Validators.phone(data.emergencyPhone)],
  ];
  let ok = true;
  checks.forEach(([id, pass]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('invalid', !pass);
    if (!pass) ok = false;
  });
  return ok;
}

// 工作流①：提交填报 + 材料 → 待审核
function submitAll(fromMaterials) {
  const stu = myStudent();
  const data = readFormInputs();
  if (!validateForm(data)) { toast('请先完善个人填报信息（标红项）', 'error'); if (!fromMaterials) return; navigate('myForm'); return; }
  const missType = MATERIAL_TYPES.filter(t => t.required).find(t => { const m = materialOf(stu.id, t.key); return !m || !m.fileName; });
  if (missType) { toast(`必传材料「${missType.label}」尚未上传`, 'error'); navigate('myMaterials'); return; }
  submitStudentData(stu.id, data);
  toast('提交成功！材料已推送至辅导员待审核', 'success');
  navigate('myHome');
  renderNav();
}

/* ---------------- 材料上传 ---------------- */
const PreviewURLs = {};

RENDERERS.myMaterials = function renderMyMaterials() {
  const stu = myStudent();
  const locked = stu.onlineStatus === '待审核' || stu.onlineStatus === '预报到完成' || stu.offlineStatus === '已报到';
  const rejected = materialsOf(stu.id).filter(m => m.status === '驳回');

  $('#content').innerHTML = `
    <div class="card" style="max-width:860px;margin:0 auto">
      <div class="card-title">📎 报到材料上传</div>
      ${locked ? `<div class="tag yellow" style="margin-bottom:14px;display:inline-block">${stu.onlineStatus === '待审核' ? '材料审核中，暂不可修改' : '审核已通过，材料已锁定'}</div>` : ''}
      ${rejected.length ? `<div style="background:var(--red-light);border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:var(--red);line-height:1.8">
        <b>以下材料被驳回，请重新上传：</b><br>${rejected.map(m => `· ${esc(MATERIAL_TYPES.find(t => t.key === m.type).label)}：${esc(m.remark || '不符合要求')}`).join('<br>')}</div>` : ''}
      ${MATERIAL_TYPES.map(t => {
        const m = materialOf(stu.id, t.key);
        const has = m && m.fileName;
        const canEdit = !locked;
        return `
        <div class="material-item ${t.required && !has && !locked ? 'required-miss' : ''}">
          <div class="mat-thumb">${PreviewURLs[m && m.id] ? `<img src="${PreviewURLs[m.id]}">` : (has ? '🖼️' : '⬆️')}</div>
          <div class="mat-info">
            <div class="mat-name">${esc(t.label)} ${t.required ? '<span class="tag red" style="font-size:11px">必传</span>' : '<span class="tag gray" style="font-size:11px">选传</span>'}</div>
            <div class="mat-meta">${has ? `${esc(m.fileName)} · ${m.fileSize}KB · ${fmtTime(m.uploadTime)}` : '支持 JPG / PNG，≤ 5MB'}</div>
            ${m && m.status === '驳回' && m.remark ? `<div class="mat-remark">驳回原因：${esc(m.remark)}</div>` : ''}
          </div>
          <div class="mat-actions">
            ${m && m.fileName ? matStatusTag(m.status) : `<span class="tag gray">未上传</span>`}
            ${canEdit ? `<label class="btn btn-sm ${has ? 'btn-ghost' : 'btn-primary'}" style="margin:0">${has ? '重新上传' : '上传'}<input type="file" accept="image/*" hidden data-type="${t.key}"></label>` : ''}
          </div>
        </div>`;
      }).join('')}
      ${locked ? '' : `
      <div style="margin-top:18px;display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" id="m-submit">${stu.submitTime ? '重新提交并进入审核' : '提交并进入审核'}</button>
        <span style="font-size:12.5px;color:var(--text-sub)">提交前请确认个人信息已完善、4 项必传材料已上传</span>
      </div>`}
    </div>`;

  if (!locked) {
    $('#m-submit').onclick = () => submitAll(true);
    $$('#content input[type=file][data-type]').forEach(inp => {
      inp.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        if (!/^image\/(jpeg|png|jpg|webp)$/.test(file.type)) { toast('仅支持 JPG / PNG / WebP 图片格式', 'error'); e.target.value = ''; return; }
        if (file.size > 5 * 1024 * 1024) { toast('文件大小不能超过 5MB', 'error'); e.target.value = ''; return; }
        const stu2 = myStudent();
        let m = materialOf(stu2.id, inp.dataset.type);
        if (!m) {
          m = { id: uid('M'), studentId: stu2.id, type: inp.dataset.type, fileName: '', fileSize: 0, status: '待审核', reviewer: '', remark: '', reviewTime: null, uploadTime: null };
          DB.materials.push(m);
        }
        m.fileName = file.name;
        m.fileSize = Math.max(1, Math.round(file.size / 1024));
        m.uploadTime = Date.now();
        if (m.status === '驳回') { m.status = '待审核'; m.remark = ''; m.reviewer = ''; m.reviewTime = null; }
        if (PreviewURLs[m.id]) URL.revokeObjectURL(PreviewURLs[m.id]);
        PreviewURLs[m.id] = URL.createObjectURL(file);
        saveDB();
        toast('上传成功，确认无误后请点击提交', 'success');
        renderMyMaterials();
      };
    });
  }
};

/* ---------------- 通知消息 ---------------- */
RENDERERS.myMessages = function renderMyMessages() {
  const stu = myStudent();
  const read = getReadSet();
  const list = noticesForStudent(stu.id);

  $('#content').innerHTML = `
    <div class="card" style="max-width:860px;margin:0 auto">
      <div class="card-title" style="justify-content:space-between">🔔 通知消息
        <button class="btn btn-sm btn-ghost" id="msg-readall">全部标记已读</button>
      </div>
      ${list.length ? list.map(n => `
        <div class="notice-item ${read.has(n.id) ? '' : 'unread'}" data-id="${n.id}">
          <div class="notice-dot ${read.has(n.id) ? 'read' : ''}"></div>
          <div class="notice-body">
            <div class="notice-title">${esc(n.title)}</div>
            <div class="notice-text">${esc(n.content)}</div>
            <div class="notice-time">${esc(n.publisher)} · ${fmtTime(n.publishTime)}</div>
          </div>
        </div>`).join('') : '<div class="empty"><div class="empty-icon">📭</div>暂无通知消息</div>'}
    </div>`;

  $('#msg-readall').onclick = () => {
    const s = getReadSet();
    list.forEach(n => s.add(n.id));
    saveReadSet(s);
    renderMyMessages(); renderNav();
    toast('已全部标记为已读', 'success');
  };
  $$('#content .notice-item').forEach(el => {
    el.onclick = () => {
      const s = getReadSet();
      if (!s.has(el.dataset.id)) {
        s.add(el.dataset.id); saveReadSet(s);
        el.classList.remove('unread');
        el.querySelector('.notice-dot').classList.add('read');
        renderNav();
      }
    };
  });
};

/* ======================================================
 * 辅导员端
 * ====================================================== */
RENDERERS.stuList = function renderStuList() {
  const f = State.listFilter;
  let list = deptStudents();
  if (f.keyword) list = list.filter(s => s.name.includes(f.keyword) || s.id.toLowerCase().includes(f.keyword.toLowerCase()));
  if (f.status) list = list.filter(s => s.onlineStatus === f.status || (f.status === '已现场报到' && s.offlineStatus === '已报到'));
  if (f.major) list = list.filter(s => s.major === f.major);

  const all = deptStudents();
  const majors = [...new Set(all.map(s => s.major))];
  const cnt = k => all.filter(s => s.onlineStatus === k).length;

  $('#content').innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-icon" style="background:var(--blue-light)">👥</div><div><div class="stat-num">${all.length}</div><div class="stat-label">本院新生总数</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--yellow-light)">⏳</div><div><div class="stat-num">${cnt('待审核')}</div><div class="stat-label">待审核</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-light)">✅</div><div><div class="stat-num">${cnt('预报到完成')}</div><div class="stat-label">预报到完成</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--gray-light)">🏫</div><div><div class="stat-num">${all.filter(s => s.offlineStatus === '已报到').length}</div><div class="stat-label">已现场报到</div></div></div>
    </div>

    <div class="filter-bar">
      <input id="fl-kw" placeholder="搜索姓名 / 学号" value="${esc(f.keyword)}">
      <select id="fl-status">
        <option value="">全部状态</option>
        ${['未填报', '待审核', '已驳回', '预报到完成', '已现场报到'].map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <select id="fl-major"><option value="">全部专业</option>${majors.map(m => `<option ${f.major === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <div class="spacer"></div>
      <button class="btn btn-success" id="fl-batch">✓ 批量审核通过</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th style="width:34px"><input type="checkbox" id="ck-all"></th><th>学号</th><th>姓名</th><th>性别</th><th>专业</th><th>手机号</th><th>线上状态</th><th>现场报到</th><th>提交时间</th><th>操作</th></tr></thead>
        <tbody>
          ${list.length ? list.map(s => `
            <tr data-id="${s.id}">
              <td><input type="checkbox" class="ck-row" value="${s.id}" ${s.onlineStatus === '待审核' ? '' : 'disabled'}></td>
              <td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.gender)}</td><td>${esc(s.major)}</td><td>${esc(s.phone || '—')}</td>
              <td>${statusTag(s.onlineStatus, s.offlineStatus)}</td><td>${offlineTag(s.offlineStatus)}</td>
              <td>${fmtTime(s.submitTime)}</td>
              <td>
                <button class="btn btn-sm btn-ghost" onclick="showStudentDetail('${s.id}')">详情</button>
                ${s.onlineStatus === '待审核' || s.onlineStatus === '已驳回' ? `<button class="btn btn-sm btn-primary" onclick="showReviewModal('${s.id}')">审核</button>` : ''}
              </td>
            </tr>`).join('') : `<tr><td colspan="10"><div class="empty"><div class="empty-icon">🔍</div>没有符合条件的新生</div></td></tr>`}
        </tbody>
      </table>
    </div>`;

  $('#fl-kw').oninput = e => { State.listFilter.keyword = e.target.value.trim(); refreshListOnly(); };
  $('#fl-status').onchange = e => { State.listFilter.status = e.target.value; navigate('stuList'); };
  $('#fl-major').onchange = e => { State.listFilter.major = e.target.value; navigate('stuList'); };
  $('#ck-all').onchange = e => { $$('.ck-row:not(:disabled)').forEach(c => c.checked = e.target.checked); };
  $('#fl-batch').onclick = batchApprove;

  function refreshListOnly() {
    const kw = State.listFilter.keyword;
    let l = deptStudents();
    if (kw) l = l.filter(s => s.name.includes(kw) || s.id.toLowerCase().includes(kw.toLowerCase()));
    if (State.listFilter.status) l = l.filter(s => s.onlineStatus === State.listFilter.status || (State.listFilter.status === '已现场报到' && s.offlineStatus === '已报到'));
    if (State.listFilter.major) l = l.filter(s => s.major === State.listFilter.major);
    const tbody = $('#content tbody');
    tbody.querySelectorAll('tr').forEach(tr => tr.remove());
    tbody.insertAdjacentHTML('beforeend', l.length ? l.map(s => `
      <tr data-id="${s.id}">
        <td><input type="checkbox" class="ck-row" value="${s.id}" ${s.onlineStatus === '待审核' ? '' : 'disabled'}></td>
        <td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.gender)}</td><td>${esc(s.major)}</td><td>${esc(s.phone || '—')}</td>
        <td>${statusTag(s.onlineStatus, s.offlineStatus)}</td><td>${offlineTag(s.offlineStatus)}</td>
        <td>${fmtTime(s.submitTime)}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="showStudentDetail('${s.id}')">详情</button>
        ${s.onlineStatus === '待审核' || s.onlineStatus === '已驳回' ? `<button class="btn btn-sm btn-primary" onclick="showReviewModal('${s.id}')">审核</button>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="10"><div class="empty"><div class="empty-icon">🔍</div>没有符合条件的新生</div></td></tr>`);
  }
};

function batchApprove() {
  const ids = $$('.ck-row:checked').map(c => c.value);
  if (!ids.length) { toast('请勾选待审核的新生（仅待审核状态可批量审核）', 'error'); return; }
  confirmDialog(`确定将选中的 ${ids.length} 名新生材料批量审核通过吗？通过后将自动生成报到二维码。`, () => {
    ids.forEach(id => { const s = DB.students.find(x => x.id === id); if (s && s.onlineStatus === '待审核') approveStudent(id, State.user.name); });
    toast(`已批量通过 ${ids.length} 名新生`, 'success');
    navigate('stuList'); renderNav();
  });
}

// 审核弹窗
function showReviewModal(stuId) {
  const s = DB.students.find(x => x.id === stuId);
  const mats = materialsOf(stuId);
  const box = document.createElement('div');
  box.innerHTML = `
    <p style="margin-bottom:10px;line-height:1.9"><b>${esc(s.name)}</b>（${esc(s.id)}）· ${esc(s.dept)} ${esc(s.major)}<br>
    手机：${esc(s.phone || '—')} · 生源地：${esc(s.hometown || '—')} · 提交时间：${fmtTime(s.submitTime)}</p>
    <div style="margin-bottom:12px">${mats.length ? mats.map(m => `
      <div class="material-item" style="padding:9px 12px;margin-bottom:6px">
        <div class="mat-thumb" style="width:40px;height:40px;font-size:18px">${PreviewURLs[m.id] ? `<img src="${PreviewURLs[m.id]}">` : '🖼️'}</div>
        <div class="mat-info"><div class="mat-name" style="font-size:13px">${esc((MATERIAL_TYPES.find(t => t.key === m.type) || {}).label || m.type)}</div>
        <div class="mat-meta">${esc(m.fileName)} · ${m.fileSize}KB</div></div>
        ${matStatusTag(m.status)}
      </div>`).join('') : '<div class="empty">该生未上传材料</div>'}</div>
    <label>审核备注（驳回时必填，将通知学生）</label>
    <textarea id="rv-remark" placeholder="如：身份证照片模糊，请重新上传"></textarea>`;

  const btnPass = document.createElement('button');
  btnPass.className = 'btn btn-success'; btnPass.textContent = '✓ 审核通过';
  const btnReject = document.createElement('button');
  btnReject.className = 'btn btn-danger'; btnReject.textContent = '✕ 驳回材料';

  const h = showModal({ title: `材料审核 · ${s.name}`, body: box, footer: null });
  h.overlay.querySelector('.modal-footer').appendChild(btnReject);
  h.overlay.querySelector('.modal-footer').appendChild(btnPass);

  btnPass.onclick = () => {
    approveStudent(stuId, State.user.name);
    h.close(); toast(`已通过 ${s.name} 的材料审核，报到二维码已生成`, 'success');
    navigate('stuList'); renderNav();
  };
  btnReject.onclick = () => {
    const remark = $('#rv-remark', h.overlay).value.trim();
    if (!remark) { toast('驳回时必须填写备注原因', 'error'); return; }
    rejectStudent(stuId, remark, State.user.name);
    h.close(); toast(`已驳回 ${s.name} 的材料，驳回通知已发送`, 'success');
    navigate('stuList'); renderNav();
  };
}

// 详情弹窗
function showStudentDetail(stuId) {
  const s = DB.students.find(x => x.id === stuId);
  const mats = materialsOf(stuId);
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="form-grid" style="margin-bottom:14px">
      ${[['学号', s.id], ['姓名', s.name], ['性别', s.gender], ['身份证号', s.idCard.replace(/^(\d{6})\d{8}(\d{4})$/, '$1********$2')],
         ['院系', s.dept], ['专业', s.major], ['考生号', s.kaosheng || '—'], ['生源地', s.hometown || '—'],
         ['手机号', s.phone || '—'], ['紧急联系人', (s.emergencyName || '—') + ' ' + (s.emergencyPhone || '')],
         ['线上状态', s.onlineStatus], ['现场报到', s.offlineStatus === '已报到' ? '已报到（' + fmtTime(s.reportTime) + '）' : '未报到'],
         ['提交时间', fmtTime(s.submitTime)], ['二维码', s.qrToken || '未生成']]
        .map(([k, v]) => `<div class="form-item"><label>${k}</label><input value="${esc(v)}" readonly></div>`).join('')}
    </div>
    <div class="card-title">上传材料（${mats.length} 项）</div>
    ${mats.length ? mats.map(m => `
      <div class="material-item" style="padding:9px 12px;margin-bottom:6px">
        <div class="mat-thumb" style="width:40px;height:40px;font-size:18px">${PreviewURLs[m.id] ? `<img src="${PreviewURLs[m.id]}">` : '🖼️'}</div>
        <div class="mat-info"><div class="mat-name" style="font-size:13px">${esc((MATERIAL_TYPES.find(t => t.key === m.type) || {}).label || m.type)}</div>
        <div class="mat-meta">${esc(m.fileName)}${m.remark ? ' · 驳回：' + esc(m.remark) : ''}</div></div>
        ${matStatusTag(m.status)}
      </div>`).join('') : '<div class="empty">未上传材料</div>'}`;
  showModal({ title: `新生详情 · ${s.name}`, body: box, wide: true });
}

/* ---------------- 扫码核验 ---------------- */
RENDERERS.checkin = function renderCheckin() {
  const all = deptStudents();
  const done = all.filter(s => s.offlineStatus === '已报到').sort((a, b) => (b.reportTime || 0) - (a.reportTime || 0));
  const rate = all.length ? Math.round(done.length / all.length * 100) : 0;

  $('#content').innerHTML = `
    <div class="grid-3" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-icon" style="background:var(--blue-light)">👥</div><div><div class="stat-num">${all.length}</div><div class="stat-label">本院新生总数</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-light)">✅</div><div><div class="stat-num">${done.length}</div><div class="stat-label">已现场报到</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--yellow-light)">📈</div><div><div class="stat-num">${rate}%</div><div class="stat-label">现场报到率</div></div></div>
    </div>
    <div class="grid-2" style="grid-template-columns:1.2fr 1fr">
      <div class="card">
        <div class="card-title">📷 扫码核验报到</div>
        <div class="scan-box">
          <div class="scan-icon">📲</div>
          <p style="color:var(--text-sub);font-size:13px;margin-bottom:14px">新生出示个人报到二维码，扫码 / 扫码枪录入二维码内容，<br>或直接输入学号手动核验</p>
          <div class="scan-input" style="display:flex;gap:10px">
            <input id="ck-input" placeholder="输入二维码内容（XXU-YX|学号|…）或学号，如 S20250001">
            <button class="btn btn-primary" id="ck-btn">核 验</button>
          </div>
          <div id="ck-result" class="checkin-result">${checkinResultHTML()}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🕒 最新现场报到</div>
        ${done.length ? done.slice(0, 8).map(s => `
          <div class="notice-item" style="padding:10px 4px">
            <div class="notice-dot read"></div>
            <div class="notice-body">
              <div class="notice-title" style="font-size:13.5px">${esc(s.name)} <span style="font-weight:400;color:var(--text-sub)">· ${esc(s.id)} · ${esc(s.major)}</span></div>
              <div class="notice-time">${fmtTime(s.reportTime)} 完成现场报到</div>
            </div><span class="tag green">已报到</span>
          </div>`).join('') : '<div class="empty"><div class="empty-icon">🏫</div>暂无现场报到记录</div>'}
      </div>
    </div>`;

  $('#ck-btn').onclick = doCheckin;
  $('#ck-input').addEventListener('keydown', e => { if (e.key === 'Enter') doCheckin(); });
  $('#ck-input').focus();

  function doCheckin() {
    const input = $('#ck-input').value;
    if (!input.trim()) { toast('请输入二维码内容或学号', 'error'); return; }
    const sid = parseStuId(input);
    const s = DB.students.find(x => x.id.toLowerCase() === String(sid).toLowerCase());
    if (!s) { State.checkinResult = { ok: false, msg: `未找到学号为 ${sid} 的新生${isCounselor() ? '（仅可核验本院学生）' : ''}` }; }
    else if (s.onlineStatus !== '预报到完成') { State.checkinResult = { stu: s, ok: false, msg: '该新生尚未完成线上预报到，无法核验现场报到' }; }
    else if (s.offlineStatus === '已报到') { State.checkinResult = { stu: s, ok: false, msg: `该新生已于 ${fmtTime(s.reportTime)} 完成现场报到，请勿重复核验` }; }
    else State.checkinResult = { stu: s, ok: true };
    $('#ck-result').innerHTML = checkinResultHTML();
    bindResult();
  }

  function bindResult() {
    const btn = $('#ck-confirm');
    if (btn) btn.onclick = () => {
      const s = State.checkinResult.stu;
      confirmDialog(`确认为 ${s.name}（${s.id}）办理现场报到吗？`, () => {
        checkinStudent(s.id, State.user.name);
        toast(`${s.name} 现场报到核验完成`, 'success');
        State.checkinResult = null;
        navigate('checkin');
      });
    };
  }

  function checkinResultHTML() {
    const r = State.checkinResult;
    if (!r) return '';
    if (!r.stu) return `<div class="card" style="border-left:4px solid var(--red);margin-top:16px">❌ ${esc(r.msg)}</div>`;
    const s = r.stu;
    return `
      <div class="card" style="border-left:4px solid ${r.ok ? 'var(--green)' : 'var(--yellow)'};margin-top:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <div class="user-avatar" style="background:${r.ok ? 'var(--green)' : 'var(--yellow)'}">${esc(s.name.charAt(0))}</div>
          <div><div style="font-weight:700;font-size:15px">${esc(s.name)} · ${esc(s.id)}</div>
          <div style="font-size:12.5px;color:var(--text-sub)">${esc(s.dept)} · ${esc(s.major)} · ${esc(s.phone || '')}</div></div>
        </div>
        <p style="font-size:13px;line-height:2">线上状态：${statusTag(s.onlineStatus, s.offlineStatus)}　材料：${materialsOf(s.id).length} 项<br>
        ${r.ok ? '核验通过，可办理现场报到。' : `⚠️ ${esc(r.msg)}`}</p>
        ${r.ok ? '<button class="btn btn-success btn-block" id="ck-confirm">✓ 确认现场报到</button>' : ''}
      </div>`;
  }
};

/* ---------------- 数据导出（辅导员） ---------------- */
RENDERERS.exportC = function renderExportC() {
  const all = deptStudents();
  $('#content').innerHTML = `
    <div class="grid-2" style="max-width:860px;margin:0 auto">
      <div class="card">
        <div class="card-title">📥 本院新生名单</div>
        <p style="color:var(--text-sub);font-size:13px;line-height:1.9;margin-bottom:16px">导出本院全部 ${all.length} 名新生的完整信息，<br>含填报信息、预报到状态、现场报到状态。</p>
        <button class="btn btn-primary" id="exp-stu">导出 Excel 新生名单</button>
      </div>
      <div class="card">
        <div class="card-title">📎 材料审核明细</div>
        <p style="color:var(--text-sub);font-size:13px;line-height:1.9;margin-bottom:16px">导出本院新生全部材料记录，<br>含材料类型、审核状态、审核人与备注。</p>
        <button class="btn btn-primary" id="exp-mat">导出 Excel 材料明细</button>
      </div>
    </div>`;
  $('#exp-stu').onclick = () => exportStudentsExcel(all, `${State.user.dept}新生名单`);
  $('#exp-mat').onclick = () => exportMaterialsExcel(all, `${State.user.dept}材料审核明细`);
};

/* ---------------- 导出实现 ---------------- */
function exportStudentsExcel(list, filename) {
  if (typeof XLSX === 'undefined') { toast('导出组件未加载（需联网加载 CDN）', 'error'); return; }
  const rows = list.map(s => ({
    '学号': s.id, '姓名': s.name, '性别': s.gender, '身份证号': s.idCard, '考生号': s.kaosheng || '',
    '院系': s.dept, '专业': s.major, '生源地': s.hometown || '', '手机号': s.phone || '',
    '紧急联系人': s.emergencyName || '', '紧急联系人电话': s.emergencyPhone || '',
    '线上预报到状态': s.onlineStatus, '线下现场报到状态': s.offlineStatus,
    '提交时间': fmtTime(s.submitTime), '现场报到时间': fmtTime(s.reportTime),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '新生名单');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('导出成功', 'success');
}

function exportMaterialsExcel(students, filename) {
  if (typeof XLSX === 'undefined') { toast('导出组件未加载（需联网加载 CDN）', 'error'); return; }
  const ids = new Set(students.map(s => s.id));
  const rows = DB.materials.filter(m => ids.has(m.studentId)).map(m => {
    const s = DB.students.find(x => x.id === m.studentId) || {};
    return {
      '学号': s.id, '姓名': s.name, '院系': s.dept,
      '材料类型': (MATERIAL_TYPES.find(t => t.key === m.type) || {}).label || m.type,
      '文件名': m.fileName, '大小(KB)': m.fileSize,
      '审核状态': m.status, '审核人': m.reviewer || '', '审核备注': m.remark || '',
      '上传时间': fmtTime(m.uploadTime), '审核时间': fmtTime(m.reviewTime),
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '材料明细');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('导出成功', 'success');
}

/* ======================================================
 * 超级管理员端
 * ====================================================== */
RENDERERS.dataImport = function renderDataImport() {
  $('#content').innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-icon" style="background:var(--blue-light)">👥</div><div><div class="stat-num">${DB.students.length}</div><div class="stat-label">新生信息表 · 记录数</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--yellow-light)">📎</div><div><div class="stat-num">${DB.materials.length}</div><div class="stat-label">材料上传表 · 记录数</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-light)">📢</div><div><div class="stat-num">${DB.notices.length}</div><div class="stat-label">公告通知表 · 记录数</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--gray-light)">👤</div><div><div class="stat-num">${DB.accounts.length}</div><div class="stat-label">账号角色表 · 记录数</div></div></div>
    </div>
    <div class="grid-2" style="max-width:1000px">
      <div class="card">
        <div class="card-title">📤 批量导入新生名单</div>
        <p style="color:var(--text-sub);font-size:13px;line-height:1.9;margin-bottom:14px">
          Excel 列：学号*、姓名*、性别、身份证号*、院系*、专业*、生源地、手机号<br>
          导入后新生以「学号 + 身份证后 6 位」登录，初始状态为【未填报】。</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="imp-tpl">⬇️ 下载导入模板</button>
          <label class="btn btn-primary" style="margin:0">📂 选择 Excel 导入<input type="file" id="imp-file" accept=".xlsx,.xls,.csv" hidden></label>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🧪 演示数据</div>
        <p style="color:var(--text-sub);font-size:13px;line-height:1.9;margin-bottom:14px">
          快速生成模拟新生用于测试；重置将恢复到系统初始演示数据。</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="imp-mock">＋ 生成 50 条模拟新生</button>
          <button class="btn btn-danger" id="imp-reset">↺ 重置演示数据</button>
        </div>
      </div>
    </div>
    <div class="card" style="max-width:1000px;margin-top:16px">
      <div class="card-title">📋 操作日志</div>
      <pre id="imp-log" style="font-size:12.5px;line-height:2;color:var(--text-sub);white-space:pre-wrap;font-family:inherit">等待操作…</pre>
    </div>`;

  $('#imp-tpl').onclick = () => {
    if (typeof XLSX === 'undefined') { toast('组件未加载', 'error'); return; }
    const ws = XLSX.utils.aoa_to_sheet([['学号', '姓名', '性别', '身份证号', '院系', '专业', '生源地', '手机号'],
      ['S20259999', '张三', '男', '110101200701011234', '计算机学院', '软件工程', '北京市', '13800000000']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '新生名单');
    XLSX.writeFile(wb, '新生导入模板.xlsx');
  };

  $('#imp-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        let added = 0, skipped = 0, bad = 0;
        rows.forEach(r => {
          const id = String(r['学号'] || '').trim();
          const name = String(r['姓名'] || '').trim();
          const idCard = String(r['身份证号'] || '').trim();
          const dept = String(r['院系'] || '').trim();
          const major = String(r['专业'] || '').trim();
          if (!id || !name || !Validators.idCard(idCard) || !dept || !major) { bad++; return; }
          if (DB.students.some(s => s.id === id)) { skipped++; return; }
          DB.students.push({
            id, name, gender: String(r['性别'] || '').trim() || '男', idCard,
            kaosheng: '', dept, major, hometown: String(r['生源地'] || '').trim(),
            phone: String(r['手机号'] || '').trim(), emergencyName: '', emergencyPhone: '',
            submitTime: null, onlineStatus: '未填报', offlineStatus: '未报到', reportTime: null, qrToken: null,
          });
          added++;
        });
        saveDB();
        log(`📄 导入文件「${esc(f.name)}」：新增 ${added} 人，重复跳过 ${skipped} 人，格式错误 ${bad} 行`);
        toast(`导入完成：新增 ${added} 人`, 'success');
        renderDataImport();
      } catch (err) { toast('文件解析失败，请使用下载的模板格式', 'error'); }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = '';
  };

  $('#imp-mock').onclick = () => {
    let added = 0;
    const startIdx = DB.students.length + 1;
    for (let i = 0; i < 50; i++) {
      const dept = rand(DEPARTMENTS);
      const stu = seedStudentBase(startIdx + i, dept.name, rand(dept.majors));
      stu.onlineStatus = Math.random() < 0.5 ? '未填报' : Math.random() < 0.5 ? '待审核' : '预报到完成';
      if (stu.onlineStatus !== '未填报') {
        stu.submitTime = Date.now() - randInt(600, 86400 * 2) * 1000;
        DB.materials.push(...seedMaterials(stu, stu.onlineStatus));
      }
      if (stu.onlineStatus === '预报到完成') stu.qrToken = makeQRToken(stu.id);
      DB.students.push(stu);
      added++;
    }
    saveDB();
    log(`🧪 生成 ${added} 条模拟新生数据（学号 S2025${String(startIdx).padStart(4, '0')} 起）`);
    toast(`已生成 ${added} 条模拟数据`, 'success');
    renderDataImport();
  };

  $('#imp-reset').onclick = () => confirmDialog('重置将清空全部修改并恢复初始演示数据，确定继续吗？', () => {
    resetDB();
    PreviewURLsClear();
    log('↺ 已重置为初始演示数据');
    toast('已重置演示数据', 'success');
    renderDataImport();
  });

  function log(msg) { const el = $('#imp-log'); el.textContent = msg + '\n' + el.textContent; }
};

function PreviewURLsClear() { Object.keys(PreviewURLs).forEach(k => { URL.revokeObjectURL(PreviewURLs[k]); delete PreviewURLs[k]; }); }

/* ---------------- 账号管理 ---------------- */
RENDERERS.accounts = function renderAccounts() {
  $('#content').innerHTML = `
    <div class="grid-2" style="grid-template-columns:1fr 1.6fr;align-items:start">
      <div class="card">
        <div class="card-title">➕ 添加辅导员账号</div>
        <div class="form-item"><label>登录账号 *</label><input id="ac-account" placeholder="如 jsds02"></div>
        <div class="form-item"><label>姓名 *</label><input id="ac-name" placeholder="如 王老师"></div>
        <div class="form-item"><label>初始密码</label><input id="ac-pwd" value="123456"></div>
        <div class="form-item"><label>所属院系 *</label><select id="ac-dept">${DEPARTMENTS.map(d => `<option>${d.name}</option>`).join('')}</select></div>
        <button class="btn btn-primary btn-block" id="ac-add" style="margin-top:6px">添加账号</button>
        <p class="tip" style="margin-top:12px;font-size:12px;color:#94a3b8;line-height:1.8">新生无需单独建账号，<br>使用「学号 + 身份证后 6 位」直接登录。</p>
      </div>
      <div class="card">
        <div class="card-title">👤 账号列表（${DB.accounts.length}）</div>
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>账号</th><th>姓名</th><th>角色</th><th>所属院系</th><th>操作</th></tr></thead>
            <tbody>
              ${DB.accounts.map(a => `
                <tr>
                  <td>${esc(a.account)}</td><td>${esc(a.name)}</td>
                  <td><span class="tag ${a.role === 'admin' ? 'red' : 'blue'}">${a.role === 'admin' ? '超级管理员' : '辅导员'}</span></td>
                  <td>${esc(a.dept || '全校')}</td>
                  <td>
                    ${a.role !== 'admin' ? `<button class="btn btn-sm btn-ghost" onclick="resetAccountPwd('${esc(a.account)}')">重置密码</button>
                    <button class="btn btn-sm btn-ghost" onclick="deleteAccount('${esc(a.account)}')" style="color:var(--red)">删除</button>` : '<span style="color:#cbd5e1">—</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  $('#ac-add').onclick = () => {
    const account = $('#ac-account').value.trim();
    const name = $('#ac-name').value.trim();
    const pwd = $('#ac-pwd').value.trim() || '123456';
    const dept = $('#ac-dept').value;
    if (!account || !name) { toast('请填写账号和姓名', 'error'); return; }
    if (DB.accounts.some(a => a.account === account)) { toast('账号已存在', 'error'); return; }
    DB.accounts.push({ account, pwd, role: 'counselor', name, dept });
    saveDB();
    toast(`辅导员账号 ${account} 创建成功`, 'success');
    renderAccounts();
  };
};

window.resetAccountPwd = function (account) {
  const a = DB.accounts.find(x => x.account === account);
  confirmDialog(`确定将账号 ${account} 的密码重置为 123456 吗？`, () => {
    a.pwd = '123456'; saveDB(); toast('密码已重置为 123456', 'success');
    navigate('accounts');
  });
};
window.deleteAccount = function (account) {
  confirmDialog(`确定删除账号 ${account} 吗？删除后该辅导员将无法登录。`, () => {
    DB.accounts = DB.accounts.filter(x => x.account !== account);
    saveDB(); toast('账号已删除', 'success'); navigate('accounts');
  });
};

/* ---------------- 公告管理 ---------------- */
RENDERERS.notices = function renderNotices() {
  const list = [...DB.notices].sort((a, b) => b.publishTime - a.publishTime);
  $('#content').innerHTML = `
    <div class="card">
      <div class="card-title" style="justify-content:space-between">📢 公告管理
        <button class="btn btn-primary" id="nt-add">＋ 发布公告</button>
      </div>
      <div class="table-wrap" style="box-shadow:none">
        <table>
          <thead><tr><th>标题</th><th>发布人</th><th>发布时间</th><th>接收范围</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${list.length ? list.map(n => `
              <tr>
                <td style="max-width:320px;white-space:normal">${esc(n.title)}</td>
                <td>${esc(n.publisher)}</td><td>${fmtTime(n.publishTime)}</td>
                <td>${n.scope === 'all' ? '<span class="tag blue">全部新生</span>' : `<span class="tag gray">指定：${esc(n.scope)}</span>`}</td>
                <td>${n.enabled ? '<span class="tag green">启用</span>' : '<span class="tag gray">停用</span>'}</td>
                <td>
                  <button class="btn btn-sm btn-ghost" onclick="editNotice('${n.id}')">编辑</button>
                  <button class="btn btn-sm btn-ghost" onclick="toggleNotice('${n.id}')">${n.enabled ? '停用' : '启用'}</button>
                  <button class="btn btn-sm btn-ghost" onclick="deleteNotice('${n.id}')" style="color:var(--red)">删除</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="6"><div class="empty">暂无公告</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
  $('#nt-add').onclick = () => noticeModal();
};

window.editNotice = function (id) { noticeModal(DB.notices.find(n => n.id === id)); };
window.toggleNotice = function (id) {
  const n = DB.notices.find(x => x.id === id);
  n.enabled = !n.enabled; saveDB();
  toast(n.enabled ? '公告已启用' : '公告已停用', 'success');
  navigate('notices');
};
window.deleteNotice = function (id) {
  confirmDialog('确定删除该公告吗？删除后不可恢复。', () => {
    DB.notices = DB.notices.filter(n => n.id !== id);
    saveDB(); toast('公告已删除', 'success'); navigate('notices');
  });
};

function noticeModal(existing) {
  const isEdit = !!existing;
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="form-item"><label>公告标题 *</label><input id="nt-title" value="${esc(existing ? existing.title : '')}" placeholder="请输入公告标题"></div>
    <div class="form-item" style="margin-top:12px"><label>公告内容 *</label><textarea id="nt-content" placeholder="支持多行文字说明">${esc(existing ? existing.content : '')}</textarea></div>
    <div class="form-item" style="margin-top:12px"><label>接收范围</label>
      <select id="nt-scope-type">
        <option value="all" ${!existing || existing.scope === 'all' ? 'selected' : ''}>全部新生（门户首页 + 新生消息中心）</option>
        <option value="one" ${existing && existing.scope !== 'all' ? 'selected' : ''}>指定学号（单发通知）</option>
      </select></div>
    <div class="form-item" style="margin-top:12px;display:none" id="nt-scope-one-box"><label>学号</label><input id="nt-scope-one" value="${esc(existing && existing.scope !== 'all' ? existing.scope : '')}" placeholder="如 S20250001"></div>
    <div class="form-item" style="margin-top:12px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="nt-enabled" style="width:auto" ${!existing || existing.enabled ? 'checked' : ''}> 立即启用</label></div>`;

  const btnSave = document.createElement('button');
  btnSave.className = 'btn btn-primary'; btnSave.textContent = isEdit ? '保存修改' : '发布公告';

  const h = showModal({ title: isEdit ? '编辑公告' : '发布公告', body: box, footer: null });
  h.overlay.querySelector('.modal-footer').appendChild(btnSave);

  $('#nt-scope-type', h.overlay).onchange = e => {
    $('#nt-scope-one-box', h.overlay).style.display = e.target.value === 'one' ? 'block' : 'none';
  };

  btnSave.onclick = () => {
    const title = $('#nt-title', h.overlay).value.trim();
    const content = $('#nt-content', h.overlay).value.trim();
    const scopeType = $('#nt-scope-type', h.overlay).value;
    const scopeOne = $('#nt-scope-one', h.overlay).value.trim().toUpperCase();
    const enabled = $('#nt-enabled', h.overlay).checked;
    if (!title || !content) { toast('请填写标题和内容', 'error'); return; }
    if (scopeType === 'one' && !scopeOne) { toast('请填写指定学号', 'error'); return; }
    if (scopeType === 'one' && !DB.students.some(s => s.id === scopeOne)) { toast('学号不存在，请核对', 'error'); return; }

    if (isEdit) {
      Object.assign(existing, { title, content, enabled, scope: scopeType === 'all' ? 'all' : scopeOne });
    } else {
      DB.notices.push({ id: uid('N'), title, content, publisher: State.user.name, publishTime: Date.now(), enabled, scope: scopeType === 'all' ? 'all' : scopeOne });
    }
    saveDB(); h.close();
    toast(isEdit ? '公告已更新' : '公告已发布', 'success');
    navigate('notices');
  };
}

/* ---------------- 报表导出（超管） ---------------- */
RENDERERS.exportAll = function renderExportAll() {
  const total = DB.students.length;
  const done = DB.students.filter(s => s.offlineStatus === '已报到').length;
  $('#content').innerHTML = `
    <div class="grid-2" style="max-width:860px;margin:0 auto">
      <div class="card">
        <div class="card-title">📊 全校新生汇总表</div>
        <p style="color:var(--text-sub);font-size:13px;line-height:1.9;margin-bottom:16px">
          导出全校 ${total} 名新生完整数据（含 4 个院系），<br>当前现场报到 ${done} 人，报到率 ${total ? Math.round(done / total * 100) : 0}%。</p>
        <button class="btn btn-primary" id="expa-stu">导出全校新生汇总表</button>
      </div>
      <div class="card">
        <div class="card-title">📎 全校材料审核明细</div>
        <p style="color:var(--text-sub);font-size:13px;line-height:1.9;margin-bottom:16px">
          导出全部 ${DB.materials.length} 条材料记录，含审核状态、<br>审核人与备注，用于迎新工作留存归档。</p>
        <button class="btn btn-primary" id="expa-mat">导出材料审核明细</button>
      </div>
    </div>`;
  $('#expa-stu').onclick = () => exportStudentsExcel(DB.students, '全校新生汇总表');
  $('#expa-mat').onclick = () => exportMaterialsExcel(DB.students, '全校材料审核明细');
};

/* ======================================================
 * 可视化大屏
 * ====================================================== */
function openBigScreen() {
  $('#bigscreen').classList.remove('hidden');
  refreshBigScreen();
  State.bsTimer = setInterval(refreshBigScreen, 5000);
  State.bsClock = setInterval(updateBSClock, 1000);
  updateBSClock();
}

function stopBigScreen() {
  if (State.bsTimer) { clearInterval(State.bsTimer); State.bsTimer = null; }
  if (State.bsClock) { clearInterval(State.bsClock); State.bsClock = null; }
  $('#bigscreen').classList.add('hidden');
}

function updateBSClock() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  $('#bs-clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  const week = '日一二三四五六'[d.getDay()];
  $('#bs-date').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 星期${week} · 数据每 5 秒自动刷新`;
}

function refreshBigScreen() {
  const students = DB.students;
  const total = students.length;
  const onlineDone = students.filter(s => s.onlineStatus === '预报到完成').length;
  const offlineDone = students.filter(s => s.offlineStatus === '已报到').length;
  const pending = students.filter(s => s.onlineStatus === '待审核').length;
  const rejected = students.filter(s => s.onlineStatus === '已驳回').length;
  const pct = n => total ? (n / total * 100).toFixed(1) + '%' : '0%';

  $('#bs-metrics').innerHTML = `
    <div class="bs-metric c-blue"><div class="m-num">${total}<small>人</small></div><div class="m-label">总录取新生人数</div></div>
    <div class="bs-metric c-green"><div class="m-num">${onlineDone}<small>人</small></div><div class="m-label">线上预报到完成</div></div>
    <div class="bs-metric c-yellow"><div class="m-num">${pending}<small>人</small></div><div class="m-label">待材料审核</div></div>
    <div class="bs-metric c-red"><div class="m-num">${rejected}<small>人</small></div><div class="m-label">材料驳回待整改</div></div>`;

  $('#bs-rate-online').textContent = pct(onlineDone);
  $('#bs-rate-offline').textContent = pct(offlineDone);

  // 院系维度
  const deptNames = DEPARTMENTS.map(d => d.name);
  const deptTotal = deptNames.map(d => students.filter(s => s.dept === d).length);
  const deptOnline = deptNames.map(d => students.filter(s => s.dept === d && s.onlineStatus === '预报到完成').length);

  Charts.draw('bs-pie', 'pie', {
    labels: deptNames,
    datasets: [{ data: deptTotal, backgroundColor: CHART_COLORS, borderColor: '#0d1b36', borderWidth: 2 }],
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { ...bigScreenLegend(), position: 'right' } },
  });

  Charts.draw('bs-bar', 'bar', {
    labels: deptNames.map(n => n.replace('学院', '')),
    datasets: [
      { label: '预报到完成', data: deptOnline, backgroundColor: '#22c55e', borderRadius: 4, stack: 's' },
      { label: '未完成', data: deptNames.map((d, i) => deptTotal[i] - deptOnline[i]), backgroundColor: 'rgba(148,163,184,.35)', borderRadius: 4, stack: 's' },
    ],
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: bigScreenLegend() },
    scales: {
      x: { stacked: true, ticks: { color: '#9fb3d9' }, grid: { display: false } },
      y: { stacked: true, ticks: { color: '#9fb3d9' }, grid: { color: 'rgba(93,140,220,.12)' } },
    },
  });

  const matCnt = { '待审核': 0, '通过': 0, '驳回': 0 };
  DB.materials.forEach(m => { if (matCnt[m.status] !== undefined) matCnt[m.status]++; });
  Charts.draw('bs-dough', 'doughnut', {
    labels: ['审核通过', '待审核', '驳回'],
    datasets: [{ data: [matCnt['通过'], matCnt['待审核'], matCnt['驳回']], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderColor: '#0d1b36', borderWidth: 2, cutout: '62%' }],
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { ...bigScreenLegend(), position: 'bottom' } },
  });

  // 最新报到动态（复制一份实现无缝滚动）
  const recent = students.filter(s => s.offlineStatus === '已报到' && s.reportTime)
    .sort((a, b) => b.reportTime - a.reportTime).slice(0, 8);
  const item = s => `<li><span class="tk-name">${esc(s.name)}</span><span>${esc(s.dept.replace('学院', ''))}·${esc(s.major)}</span><span class="tk-time">${fmtTime(s.reportTime).slice(11)} 现场报到</span></li>`;
  const html = recent.length ? recent.map(item).join('') + recent.map(item).join('') : '<li>暂无现场报到记录</li>';
  $('#bs-ticker').innerHTML = html;
}

/* ======================================================
 * 启动
 * ====================================================== */
function initChrome() {
  $('#btn-logout').onclick = doLogout;
  $('#btn-logout').classList.add('btn-logout-m');
  $('#btn-bigscreen').onclick = openBigScreen;
  $('#bs-exit').onclick = () => { stopBigScreen(); Charts.destroyAll(); };
  const tick = () => {
    const d = new Date();
    const week = '日一二三四五六'[d.getDay()];
    $('#date-text').textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 星期${week}`;
  };
  tick(); setInterval(tick, 30000);
}

loadDB();
initPublic();
initLoginModal();
initChrome();
