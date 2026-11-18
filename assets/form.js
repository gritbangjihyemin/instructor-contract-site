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
let companyData = {};
let signaturePadReady = false;
const isMatchingProgram = () => programData && programData.contractType === "matching";

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
    try {
      const cdoc = await db.collection("settings").doc("company").get();
      if (cdoc.exists) companyData = cdoc.data();
    } catch (e) {
      console.warn("회사 정보를 불러오지 못했습니다", e);
    }
    loadingMsg.classList.add("hidden");
    programInfoEl.classList.remove("hidden");
    if (isMatchingProgram()) {
      renderMatchingProgramInfo(programData);
      setupMatchingNotice();
      document.getElementById("m-notice-view").classList.remove("hidden");
    } else {
      renderProgramInfo(programData);
      noticeViewEl.classList.remove("hidden");
      setupRrnFormatting();
    }
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
    directPad = setupSignaturePad("signature-pad", "sig-clear");
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
      <tr><th>강사비</th><td>${won(p.fee)}${feeTypeSuffix(p.feeType)}</td></tr>
      <tr><th>출장여비</th><td>${won(p.travelFee)}</td></tr>
      ${p.etc ? `<tr><th>기타</th><td class="wrap-cell">${escapeHtml(p.etc)}</td></tr>` : ""}
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

let directPad = null;

// canvasId: 서명 캔버스, clearId: "서명 지우기" 버튼. 서명 여부는 반환 객체의 hasSignature로 확인한다.
function setupSignaturePad(canvasId, clearId) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas.parentElement;
  const state = { hasSignature: false, canvas };
  let ctx, drawing = false;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = 160;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";
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
    state.hasSignature = true;
    const p = pos(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(evt) {
    if (!drawing) return;
    evt.preventDefault();
    const p = pos(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() { drawing = false; }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  document.getElementById(clearId).addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.hasSignature = false;
  });
  return state;
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
  if (!directPad || !directPad.hasSignature) {
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
  document.getElementById("m-form").classList.add("hidden");
  programInfoEl.classList.add("hidden");
  doneView.classList.remove("hidden");

  const company = companyData || {};
  const previewEl = document.getElementById("contract-preview");
  const matching = isMatchingProgram();
  previewEl.innerHTML = matching
    ? renderMatchingContractHTML(company, programData, submission)
    : renderContractHTML(company, programData, submission);
  const fileLabel = matching ? "강의섭외대행약정서" : "강사계약서";

  document.getElementById("download-pdf-btn").addEventListener("click", () => {
    downloadContractPDF(previewEl, `${fileLabel}_${submission.instructorName}`);
  });
  document.getElementById("print-btn").addEventListener("click", () => window.print());
}

// won() / escapeHtml()는 assets/contract.js 에 정의되어 있습니다 (공용 유틸).


// ===================================================================
// 강의섭외대행 전용 (안내 → 정보 입력 → 약정서)
// ===================================================================

function renderMatchingProgramInfo(p) {
  programInfoEl.innerHTML = `
    <span class="type-badge matching">강의섭외대행</span>
    <h2 style="margin-top:6px">${escapeHtml(p.name)}</h2>
    <table>
      <tr><th style="width:110px">제안사</th><td>${escapeHtml(p.proposerName || "")}</td></tr>
      <tr><th>일시</th><td>${escapeHtml(p.dateTime || "")}</td></tr>
      <tr><th>강의 시간</th><td>${p.hours || 0}시간</td></tr>
      <tr><th>강의료 입금예정일</th><td>${escapeHtml(matchingPayDateText(p))}</td></tr>
      <tr><th>대행비 입금기한</th><td>${escapeHtml(matchingDueText(p))}</td></tr>
      ${p.lectureFeeRef ? `<tr><th>강의료</th><td>${escapeHtml(p.lectureFeeRef)} <span class="muted">(제안사가 직접 지급)</span></td></tr>` : ""}
      ${p.etc ? `<tr><th>기타</th><td class="wrap-cell">${escapeHtml(p.etc)}</td></tr>` : ""}
    </table>
    <div class="amount-box" style="margin-top:14px">
      <div><span>강의섭외대행비 (${won(p.unitFee)} × ${p.hours || 0}시간)</span><strong>${won(p.supplyAmount)}</strong></div>
      <div><span>부가세 (10%)</span><strong>${won(p.vatAmount)}</strong></div>
      <div class="total"><span>입금하실 금액</span><strong>${won(p.totalAmount)}</strong></div>
    </div>
    <div class="deposit-card">
      <div><span>입금 계좌</span><strong id="m-deposit-account">${escapeHtml(depositAccountShort(companyData))}</strong></div>
      <div><span>입금기한</span><strong>${escapeHtml(matchingDueText(p))}</strong></div>
      ${companyData.depositAccount ? `<button type="button" class="secondary small" id="m-copy-account">계좌번호 복사</button>` : ""}
    </div>
    ${vatReasonHTML()}
  `;
  const copyBtn = document.getElementById("m-copy-account");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const text = (companyData.depositAccount || "").replace(/[^0-9]/g, "");
      navigator.clipboard.writeText(text).then(
        () => { copyBtn.textContent = "복사됨!"; setTimeout(() => (copyBtn.textContent = "계좌번호 복사"), 1500); },
        () => { copyBtn.textContent = "복사하지 못했어요. 직접 적어 주세요"; }
      );
    });
  }
}


function depositAccountShort(c) {
  if (!c.depositAccount) return "담당자가 별도로 안내드려요";
  return `${c.depositBank || ""} ${c.depositAccount} (예금주 ${c.depositHolder || c.companyName || ""})`;
}

function depositAccountText(c) {
  if (!c.depositBank && !c.depositAccount) return "입금 계좌는 담당자가 별도로 안내드립니다.";
  return `입금 계좌: ${c.depositBank || ""} ${c.depositAccount || ""} (예금주: ${c.depositHolder || c.companyName || ""})`;
}

let matchingPad = null;

function setupMatchingNotice() {
  document.getElementById("m-due-text").textContent = matchingDueText(programData);
  document.getElementById("m-undecided-text").classList.toggle("hidden", programData.payDateType !== "undecided");
  document.getElementById("m-account-text").textContent = "💳 " + depositAccountText(companyData);

  document.getElementById("m-notice-continue-btn").addEventListener("click", () => {
    const errEl = document.getElementById("m-notice-error");
    const allChecked = ["m-notice-check-1", "m-notice-check-2", "m-notice-check-3"].every(
      (id) => document.getElementById(id).checked
    );
    if (!allChecked) {
      errEl.textContent = "안내사항 3가지를 모두 확인 후 체크해주셔야 다음 단계로 진행할 수 있습니다.";
      return;
    }
    errEl.textContent = "";
    document.getElementById("m-notice-view").classList.add("hidden");
    const mForm = document.getElementById("m-form");
    mForm.classList.remove("hidden");
    if (!matchingPad) {
      matchingPad = setupSignaturePad("m-signature-pad", "m-sig-clear");
      setupMatchingFormInputs();
    }
    mForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// 휴대폰번호: 010-0000-0000 / 사업자등록번호: 000-00-00000 형태로 자동 하이픈
function formatPhone(v) {
  const d = v.replace(/[^0-9]/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
  return d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + "-" + d.slice(d.length - 4);
}
function formatBizNo(v) {
  const d = v.replace(/[^0-9]/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 6) return d.slice(0, 3) + "-" + d.slice(3);
  return d.slice(0, 3) + "-" + d.slice(3, 5) + "-" + d.slice(5);
}
const selectedReceiptType = () => document.querySelector('input[name="m-receipt"]:checked').value;

function setupMatchingFormInputs() {
  const phoneEl = document.getElementById("m-phone");
  const noEl = document.getElementById("m-receipt-no");
  const sameEl = document.getElementById("m-same-phone");

  phoneEl.addEventListener("input", () => {
    phoneEl.value = formatPhone(phoneEl.value);
    if (sameEl.checked && selectedReceiptType() === "현금영수증") noEl.value = phoneEl.value;
  });
  noEl.addEventListener("input", () => {
    noEl.value = selectedReceiptType() === "현금영수증" ? formatPhone(noEl.value) : formatBizNo(noEl.value);
    sameEl.checked = false;
  });
  sameEl.addEventListener("change", () => {
    if (sameEl.checked) noEl.value = phoneEl.value;
  });

  document.querySelectorAll('input[name="m-receipt"]').forEach((r) =>
    r.addEventListener("change", () => {
      const biz = selectedReceiptType() === "사업자지출증빙";
      document.getElementById("m-receipt-label").textContent = biz
        ? "사업자등록번호 *"
        : "현금영수증 발급 번호 (휴대폰번호) *";
      noEl.placeholder = biz ? "000-00-00000" : "010-0000-0000";
      noEl.maxLength = biz ? 12 : 13;
      noEl.value = "";
      sameEl.checked = false;
      document.getElementById("m-same-phone-wrap").classList.toggle("hidden", biz);
      document.getElementById("m-biz-wrap").classList.toggle("hidden", !biz);
    })
  );

  document.getElementById("m-form").addEventListener("submit", submitMatchingForm);
}

async function submitMatchingForm(evt) {
  evt.preventDefault();
  const errEl = document.getElementById("m-form-error");
  errEl.textContent = "";

  const instructorName = document.getElementById("m-name").value.trim();
  const phone = document.getElementById("m-phone").value.trim();
  const receiptType = selectedReceiptType();
  const receiptNumber = document.getElementById("m-receipt-no").value.trim();
  const bizName = document.getElementById("m-biz-name").value.trim();
  const phoneRe = /^01\d-\d{3,4}-\d{4}$/;

  if (!instructorName || !phone) {
    errEl.textContent = "강사명과 휴대폰번호를 입력해주세요.";
    return;
  }
  if (!phoneRe.test(phone)) {
    errEl.textContent = "휴대폰번호 형식이 올바르지 않습니다. (예: 010-1234-5678)";
    return;
  }
  if (receiptType === "현금영수증" && !phoneRe.test(receiptNumber)) {
    errEl.textContent = "현금영수증 발급 번호(휴대폰번호)를 정확히 입력해주세요.";
    return;
  }
  if (receiptType === "사업자지출증빙") {
    if (!/^\d{3}-\d{2}-\d{5}$/.test(receiptNumber)) {
      errEl.textContent = "사업자등록번호 형식이 올바르지 않습니다. (예: 123-45-67890)";
      return;
    }
    if (!bizName) {
      errEl.textContent = "상호명을 입력해주세요.";
      return;
    }
  }
  if (!matchingPad || !matchingPad.hasSignature) {
    errEl.textContent = "서명을 입력해주세요.";
    return;
  }
  if (!document.getElementById("m-confirm").checked) {
    errEl.textContent = "내용 확인 및 개인정보 수집·이용 동의 체크박스를 확인해주세요.";
    return;
  }

  const submitBtn = document.getElementById("m-submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중...";

  const submission = {
    contractType: "matching",
    programId: pid,
    instructorName,
    phone,
    receiptType,
    receiptNumber,
    bizName: receiptType === "사업자지출증빙" ? bizName : "",
    signature: matchingPad.canvas.toDataURL("image/png"),
    agreedNotices: true,
    paid: false,
    receiptIssued: false,
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
}
