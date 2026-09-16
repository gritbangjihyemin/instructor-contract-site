// ===================================================================
// 강사 정보 입력 폼 로직
// ===================================================================

const params = new URLSearchParams(window.location.search);
const pid = params.get("pid");

const loadingMsg = document.getElementById("loading-msg");
const notFoundMsg = document.getElementById("not-found-msg");
const programInfoEl = document.getElementById("program-info");
const noticeViewEl = document.getElementById("notice-view");
const formEl = document.getElementById("instructor-form");
const doneView = document.getElementById("done-view");

let programData = null;
let signaturePadReady = false;

init();

async function init() {
  if (!pid) {
    showNotFound();
    return;
  }
  try {
    const doc = await db.collection("programs").doc(pid).get();
    if (!doc.exists || doc.data().active === false) {
      showNotFound();
      return;
    }
    programData = doc.data();
    renderProgramInfo(programData);
    loadingMsg.classList.add("hidden");
    programInfoEl.classList.remove("hidden");
    noticeViewEl.classList.remove("hidden");
    setupRrnFormatting();
  } catch (e) {
    console.error(e);
    showNotFound();
  }
}

// ---------------------------------------------------------------
// 강사 정보 입력 전 필수 확인사항 (강사비 지급 / 일정확인 / 유의사항)
// ---------------------------------------------------------------

document.getElementById("notice-continue-btn").addEventListener("click", () => {
  const errEl = document.getElementById("notice-error");
  const allChecked = ["notice-check-1", "notice-check-2", "notice-check-3"].every(
    (id) => document.getElementById(id).checked
  );
  if (!allChecked) {
    errEl.textContent = "안내사항 3가지를 모두 확인 후 체크해주셔야 다음 단계로 진행할 수 있습니다.";
    return;
  }
  errEl.textContent = "";
  noticeViewEl.classList.add("hidden");
  formEl.classList.remove("hidden");
  if (!signaturePadReady) {
    setupSignaturePad();
    signaturePadReady = true;
  }
  formEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

function showNotFound() {
  loadingMsg.classList.add("hidden");
  notFoundMsg.classList.remove("hidden");
}

function renderProgramInfo(p) {
  programInfoEl.innerHTML = `
    <h2 style="margin-top:0">${escapeHtml(p.name)}</h2>
    <table>
      <tr><th style="width:100px">일시</th><td>${escapeHtml(p.dateTime || "")}</td></tr>
      <tr><th>강사비</th><td>${won(p.fee)}</td></tr>
      <tr><th>출장여비</th><td>${won(p.travelFee)}</td></tr>
      ${p.etc ? `<tr><th>기타</th><td>${escapeHtml(p.etc)}</td></tr>` : ""}
    </table>
    <p class="hint" style="color:var(--text-muted)">위 프로그램에 대한 강사 계약 정보를 아래에 입력해주세요.</p>
  `;
}

// ---------------------------------------------------------------
// 주민등록번호 자동 하이픈
// ---------------------------------------------------------------

function setupRrnFormatting() {
  const el = document.getElementById("f-rrn");
  el.addEventListener("input", () => {
    let digits = el.value.replace(/[^0-9]/g, "").slice(0, 13);
    if (digits.length > 6) {
      el.value = digits.slice(0, 6) + "-" + digits.slice(6);
    } else {
      el.value = digits;
    }
  });
}

function isValidRrn(v) {
  return /^\d{6}-\d{7}$/.test(v);
}

// ---------------------------------------------------------------
// 서명 캔버스 (마우스 / 터치)
// ---------------------------------------------------------------

let sigCtx, drawing = false, hasSignature = false;

function setupSignaturePad() {
  const canvas = document.getElementById("signature-pad");
  const wrap = canvas.parentElement;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = 160;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    sigCtx = canvas.getContext("2d");
    sigCtx.scale(ratio, ratio);
    sigCtx.lineWidth = 2;
    sigCtx.lineCap = "round";
    sigCtx.strokeStyle = "#1a1a1a";
  }
  resize();
  window.addEventListener("resize", resize);

  function pos(evt) {
    const rect = canvas.getBoundingClientRect();
    const point = evt.touches ? evt.touches[0] : evt;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(evt) {
    evt.preventDefault();
    drawing = true;
    hasSignature = true;
    const p = pos(evt);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
  }
  function move(evt) {
    if (!drawing) return;
    evt.preventDefault();
    const p = pos(evt);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
  }
  function end() { drawing = false; }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  document.getElementById("sig-clear").addEventListener("click", () => {
    sigCtx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
  });
}

// ---------------------------------------------------------------
// 제출
// ---------------------------------------------------------------

formEl.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  const errEl = document.getElementById("form-error");
  errEl.textContent = "";

  const instructorName = document.getElementById("f-name").value.trim();
  const rrn = document.getElementById("f-rrn").value.trim();
  const bankName = document.getElementById("f-bank").value;
  const accountHolder = document.getElementById("f-holder").value.trim();
  const accountNumber = document.getElementById("f-account").value.replace(/[^0-9]/g, "");
  const withholdingType = document.querySelector('input[name="withholding"]:checked').value;
  const confirmed = document.getElementById("f-confirm").checked;

  if (!instructorName || !bankName || !accountHolder || !accountNumber) {
    errEl.textContent = "모든 필수 항목을 입력해주세요.";
    return;
  }
  if (!isValidRrn(rrn)) {
    errEl.textContent = "주민등록번호 형식이 올바르지 않습니다. (예: 900101-1234567)";
    return;
  }
  if (!hasSignature) {
    errEl.textContent = "서명을 입력해주세요.";
    return;
  }
  if (!confirmed) {
    errEl.textContent = "내용 확인 및 개인정보 수집·이용 동의 체크박스를 확인해주세요.";
    return;
  }

  const signatureDataUrl = document.getElementById("signature-pad").toDataURL("image/png");
  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중...";

  const submission = {
    programId: pid,
    instructorName,
    rrn,
    bankName,
    accountHolder,
    accountNumber,
    withholdingType,
    signature: signatureDataUrl,
    agreedNotices: true,
  };

  try {
    await db.collection("submissions").add({
      ...submission,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await showDone(submission);
  } catch (e) {
    console.error(e);
    errEl.textContent = "제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    submitBtn.disabled = false;
    submitBtn.textContent = "제출하기";
  }
});

async function showDone(submission) {
  formEl.classList.add("hidden");
  programInfoEl.classList.add("hidden");
  doneView.classList.remove("hidden");

  let company = {};
  try {
    const cdoc = await db.collection("settings").doc("company").get();
    if (cdoc.exists) company = cdoc.data();
  } catch (e) {
    console.warn("회사 정보를 불러오지 못했습니다", e);
  }

  const previewEl = document.getElementById("contract-preview");
  previewEl.innerHTML = renderContractHTML(company, programData, submission);

  document.getElementById("download-pdf-btn").addEventListener("click", () => {
    downloadContractPDF(previewEl, `강사계약서_${submission.instructorName}`);
  });
  document.getElementById("print-btn").addEventListener("click", () => window.print());
}

// won() / escapeHtml()는 assets/contract.js 에 정의되어 있습니다 (공용 유틸).
