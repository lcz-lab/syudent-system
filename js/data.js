/* ======================================================
 * 数据层：4 张数据表（新生信息表 / 材料上传表 / 公告通知表 / 账号角色表）
 * localStorage 持久化 + 表单校验规则 + 种子数据
 * ====================================================== */

const STORAGE_KEY = 'freshman_reg_system_v1';
const READ_KEY = 'freshman_reg_read_v1';

/* ---------------- 基础字典 ---------------- */
const DEPARTMENTS = [
  { name: '计算机学院', majors: ['软件工程', '计算机科学与技术', '人工智能'] },
  { name: '电子工程学院', majors: ['电子信息工程', '通信工程'] },
  { name: '经济管理学院', majors: ['工商管理', '会计学'] },
  { name: '外国语学院', majors: ['英语', '日语'] },
];

const PROVINCES = ['北京', '上海', '广东', '江苏', '浙江', '山东', '河南', '湖北', '湖南', '四川', '陕西', '福建', '安徽', '河北', '辽宁'];

// 材料类型（必传 4 项 + 选传 1 项）
const MATERIAL_TYPES = [
  { key: 'idFront', label: '身份证人像面', required: true },
  { key: 'idBack', label: '身份证国徽面', required: true },
  { key: 'admission', label: '录取通知书', required: true },
  { key: 'photo', label: '一寸证件照', required: true },
  { key: 'other', label: '其他补充材料', required: false },
];

const ONLINE_STATUS = ['未填报', '待审核', '已驳回', '预报到完成'];
const OFFLINE_STATUS = ['未报到', '已报到'];
const MATERIAL_STATUS = ['待审核', '通过', '驳回'];

/* ---------------- 校验规则 ---------------- */
const Validators = {
  required(v) { return v !== undefined && v !== null && String(v).trim() !== ''; },
  phone(v) { return /^1[3-9]\d{9}$/.test(String(v).trim()); },
  idCard(v) { return /^\d{17}[\dXx]$/.test(String(v).trim()); },
  kaosheng(v) { return /^\d{10,16}$/.test(String(v).trim()); },
};

/* ---------------- 工具 ---------------- */
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function genIDCard() {
  const prefix = ['110101', '310101', '440101', '510101', '320101', '420101', '370101'][randInt(0, 6)];
  const year = randInt(2004, 2007);
  const month = String(randInt(1, 12)).padStart(2, '0');
  const day = String(randInt(1, 28)).padStart(2, '0');
  const seq = String(randInt(100, 999));
  return `${prefix}${year}${month}${day}${seq}${rand(['0', '1', '2', 'X'])}`;
}

function genPhone() { return '1' + randInt(3, 9) + String(randInt(0, 99999999)).padStart(8, '0'); }

const SURNAMES = '王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文';
const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '杰', '娟', '涛', '明', '超', '秀英', '霞', '文', '华', '志强', '俊杰', '宇航', '梓涵', '欣怡', '浩然', '子轩', '雨桐', '可馨', '子萱', '佳琪', '思远', '铭轩', '若曦', '一鸣', '嘉懿'];
function genName() { const s = SURNAMES[randInt(0, SURNAMES.length - 1)]; return s + rand(GIVEN_NAMES); }

function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- 数据库（4 张数据表） ----------------
 * students   新生信息表
 * materials  材料上传表
 * notices    公告通知表（scope: 'all' 全部新生 / 具体学号 单发）
 * accounts   账号角色表（辅导员、超管；新生登录走新生信息表：学号+身份证后6位）
 * ------------------------------------------------------ */
let DB = { students: [], materials: [], notices: [], accounts: [] };

function saveDB() { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { DB = JSON.parse(raw); return; } catch (e) { /* fallthrough */ }
  }
  seedDB();
}

function resetDB() {
  localStorage.removeItem(STORAGE_KEY);
  seedDB();
}

/* ---------------- 种子数据 ---------------- */
function makeQRToken(stuId) {
  // 报到二维码内容：可被辅导员核验页识别
  return `XXU-YX|${stuId}|${(stuId * 7919 + 2026).toString(36).toUpperCase()}`;
}

function seedStudentBase(i, dept, major) {
  return {
    id: 'S2025' + String(i).padStart(4, '0'),
    name: genName(),
    gender: rand(['男', '女']),
    idCard: genIDCard(),
    kaosheng: String(randInt(241000000000, 249999999999)),
    dept, major,
    hometown: rand(PROVINCES) + '市',
    phone: genPhone(),
    emergencyName: genName(),
    emergencyPhone: genPhone(),
    submitTime: null,
    onlineStatus: '未填报',     // 未填报 → 待审核 → 预报到完成（驳回后重新提交回待审核）
    offlineStatus: '未报到',    // 未报到 → 已报到（辅导员扫码核验）
    reportTime: null,
    qrToken: null,
  };
}

function seedMaterials(stu, onlineStatus) {
  const list = [];
  if (onlineStatus === '未填报') return list;
  MATERIAL_TYPES.filter(t => t.required || Math.random() < 0.3).forEach(t => {
    const m = {
      id: uid('M'),
      studentId: stu.id,
      type: t.key,
      fileName: `${t.label}_${stu.name}.jpg`,
      fileSize: randInt(80, 4200),
      status: '待审核',
      reviewer: '', remark: '', reviewTime: null,
      uploadTime: Date.now() - randInt(3600, 86400 * 3) * 1000,
    };
    if (onlineStatus === '预报到完成') {
      m.status = '通过'; m.reviewer = '辅导员'; m.reviewTime = Date.now() - randInt(600, 3600) * 1000;
    } else if (onlineStatus === '已驳回') {
      if (Math.random() < 0.6) {
        m.status = '驳回'; m.reviewer = '辅导员';
        m.remark = rand(['照片模糊，请重新上传', '证件反光看不清信息', '文件不完整，请重传']);
        m.reviewTime = Date.now() - randInt(600, 7200) * 1000;
      } else {
        m.status = '通过'; m.reviewer = '辅导员'; m.reviewTime = Date.now() - randInt(600, 7200) * 1000;
      }
    }
    list.push(m);
  });
  return list;
}

function seedDB() {
  DB = { students: [], materials: [], notices: [], accounts: [] };

  // —— 演示学生（固定，方便答辩演示）——
  const demo = [
    { id: 'S20250001', name: '王晓阳', gender: '男', idCard: '110101200701011234', dept: '计算机学院', major: '软件工程', hometown: '北京市', online: '预报到完成', offline: '未报到' },
    { id: 'S20250002', name: '李雨桐', gender: '女', idCard: '310101200702025678', dept: '计算机学院', major: '人工智能', hometown: '上海市', online: '待审核', offline: '未报到' },
    { id: 'S20250003', name: '陈子轩', gender: '男', idCard: '440101200703039012', dept: '计算机学院', major: '软件工程', hometown: '广州市', online: '已驳回', offline: '未报到' },
    { id: 'S20250004', name: '刘思琪', gender: '女', idCard: '440101200704043456', dept: '电子工程学院', major: '通信工程', hometown: '深圳市', online: '预报到完成', offline: '已报到' },
  ];
  demo.forEach(d => {
    const stu = {
      ...seedStudentBase(0, d.dept, d.major),
      id: d.id, name: d.name, gender: d.gender, idCard: d.idCard,
      kaosheng: '2410' + d.id.slice(1) + '66',
      hometown: d.hometown,
      phone: genPhone(), emergencyName: genName(), emergencyPhone: genPhone(),
      onlineStatus: d.online, offlineStatus: d.offline,
    };
    if (d.online !== '未填报') {
      stu.submitTime = Date.now() - 86400 * 1000 * 2;
      DB.materials.push(...seedMaterials(stu, d.online));
    }
    if (d.online === '预报到完成') {
      stu.qrToken = makeQRToken(d.id);
      if (d.offline === '已报到') stu.reportTime = Date.now() - 3600 * 1000 * 5;
    }
    DB.students.push(stu);
  });

  // —— 随机模拟新生（约 76 人）——
  for (let i = 5; i <= 80; i++) {
    const dept = rand(DEPARTMENTS);
    const stu = seedStudentBase(i, dept.name, rand(dept.majors));
    if (i === 5) {
      // 固定的「未填报」演示学生，用于完整流程演示
      stu.name = '张一鸣';
      stu.gender = '男';
      stu.idCard = '510101200705057890';
      stu.major = '软件工程';
      stu.dept = '计算机学院';
    }
    const r = Math.random();
    stu.onlineStatus = i === 5 ? '未填报' : (r < 0.14 ? '未填报' : r < 0.30 ? '待审核' : r < 0.40 ? '已驳回' : '预报到完成');
    if (stu.onlineStatus !== '未填报') {
      stu.submitTime = Date.now() - randInt(3600, 86400 * 4) * 1000;
      DB.materials.push(...seedMaterials(stu, stu.onlineStatus));
    }
    if (stu.onlineStatus === '预报到完成') {
      stu.qrToken = makeQRToken(stu.id);
      if (Math.random() < 0.45) {
        stu.offlineStatus = '已报到';
        stu.reportTime = Date.now() - randInt(600, 3600 * 8) * 1000;
      }
    }
    DB.students.push(stu);
  }

  // —— 账号角色表 ——
  DB.accounts = [
    { account: 'admin', pwd: '123456', role: 'admin', name: '迎新办管理员', dept: '' },
    { account: 'jsds01', pwd: '123456', role: 'counselor', name: '姜老师', dept: '计算机学院' },
    { account: 'dzds01', pwd: '123456', role: 'counselor', name: '邓老师', dept: '电子工程学院' },
    { account: 'jgds01', pwd: '123456', role: 'counselor', name: '金老师', dept: '经济管理学院' },
    { account: 'wgds01', pwd: '123456', role: 'counselor', name: '吴老师', dept: '外国语学院' },
  ];

  // —— 公告通知表 ——
  const now = Date.now();
  DB.notices = [
    { id: uid('N'), title: '2026 级新生线上报到开放通知', content: '各位 2026 级新同学：线上预报到系统已开放，请于 8 月 25 日前完成个人信息填报、材料上传。预报到完成后可查看个人报到二维码，到校后由辅导员扫码核验完成现场报到。', publisher: '迎新办', publishTime: now - 86400 * 1000 * 3, enabled: true, scope: 'all' },
    { id: uid('N'), title: '材料上传规范说明', content: '身份证请拍摄正反两面，确保四角完整、字迹清晰无反光；录取通知书需拍摄首页；证件照为一寸免冠彩色照片。材料不符合要求将被驳回，请在驳回后按备注重新上传。', publisher: '迎新办', publishTime: now - 86400 * 1000 * 2, enabled: true, scope: 'all' },
    { id: uid('N'), title: '现场报到流程与接站安排', content: '9 月 1 日 - 9 月 2 日为现场报到日，新生到达校门口后向志愿者出示个人报到二维码，由所在学院辅导员扫码核验。火车站设有接站点，乘坐校车请提前查看接站时刻表。', publisher: '迎新办', publishTime: now - 86400 * 1000, enabled: true, scope: 'all' },
  ];

  saveDB();
}

/* ---------------- 已读消息记录 ---------------- */
function getReadSet() { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
function saveReadSet(set) { localStorage.setItem(READ_KEY, JSON.stringify([...set])); }

/* ---------------- 业务查询 ---------------- */
// 新生可见通知：范围 = 全部 或 本人学号，且已启用
function noticesForStudent(stuId) {
  return DB.notices
    .filter(n => n.enabled && (n.scope === 'all' || n.scope === stuId))
    .sort((a, b) => b.publishTime - a.publishTime);
}

// 某新生某材料
function materialOf(stuId, typeKey) {
  return DB.materials.find(m => m.studentId === stuId && m.type === typeKey);
}

// 新生全部材料
function materialsOf(stuId) {
  return DB.materials.filter(m => m.studentId === stuId);
}

// 必传材料是否齐全
function requiredMaterialsReady(stuId) {
  return MATERIAL_TYPES.filter(t => t.required).every(t => {
    const m = materialOf(stuId, t.key);
    return m && m.fileName;
  });
}

/* ---------------- 工作流动作 ---------------- */
// 工作流①：新生提交填报 + 材料 → 待审核，推送给本院辅导员
function submitStudentData(stuId, formData) {
  const stu = DB.students.find(s => s.id === stuId);
  Object.assign(stu, formData, { submitTime: Date.now(), onlineStatus: '待审核' });
  // 重置材料审核状态（重新提交场景）
  materialsOf(stuId).forEach(m => {
    if (m.status === '驳回') { m.status = '待审核'; m.remark = ''; m.reviewer = ''; m.reviewTime = null; }
  });
  saveDB();
}

// 工作流②：辅导员驳回 → 通知新生（scope=学号 的通知 + 状态置已驳回）
function rejectStudent(stuId, remark, reviewer) {
  const stu = DB.students.find(s => s.id === stuId);
  stu.onlineStatus = '已驳回';
  materialsOf(stuId).forEach(m => { if (m.status === '待审核') m.status = '驳回'; });
  DB.notices.push({
    id: uid('N'), title: '材料审核驳回提醒',
    content: `你的报到材料未通过审核，原因：${remark || '材料不符合要求'}。请进入【材料上传】重新上传后提交。`,
    publisher: reviewer, publishTime: Date.now(), enabled: true, scope: stuId,
  });
  saveDB();
}

// 工作流③：审核通过 → 预报到完成 + 生成报到二维码 + 通知
function approveStudent(stuId, reviewer) {
  const stu = DB.students.find(s => s.id === stuId);
  stu.onlineStatus = '预报到完成';
  stu.qrToken = makeQRToken(stuId);
  materialsOf(stuId).forEach(m => { if (m.status === '待审核') { m.status = '通过'; m.reviewer = reviewer; m.reviewTime = Date.now(); } });
  DB.notices.push({
    id: uid('N'), title: '预报到完成通知',
    content: '恭喜！你的报到材料已全部审核通过，线上预报到完成。请前往【报到首页】查看个人报到二维码，现场报到时出示给辅导员扫码核验。',
    publisher: reviewer, publishTime: Date.now(), enabled: true, scope: stuId,
  });
  saveDB();
}

// 工作流④：扫码核验 → 现场已报到
function checkinStudent(stuId, operator) {
  const stu = DB.students.find(s => s.id === stuId);
  stu.offlineStatus = '已报到';
  stu.reportTime = Date.now();
  saveDB();
  return stu;
}

// 从学号或二维码内容解析学号
function parseStuId(input) {
  const v = String(input || '').trim();
  if (!v) return null;
  if (v.includes('XXU-YX|')) {
    const parts = v.split('|');
    return parts[1] || null;
  }
  return v;
}
