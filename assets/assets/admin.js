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

function programLink(pid) {
  return `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "")}/form.html?pid=${pid}`;
}

async function handleProgramAction(btn) {
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === "link") {
    showLinkModal(programLink(id));
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

function showLinkModal(link) {
  document.getElementById("link-box-text").textContent = link;
  document.getElementById("link-modal").classList.remove("hidden");
  document.getElementById("link-copy-btn").onclick = () => {
    navigator.clipboard.writeText(link).then(() => {
      document.getElementById("link-copy-btn").textContent = "복사됨!";
      setTimeout(() => (document.getElementById("link-copy-btn").textContent = "링크 복사"), 1500);
    });
  };
}
document.getElementById("link-close-btn").addEventListener("click", () => {
  document.getElementById("link-modal").classList.add("hidden");
});

// ---------------------------------------------------------------
// 새 프로그램 만들기
// ---------------------------------------------------------------

const newProgramModal = document.getElementById("new-program-modal");
document.getElementById("open-new-program").addEventListener("click", () => {
  ["np-name", "np-datetime", "np-fee", "np-travel", "np-etc"].forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("np-error").textContent = "";
  newProgramModal.classList.remove("hidden");
});
document.getElementById("np-cancel").addEventListener("click", () => newProgramModal.classList.add("hidden"));

document.getElementById("np-submit").addEventListener("click", async () => {
  const name = document.getElementById("np-name").value.trim();
  const dateTime = document.getElementById("np-datetime").value.trim();
  const fee = Number(document.getElementById("np-fee").value || 0);
  const travelFee = Number(document.getElementById("np-travel").value || 0);
  const etc = document.getElementById("np-etc").value.trim();
  const errEl = document.getElementById("np-error");

  if (!name || !dateTime) {
    errEl.textContent = "프로그램명과 강의 일시는 필수입니다.";
    return;
  }

  const docRef = await db.collection("programs").add({
    name,
    dateTime,
    fee,
    travelFee,
    etc,
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: auth.currentUser.uid,
  });

  newProgramModal.classList.add("hidden");
  loadPrograms();
  showLinkModal(programLink(docRef.id));
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
