// ===================================================================
// 관리자 대시보드 로직 (로그인, 회사정보, 프로그램 게시판)
// ===================================================================

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const topbarActions = document.getElementById("topbar-actions");

auth.onAuthStateChanged((user) => {
  if (user) {
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    topbarActions.innerHTML = `<button id="logout-btn">로그아웃</button>`;
    document.getElementById("logout-btn").addEventListener("click", () => auth.signOut());
    loadPrograms();
  } else {
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    topbarActions.innerHTML = "";
  }
});

document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  if (!email || !password) {
    errEl.textContent = "이메일과 비밀번호를 입력해주세요.";
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    errEl.textContent = "로그인에 실패했습니다: " + friendlyAuthError(e);
  }
});

function friendlyAuthError(e) {
  const code = e && e.code;
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (code === "auth/invalid-email") return "이메일 형식이 올바르지 않습니다.";
  return e.message || String(e);
}

// ---------------------------------------------------------------
// 프로그램 목록 (게시판)
// ---------------------------------------------------------------

async function loadPrograms() {
  const listEl = document.getElementById("program-list");
  const emptyHint = document.getElementById("empty-hint");
  listEl.innerHTML = "<p style='color:var(--text-muted)'>불러오는 중...</p>";

  const snap = await db.collection("programs").orderBy("createdAt", "desc").get();
  if (snap.empty) {
    listEl.innerHTML = "";
    emptyHint.style.display = "block";
    return;
  }
  emptyHint.style.display = "none";

  const rows = await Promise.all(
    snap.docs.map(async (doc) => {
      const p = doc.data();
      const subSnap = await db.collection("submissions").where("programId", "==", doc.id).get();
      return { id: doc.id, ...p, submissionCount: subSnap.size };
    })
  );

  listEl.innerHTML = rows
    .map((p) => {
      const statusClass = p.active === false ? "closed" : "open";
      const statusText = p.active === false ? "마감" : "진행중";
      const isMatching = p.contractType === "matching";
      const typeBadge = isMatching
        ? `<span class="type-badge matching">강의섭외대행</span>`
        : `<span class="type-badge direct">직접 위촉</span>`;
      const meta = isMatching
        ? `${escapeHtml(p.proposerName || "")} · ${escapeHtml(p.dateTime || "")} · ${p.hours || 0}시간 · 대행비 ${won(p.totalAmount)} (VAT 포함) · 제출 ${p.submissionCount}명`
        : `${escapeHtml(p.dateTime || "")} · 강사비 ${won(p.fee)}${feeTypeSuffix(p.feeType)} · 제출 ${p.submissionCount}명`;
      return `
      <div class="program-item">
        <div>
          ${typeBadge}
          <strong>${escapeHtml(p.name)}</strong>
          <span class="status ${statusClass}">${statusText}</span>
          <div class="meta">${meta}</div>
        </div>
        <div class="btn-row" style="margin:0">
          <button class="secondary" data-action="link" data-id="${p.id}">링크 복사</button>
          <a class="btn secondary" href="program-detail.html?pid=${p.id}">상세보기</a>
          <button class="secondary" data-action="edit" data-id="${p.id}">수정</button>
          <button class="secondary" data-action="toggle" data-id="${p.id}" data-active="${p.active !== false}">${p.active === false ? "재개" : "마감"}</button>
          <button class="danger" data-action="delete" data-id="${p.id}">삭제</button>
        </div>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleProgramAction(btn));
  });
}

function siteBasePath() {
  return `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "")}`;
}

function programLink(pid) {
  return `${siteBasePath()}/form.html?pid=${pid}`;
}

function shortLink(code) {
  return `${siteBasePath()}/s.html?c=${code}`;
}

async function handleProgramAction(btn) {
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === "link") {
    showLinkModal(id);
  } else if (action === "edit") {
    openEditProgramModal(id);
  } else if (action === "toggle") {
    const currentlyActive = btn.dataset.active === "true";
    await db.collection("programs").doc(id).update({ active: !currentlyActive });
    loadPrograms();
  } else if (action === "delete") {
    if (!confirm("이 프로그램을 삭제하시겠습니까? 제출된 강사 정보는 삭제되지 않으며 상세보기에서 별도로 관리할 수 있습니다.")) return;
    await db.collection("programs").doc(id).delete();
    loadPrograms();
  }
}

function showLinkModal(pid) {
  const link = programLink(pid);
  document.getElementById("link-box-text").textContent = link;
  document.getElementById("link-modal").classList.remove("hidden");
  document.getElementById("link-copy-btn").onclick = () => {
    navigator.clipboard.writeText(link).then(() => {
      document.getElementById("link-copy-btn").textContent = "복사됨!";
      setTimeout(() => (document.getElementById("link-copy-btn").textContent = "링크 복사"), 1500);
    });
  };

  // 짧은 링크: 외부 단축 서비스 대신, 우리 Firestore에 짧은 코드 -> pid 매핑을 저장하고
  // s.html이 그 코드를 조회해 실제 링크로 이동시켜주는 방식(자체 호스팅, 외부 의존성 없음).
  const shortBoxEl = document.getElementById("short-link-box-text");
  const shortCopyBtn = document.getElementById("short-link-copy-btn");
  shortBoxEl.textContent = "짧은 링크 생성 중...";
  shortCopyBtn.disabled = true;
  shortCopyBtn.onclick = null;

  getOrCreateShortCode(pid)
    .then((code) => {
      const shortUrl = shortLink(code);
      shortBoxEl.textContent = shortUrl;
      shortCopyBtn.disabled = false;
      shortCopyBtn.onclick = () => {
        navigator.clipboard.writeText(shortUrl).then(() => {
          shortCopyBtn.textContent = "복사됨!";
          setTimeout(() => (shortCopyBtn.textContent = "짧은 링크 복사"), 1500);
        });
      };
    })
    .catch((e) => {
      console.error(e);
      shortBoxEl.textContent = "짧은 링크 생성에 실패했습니다. 위 원본 링크를 이용해주세요.";
    });
}

const SHORT_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randomShortCode(len) {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)];
  }
  return code;
}

// 프로그램에 이미 짧은 코드가 있으면 재사용하고, 없으면 새로 만들어 저장한다.
async function getOrCreateShortCode(pid) {
  const progRef = db.collection("programs").doc(pid);
  const progDoc = await progRef.get();
  const existing = progDoc.exists ? progDoc.data().shortCode : null;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomShortCode(6);
    const linkRef = db.collection("shortlinks").doc(code);
    const linkDoc = await linkRef.get();
    if (linkDoc.exists) continue; // 코드가 우연히 겹치면 다시 시도
    await linkRef.set({ pid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await progRef.update({ shortCode: code });
    return code;
  }
  throw new Error("짧은 코드 생성 실패 (재시도 초과)");
}
document.getElementById("link-close-btn").addEventListener("click", () => {
  document.getElementById("link-modal").classList.add("hidden");
});

// ---------------------------------------------------------------
// 새 프로그램 만들기
// ---------------------------------------------------------------

// 시작/종료 시간 선택창을 30분 단위 목록으로 채운다 (00:00, 00:30, 01:00 ... 23:30).
// 보통 수업이 정시나 30분 단위로 시작하는 점을 반영해 직접 타이핑 대신 목록에서 고르게 함.
function buildTimeOptions(selectEl) {
  let html = '<option value="">시간 선택</option>';
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      html += `<option value="${hh}:${mm}">${hh}:${mm}</option>`;
    }
  }
  selectEl.innerHTML = html;
}
buildTimeOptions(document.getElementById("np-start-time"));
buildTimeOptions(document.getElementById("np-end-time"));

const newProgramModal = document.getElementById("new-program-modal");

// ---------------------------------------------------------------
// 계약 유형(직접 위촉 / 강의섭외대행) 전환 + 대행비 자동 계산
// ---------------------------------------------------------------

function selectedContractType() {
  const el = document.querySelector('input[name="np-type"]:checked');
  return el ? el.value : "direct";
}

function setContractType(type) {
  document.querySelectorAll('input[name="np-type"]').forEach((r) => (r.checked = r.value === type));
  const isMatching = type === "matching";
  document.getElementById("np-direct-fields").classList.toggle("hidden", isMatching);
  document.getElementById("np-matching-fields").classList.toggle("hidden", !isMatching);
  document.getElementById("np-proposer-wrap").classList.toggle("hidden", !isMatching);
  updateMatchingAmounts();
}

// 공급가액 = 강의 시간 × 시간당 대행비, 부가세 = 공급가액의 10%(원 단위 반올림)
function calcMatchingAmounts(hours, unitFee) {
  const supply = Math.round(Number(hours || 0) * Number(unitFee || 0));
  const vat = Math.round(supply * 0.1);
  return { supply, vat, total: supply + vat };
}

function updateMatchingAmounts() {
  const a = calcMatchingAmounts(document.getElementById("np-hours").value, document.getElementById("np-unit").value);
  document.getElementById("np-supply").textContent = won(a.supply);
  document.getElementById("np-vat").textContent = won(a.vat);
  document.getElementById("np-total").textContent = won(a.total);
}

document.querySelectorAll('input[name="np-type"]').forEach((r) =>
  r.addEventListener("change", () => setContractType(selectedContractType()))
);
["np-hours", "np-unit"].forEach((id) => document.getElementById(id).addEventListener("input", updateMatchingAmounts));

// 강의료 입금예정일: 날짜 지정 / 미정
function selectedPayType() {
  const el = document.querySelector('input[name="np-paytype"]:checked');
  return el ? el.value : "fixed";
}
function setPayType(type) {
  document.querySelectorAll('input[name="np-paytype"]').forEach((r) => (r.checked = r.value === type));
  const undecided = type === "undecided";
  document.getElementById("np-paydate").classList.toggle("hidden", undecided);
  document.getElementById("np-due").classList.toggle("hidden", undecided);
  document.getElementById("np-due-hint").classList.toggle("hidden", undecided);
  document.getElementById("np-due-undecided").classList.toggle("hidden", !undecided);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
document.querySelectorAll('input[name="np-paytype"]').forEach((r) =>
  r.addEventListener("change", () => setPayType(selectedPayType()))
);
document.getElementById("np-paydate").addEventListener("change", (e) => {
  // 대행비는 강의료를 받은 당일 입금 (늦어지는 것을 막기 위해 기본값을 당일로)
  if (e.target.value) document.getElementById("np-due").value = e.target.value;
});

// 회사 정보에 저장된 대행비 입금 계좌를 프로그램 만들기 화면에도 보여 준다
async function showDepositLine() {
  const el = document.getElementById("np-deposit-line");
  try {
    const doc = await db.collection("settings").doc("company").get();
    const c = doc.exists ? doc.data() : {};
    el.innerHTML = c.depositAccount
      ? `입금 계좌: <strong>${escapeHtml(c.depositBank || "")} ${escapeHtml(c.depositAccount)}</strong> (예금주 ${escapeHtml(c.depositHolder || c.companyName || "")})`
      : `<span style="color:var(--danger)">입금 계좌가 아직 없어요. "회사(발주처) 정보 설정"에서 먼저 넣어 주세요.</span>`;
  } catch (e) {
    el.textContent = "";
  }
}

// 직접 위촉 강사비: 일급/시급이면 일수·시간 입력칸 표시
function updateFeeQty() {
  const t = document.getElementById("np-fee-type").value;
  const q = document.getElementById("np-fee-qty");
  q.classList.toggle("hidden", t === "총액");
  q.placeholder = t === "일급" ? "일수" : "시간";
}
document.getElementById("np-fee-type").addEventListener("change", updateFeeQty);
let editingProgramId = null; // null이면 새로 만들기, 값이 있으면 해당 프로그램을 수정하는 중

document.getElementById("open-new-program").addEventListener("click", () => {
  editingProgramId = null;
  ["np-name", "np-start-date", "np-start-time", "np-end-date", "np-end-time", "np-fee", "np-travel", "np-etc",
   "np-proposer", "np-hours", "np-due", "np-lecture-fee", "np-paydate", "np-fee-qty"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
  document.getElementById("np-unit").value = 10000;
  document.getElementById("np-fee-type").value = "총액";
  updateFeeQty();
  setPayType("fixed");
  setContractType("direct");
  showDepositLine();
  document.getElementById("np-error").textContent = "";
  document.getElementById("np-modal-title").textContent = "새 프로그램 만들기";
  document.getElementById("np-submit").textContent = "만들기";
  newProgramModal.classList.remove("hidden");
});
document.getElementById("np-cancel").addEventListener("click", () => newProgramModal.classList.add("hidden"));

// 기존 프로그램 정보를 모달에 채워넣고 "수정 모드"로 연다.
// 시작/종료 날짜·시간은 새로 만들 때 저장해둔 개별 필드(startDate 등)를 그대로 불러와 채운다.
async function openEditProgramModal(id) {
  const doc = await db.collection("programs").doc(id).get();
  if (!doc.exists) return;
  const p = doc.data();
  editingProgramId = id;

  document.getElementById("np-name").value = p.name || "";
  document.getElementById("np-start-date").value = p.startDate || "";
  document.getElementById("np-start-time").value = p.startTime || "";
  // 저장 시 종료 날짜가 없으면 시작 날짜와 같은 값으로 채워뒀으므로, 같으면 하루짜리로 보고 비워둔다.
  document.getElementById("np-end-date").value = p.endDate && p.endDate !== p.startDate ? p.endDate : "";
  document.getElementById("np-end-time").value = p.endTime || "";
  document.getElementById("np-fee-type").value = p.feeType || "총액";
  document.getElementById("np-fee").value = p.fee || "";
  document.getElementById("np-travel").value = p.travelFee || "";
  document.getElementById("np-etc").value = p.etc || "";
  document.getElementById("np-proposer").value = p.proposerName || "";
  document.getElementById("np-hours").value = p.hours || "";
  document.getElementById("np-unit").value = p.unitFee || 10000;
  document.getElementById("np-due").value = p.dueDate || "";
  document.getElementById("np-lecture-fee").value = p.lectureFeeRef || "";
  document.getElementById("np-paydate").value = p.lecturePayDate || "";
  document.getElementById("np-fee-qty").value = p.feeQty || "";
  updateFeeQty();
  setPayType(p.payDateType === "undecided" ? "undecided" : "fixed");
  showDepositLine();
  setContractType(p.contractType === "matching" ? "matching" : "direct");
  document.getElementById("np-error").textContent = "";
  document.getElementById("np-modal-title").textContent = "프로그램 수정";
  document.getElementById("np-submit").textContent = "수정 완료";
  newProgramModal.classList.remove("hidden");
}

// 시작/종료 날짜·시간을 하나로 합쳐 계약서·안내문에 표시할 문구를 만든다.
// - 종료 날짜가 없거나 시작 날짜와 같으면 하루짜리 강의로 처리
// - 종료 날짜가 다르면 "1박 2일" 처럼 여러 날에 걸친 프로그램으로 처리
function formatProgramDateTime(startDate, startTime, endDate, endTime) {
  if (!startDate) return "";
  const effectiveEnd = endDate || startDate;
  const sameDay = effectiveEnd === startDate;

  if (sameDay) {
    if (startTime && endTime) return `${startDate} ${startTime}~${endTime}`;
    if (startTime) return `${startDate} ${startTime}~`;
    return startDate;
  }
  if (startTime && endTime) return `${startDate} ${startTime} ~ ${effectiveEnd} ${endTime}`;
  if (startTime) return `${startDate} ${startTime} ~ ${effectiveEnd}`;
  return `${startDate} ~ ${effectiveEnd}`;
}

document.getElementById("np-submit").addEventListener("click", async () => {
  const name = document.getElementById("np-name").value.trim();
  const startDate = document.getElementById("np-start-date").value;
  const startTime = document.getElementById("np-start-time").value;
  const endDate = document.getElementById("np-end-date").value;
  const endTime = document.getElementById("np-end-time").value;
  const fee = Number(document.getElementById("np-fee").value || 0);
  const feeType = document.getElementById("np-fee-type").value;
  const travelFee = Number(document.getElementById("np-travel").value || 0);
  const etc = document.getElementById("np-etc").value.trim();
  const contractType = selectedContractType();
  const proposerName = document.getElementById("np-proposer").value.trim();
  const hours = Number(document.getElementById("np-hours").value || 0);
  const unitFee = Number(document.getElementById("np-unit").value || 0);
  const dueDate = document.getElementById("np-due").value;
  const lectureFeeRef = document.getElementById("np-lecture-fee").value.trim();
  const payDateType = selectedPayType();
  const lecturePayDate = payDateType === "fixed" ? document.getElementById("np-paydate").value : "";
  const feeQty = feeType === "총액" ? 0 : Number(document.getElementById("np-fee-qty").value || 0);
  const amounts = calcMatchingAmounts(hours, unitFee);
  const errEl = document.getElementById("np-error");

  if (!name || !startDate) {
    errEl.textContent = "프로그램명과 강의 시작일은 필수입니다.";
    return;
  }
  if (contractType === "matching" && (!proposerName || !hours || !unitFee)) {
    errEl.textContent = "강의섭외대행은 제안사명, 강의 시간, 시간당 대행비가 필수입니다.";
    return;
  }
  if (endDate && endDate < startDate) {
    errEl.textContent = "종료 날짜는 시작 날짜보다 빠를 수 없습니다.";
    return;
  }

  const dateTime = formatProgramDateTime(startDate, startTime, endDate, endTime);

  // 유형별 저장 필드 (직접 위촉 건에는 대행비 필드를 비워 둔다)
  const typeFields =
    contractType === "matching"
      ? { contractType, proposerName, hours, unitFee, supplyAmount: amounts.supply, vatAmount: amounts.vat,
          totalAmount: amounts.total, payDateType, lecturePayDate, dueDate: payDateType === "fixed" ? dueDate : "",
          lectureFeeRef, fee: 0, feeType: "총액", feeQty: 0, travelFee: 0 }
      : { contractType, proposerName: "", hours: 0, unitFee: 0, supplyAmount: 0, vatAmount: 0, totalAmount: 0,
          payDateType: "", lecturePayDate: "", dueDate: "", lectureFeeRef: "", fee, feeType, feeQty, travelFee };

  if (editingProgramId) {
    await db.collection("programs").doc(editingProgramId).update({
      name,
      dateTime,
      startDate,
      startTime,
      endDate: endDate || startDate,
      endTime,
      etc,
      ...typeFields,
    });
    newProgramModal.classList.add("hidden");
    editingProgramId = null;
    loadPrograms();
    return;
  }

  const docRef = await db.collection("programs").add({
    name,
    dateTime,
    startDate,
    startTime,
    endDate: endDate || startDate,
    endTime,
    etc,
    ...typeFields,
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: auth.currentUser.uid,
  });

  newProgramModal.classList.add("hidden");
  loadPrograms();
  showLinkModal(docRef.id);
});

// ---------------------------------------------------------------
// 회사(발주처) 정보
// ---------------------------------------------------------------

const companyModal = document.getElementById("company-modal");
document.getElementById("open-company-settings").addEventListener("click", async () => {
  document.getElementById("cs-error").textContent = "";
  const doc = await db.collection("settings").doc("company").get();
  const c = doc.exists ? doc.data() : {};
  document.getElementById("cs-name").value = c.companyName || "";
  document.getElementById("cs-bizregno").value = c.bizRegNo || "";
  document.getElementById("cs-ceo").value = c.ceoName || "";
  document.getElementById("cs-address").value = c.address || "";
  document.getElementById("cs-phone").value = c.phone || "";
  document.getElementById("cs-dep-bank").value = c.depositBank || "";
  document.getElementById("cs-dep-account").value = c.depositAccount || "";
  document.getElementById("cs-dep-holder").value = c.depositHolder || "";
  companyModal.classList.remove("hidden");
});
document.getElementById("cs-cancel").addEventListener("click", () => companyModal.classList.add("hidden"));

document.getElementById("cs-submit").addEventListener("click", async () => {
  const companyName = document.getElementById("cs-name").value.trim();
  const bizRegNo = document.getElementById("cs-bizregno").value.trim();
  const ceoName = document.getElementById("cs-ceo").value.trim();
  const address = document.getElementById("cs-address").value.trim();
  const phone = document.getElementById("cs-phone").value.trim();
  const depositBank = document.getElementById("cs-dep-bank").value.trim();
  const depositAccount = document.getElementById("cs-dep-account").value.trim();
  const depositHolder = document.getElementById("cs-dep-holder").value.trim();
  const errEl = document.getElementById("cs-error");

  if (!companyName) {
    errEl.textContent = "회사명은 필수입니다.";
    return;
  }

  await db.collection("settings").doc("company").set(
    { companyName, bizRegNo, ceoName, address, phone, depositBank, depositAccount, depositHolder },
    { merge: true }
  );
  companyModal.classList.add("hidden");
});

// ---------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------

function won(n) {
  const num = Number(n || 0);
  return num.toLocaleString("ko-KR") + "원";
}

// 강사비가 총액(고정)이 아니라 일급/시급 단위로 책정된 경우, 금액 뒤에 단위를 표시해준다.
function feeTypeSuffix(feeType) {
  if (feeType === "일급") return " (일급)";
  if (feeType === "시급") return " (시급)";
  return "";
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

