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
      return `
      <div class="program-item">
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          <span class="status ${statusClass}">${statusText}</span>
          <div class="meta">
            ${escapeHtml(p.dateTime || "")} · 강사비 ${won(p.fee)} · 제출 ${p.submissionCount}명
          </div>
        </div>
        <div class="btn-row" style="margin:0">
          <button class="secondary" data-action="link" data-id="${p.id}">링크 복사</button>
          <a class="btn secondary" href="program-detail.html?pid=${p.id}">상세보기</a>
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
document.getElementById("open-new-program").addEventListener("click", () => {
  ["np-name", "np-start-date", "np-start-time", "np-end-date", "np-end-time", "np-fee", "np-travel", "np-etc"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
  document.getElementById("np-error").textContent = "";
  newProgramModal.classList.remove("hidden");
});
document.getElementById("np-cancel").addEventListener("click", () => newProgramModal.classList.add("hidden"));

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
  const travelFee = Number(document.getElementById("np-travel").value || 0);
  const etc = document.getElementById("np-etc").value.trim();
  const errEl = document.getElementById("np-error");

  if (!name || !startDate) {
    errEl.textContent = "프로그램명과 강의 시작일은 필수입니다.";
    return;
  }
  if (endDate && endDate < startDate) {
    errEl.textContent = "종료 날짜는 시작 날짜보다 빠를 수 없습니다.";
    return;
  }

  const dateTime = formatProgramDateTime(startDate, startTime, endDate, endTime);

  const docRef = await db.collection("programs").add({
    name,
    dateTime,
    startDate,
    startTime,
    endDate: endDate || startDate,
    endTime,
    fee,
    travelFee,
    etc,
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
  companyModal.classList.remove("hidden");
});
document.getElementById("cs-cancel").addEventListener("click", () => companyModal.classList.add("hidden"));

document.getElementById("cs-submit").addEventListener("click", async () => {
  const companyName = document.getElementById("cs-name").value.trim();
  const bizRegNo = document.getElementById("cs-bizregno").value.trim();
  const ceoName = document.getElementById("cs-ceo").value.trim();
  const address = document.getElementById("cs-address").value.trim();
  const phone = document.getElementById("cs-phone").value.trim();
  const errEl = document.getElementById("cs-error");

  if (!companyName) {
    errEl.textContent = "회사명은 필수입니다.";
    return;
  }

  await db.collection("settings").doc("company").set({ companyName, bizRegNo, ceoName, address, phone }, { merge: true });
  companyModal.classList.add("hidden");
});

// ---------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------

function won(n) {
  const num = Number(n || 0);
  return num.toLocaleString("ko-KR") + "원";
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
