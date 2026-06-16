const config = window.STP_ADMIN_CONFIG || {};
const state = {
  app: null,
  token: sessionStorage.getItem('stp_admin_token') || '',
  expiresAt: Number(sessionStorage.getItem('stp_admin_expires_at') || 0),
  tab: 'overview',
  userFilter: 'all',
  userPage: 1,
  userPageSize: 20,
  selectedUser: null,
  authReady: null,
};

const $ = (id) => document.getElementById(id);

init();

function init() {
  document.title = config.appName || '刷题通Pro后台';
  bindEvents();
  fillDefaultAccount();
  initCloud();
  if (state.token && state.expiresAt > Date.now()) {
    showAdmin();
    loadTab('overview', true);
  } else {
    clearSession();
    showLogin();
  }
}

function initCloud() {
  if (!config.envId) {
    setLoginMessage('请先在 config.js 填写 envId');
    setLoginDisabled(true);
    return;
  }
  const cloudSdk = window.cloudbase || window.tcb;
  if (!cloudSdk) {
    setLoginMessage('CloudBase SDK 加载失败，请检查网络');
    setLoginDisabled(true);
    return;
  }
  try {
    state.app = cloudSdk.init({ env: config.envId });
    const auth = state.app.auth({ persistence: 'session' });
    const signIn = typeof auth.signInAnonymously === 'function'
      ? auth.signInAnonymously.bind(auth)
      : () => auth.anonymousAuthProvider().signIn();
    state.authReady = signIn().catch((err) => {
      throw new Error(formatCloudError(err));
    });
  } catch (err) {
    setLoginMessage(formatCloudError(err));
    setLoginDisabled(true);
    return;
  }
  setLoginDisabled(false);
}

function bindEvents() {
  $('loginBtn').addEventListener('click', login);
  $('accountInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('passwordInput').focus();
  });
  $('passwordInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') login();
  });
  $('logoutBtn').addEventListener('click', logout);
  $('refreshUsersBtn').addEventListener('click', () => loadUsers(true));
  $('refreshFeedbackBtn').addEventListener('click', () => loadFeedback(true));
  $('refreshContentBtn').addEventListener('click', () => loadContent(true));
  $('saveNoticeBtn').addEventListener('click', () => saveContent('notice'));
  $('saveAuthorBtn').addEventListener('click', () => saveContent('author'));
  $('prevUserPage').addEventListener('click', () => changeUserPage(-1));
  $('nextUserPage').addEventListener('click', () => changeUserPage(1));
  $('closeModalBtn').addEventListener('click', closeUserModal);
  $('adjustPointsBtn').addEventListener('click', adjustPoints);
  $('setProBtn').addEventListener('click', () => setMembership('pro'));
  $('setFreeBtn').addEventListener('click', () => setMembership('free'));

  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
  document.querySelectorAll('.filter').forEach((button) => {
    button.addEventListener('click', () => {
      state.userFilter = button.dataset.filter;
      state.userPage = 1;
      document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
      loadUsers(true);
    });
  });
}

function fillDefaultAccount() {
  const accountInput = $('accountInput');
  if (!accountInput || accountInput.value) return;
  accountInput.value = sessionStorage.getItem('stp_admin_account') || config.defaultAdminAccount || '';
}

function setLoginDisabled(disabled) {
  const loginBtn = $('loginBtn');
  if (loginBtn) loginBtn.disabled = Boolean(disabled);
}

async function callAdmin(action, data = {}) {
  if (!state.app) throw new Error('后台未初始化');
  await ensureCloudReady();
  const result = await state.app.callFunction({
    name: config.functionName || 'stpAdmin',
    data: { action, ...data, adminToken: state.token },
  });
  const body = result && result.result ? result.result : {};
  if (body.ok === false) throw new Error(body.message || '操作失败');
  return body;
}

async function login() {
  if (!state.app) {
    setLoginMessage(config.envId ? '云开发初始化失败，请刷新页面重试' : '请先在 config.js 填写 envId');
    return;
  }
  const account = $('accountInput').value.trim();
  const password = $('passwordInput').value;
  setLoginMessage('');
  if (!account || !password) {
    setLoginMessage('请输入账号和密码');
    return;
  }
  try {
    $('loginBtn').disabled = true;
    await ensureCloudReady();
    const result = await state.app.callFunction({
      name: config.functionName || 'stpAdmin',
      data: { action: 'adminWebLogin', account, password },
    });
    const body = result.result || {};
    if (body.ok === false) throw new Error(body.message || '登录失败');
    state.token = body.token;
    state.expiresAt = Number(body.expiresAt || 0);
    sessionStorage.setItem('stp_admin_token', state.token);
    sessionStorage.setItem('stp_admin_expires_at', String(state.expiresAt));
    sessionStorage.setItem('stp_admin_account', account);
    showAdmin();
    await loadTab('overview', true);
  } catch (err) {
    setLoginMessage(err.message || '登录失败');
  } finally {
    $('loginBtn').disabled = false;
  }
}

async function ensureCloudReady() {
  if (!state.authReady) return;
  try {
    await state.authReady;
  } catch (err) {
    throw new Error(formatCloudError(err));
  }
}

function formatCloudError(err) {
  const raw = String((err && (err.message || err.errMsg || err.code)) || err || '');
  if (/network request error|cors|permission_denied|illegal source|domain|安全域名|安全来源/i.test(raw)) {
    return '云开发连接失败：请在云开发控制台开启匿名登录，并把当前后台网页域名加入“环境配置 > 安全来源 > 安全域名”。如果是本地打开 html 文件，请改用本地服务或 GitHub Pages 网址访问。';
  }
  if (/anonymous|auth|login|未开通|not enabled/i.test(raw)) {
    return '云开发匿名登录失败：请到“身份认证 > 登录方式”开启匿名登录后再试。';
  }
  return raw || '云开发连接失败，请检查网络和云开发配置';
}

async function logout() {
  try {
    if (state.token) await callAdmin('adminWebLogout', { token: state.token });
  } catch (_) {}
  clearSession();
  showLogin();
}

function clearSession() {
  state.token = '';
  state.expiresAt = 0;
  sessionStorage.removeItem('stp_admin_token');
  sessionStorage.removeItem('stp_admin_expires_at');
}

function showLogin() {
  $('loginView').classList.remove('hidden');
  $('adminView').classList.add('hidden');
}

function showAdmin() {
  $('loginView').classList.add('hidden');
  $('adminView').classList.remove('hidden');
  const account = sessionStorage.getItem('stp_admin_account') || '管理员';
  $('sessionText').textContent = `${account} · ${formatExpire(state.expiresAt)} 过期`;
}

function setLoginMessage(text) {
  $('loginMsg').textContent = text || '';
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  ['overview', 'users', 'feedback', 'content'].forEach((name) => {
    $(`${name}Panel`).classList.toggle('hidden', name !== tab);
  });
  loadTab(tab, false);
}

function loadTab(tab, force) {
  if (tab === 'overview') return loadOverview(force);
  if (tab === 'users') return loadUsers(force);
  if (tab === 'feedback') return loadFeedback(force);
  if (tab === 'content') return loadContent(force);
  return Promise.resolve();
}

async function loadOverview() {
  try {
    const data = await callAdmin('getAdminDashboard', { section: 'overview' });
    const stats = [
      ['全部用户', data.allUserCount ?? data.userCount ?? 0],
      ['累计注册', data.registeredUserCount ?? 0],
      ['已登录资料', data.loggedInUserCount ?? 0],
      ['授权用户', data.paidUserCount ?? 0],
      ['今日登录', data.todayLoginCount ?? data.todayActiveCount ?? 0],
      ['今日签到', data.todayCheckInCount ?? 0],
      ['反馈总数', data.feedbackCount ?? 0],
      ['授权码', data.activationKeyCount ?? 0],
    ];
    $('statsGrid').innerHTML = stats.map(([label, value]) => `
      <article class="stat-card">
        <span class="stat-value">${escapeHtml(value)}</span>
        <span class="stat-label">${escapeHtml(label)}</span>
      </article>
    `).join('');
  } catch (err) {
    toast(err.message || '加载失败');
  }
}

async function loadUsers() {
  try {
    const data = await callAdmin('getAdminDashboard', {
      section: 'users',
      userFilter: state.userFilter,
      userPage: state.userPage,
      userPageSize: state.userPageSize,
    });
    const users = data.recentUsers || [];
    const total = data.userTotal || users.length;
    const totalPage = Math.max(1, Math.ceil(total / state.userPageSize));
    $('userSummary').textContent = `${filterLabel(state.userFilter)} · 共 ${total} 人`;
    $('userPageText').textContent = `第 ${state.userPage} / ${totalPage} 页`;
    $('prevUserPage').disabled = state.userPage <= 1;
    $('nextUserPage').disabled = state.userPage >= totalPage;
    $('userList').innerHTML = users.length ? users.map(renderUser).join('') : '<div class="item">暂无用户</div>';
    $('userList').querySelectorAll('[data-open-user]').forEach((button) => {
      button.addEventListener('click', () => {
        const user = users.find((item) => (item._openid || item._id) === button.dataset.openUser);
        if (user) openUserModal(user);
      });
    });
  } catch (err) {
    toast(err.message || '用户加载失败');
  }
}

function renderUser(user) {
  const openid = user._openid || user._id || '';
  return `
    <article class="item">
      <div class="item-main">
        <span class="item-title">${escapeHtml(displayUser(user))}</span>
        <span class="item-meta">${escapeHtml(user.userNo || openid)}</span>
        <span class="item-meta">积分 ${Number(user.points || 0)} · ${user.memberLevel === 'pro' ? '授权用户' : '基础用户'} · ${user.isLogin ? '已登录资料' : '未授权资料'} · 最近 ${formatTime(user.lastActiveAt)}</span>
      </div>
      <div class="item-actions">
        <button class="small-btn" data-open-user="${escapeAttr(openid)}">管理</button>
      </div>
    </article>
  `;
}

async function loadFeedback() {
  try {
    const data = await callAdmin('getAdminDashboard', { section: 'feedback' });
    const list = data.feedbacks || [];
    $('feedbackList').innerHTML = list.length ? list.map(renderFeedback).join('') : '<div class="item">暂无反馈</div>';
    $('feedbackList').querySelectorAll('[data-feedback-id]').forEach((button) => {
      button.addEventListener('click', () => markFeedback(button.dataset.feedbackId));
    });
  } catch (err) {
    toast(err.message || '反馈加载失败');
  }
}

function renderFeedback(item) {
  return `
    <article class="item">
      <div class="item-main">
        <span class="item-title">${escapeHtml(item.nickName || item.userNo || '匿名用户')}</span>
        <span class="item-meta">${escapeHtml(item.content || '')}</span>
        <span class="item-meta">${formatTime(item.createdAt)} · ${item.status === 'handled' ? '已处理' : '新反馈'}</span>
      </div>
      <div class="item-actions">
        ${item.status === 'handled' ? '' : `<button class="small-btn" data-feedback-id="${escapeAttr(item._id)}">标记处理</button>`}
      </div>
    </article>
  `;
}

async function markFeedback(id) {
  try {
    await callAdmin('markFeedbackHandled', { id });
    toast('已标记处理');
    await loadFeedback(true);
  } catch (err) {
    toast(err.message || '操作失败');
  }
}

async function loadContent() {
  try {
    const data = await callAdmin('getAdminDashboard', { section: 'content' });
    $('noticeInput').value = data.contents?.notice?.content || '';
    $('authorInput').value = data.contents?.author?.content || '';
  } catch (err) {
    toast(err.message || '内容加载失败');
  }
}

async function saveContent(type) {
  const content = type === 'notice' ? $('noticeInput').value.trim() : $('authorInput').value.trim();
  try {
    await callAdmin('saveContent', { type, content });
    toast('发布成功');
  } catch (err) {
    toast(err.message || '发布失败');
  }
}

function openUserModal(user) {
  state.selectedUser = user;
  $('modalUserName').textContent = displayUser(user);
  $('modalUserMeta').textContent = `${user.userNo || user._openid || user._id} · 积分 ${Number(user.points || 0)} · ${user.memberLevel === 'pro' ? '授权用户' : '基础用户'}`;
  $('pointDeltaInput').value = '';
  $('pointReasonInput').value = '';
  $('membershipDaysInput').value = '';
  $('userModal').classList.remove('hidden');
}

function closeUserModal() {
  state.selectedUser = null;
  $('userModal').classList.add('hidden');
}

async function adjustPoints() {
  const user = state.selectedUser;
  if (!user) return;
  const openid = user._openid || user._id;
  const delta = Math.floor(Number($('pointDeltaInput').value || 0));
  if (!delta) {
    toast('请输入非0积分');
    return;
  }
  try {
    const result = await callAdmin('adjustUserPoints', {
      openid,
      delta,
      reason: $('pointReasonInput').value.trim(),
    });
    user.points = result.points;
    toast('积分已调整');
    await loadUsers(true);
    closeUserModal();
  } catch (err) {
    toast(err.message || '积分调整失败');
  }
}

async function setMembership(level) {
  const user = state.selectedUser;
  if (!user) return;
  const openid = user._openid || user._id;
  const durationDays = Math.max(0, Math.floor(Number($('membershipDaysInput').value || 0)));
  try {
    await callAdmin('setUserMembership', { openid, level, durationDays });
    toast(level === 'pro' ? '已设为授权用户' : '已取消授权');
    await loadUsers(true);
    closeUserModal();
  } catch (err) {
    toast(err.message || '授权调整失败');
  }
}

function changeUserPage(step) {
  const next = Math.max(1, state.userPage + step);
  if (next === state.userPage) return;
  state.userPage = next;
  loadUsers(true);
}

function filterLabel(filter) {
  return {
    all: '全部用户',
    authorized: '授权用户',
    todayLogin: '今日登录',
    todayCheckIn: '今日签到',
  }[filter] || '全部用户';
}

function displayUser(user) {
  return user.nickName || user.userNo || user._openid || user._id || '匿名用户';
}

function formatExpire(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTime(value) {
  if (!value) return '未知';
  if (typeof value === 'object' && typeof value.toDate === 'function') value = value.toDate();
  if (typeof value === 'object' && value.$date) value = value.$date;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
