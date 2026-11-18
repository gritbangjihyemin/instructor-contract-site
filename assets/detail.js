// ===================================================================
// 프로그램 상세 (제출 현황 / 엑셀 다운로드 / 계약서 PDF)
// ===================================================================

const dParams = new URLSearchParams(window.location.search);
const dPid = dParams.get("pid");

let dProgram = null;
let dCompany = {};
let dSubmissions = [];

auth.onAuthStateChanged((user) => {
  if (user) {
    document.getElementById("auth-gate").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
    loadAll();
  } else {
    document.getElementById("auth-gate").classList.remove("hidden");
    document.getElementById("content").classList.add("hidden");
  }
});

async function loadAll() {
  if (!dPid) {
    document.getElementById("program-summary").innerHTML = "<p class='error-msg'>잘못된 접근입니다.</p>";
    return;
  }

  let progDoc, companyDoc, subSnap;
  try {
    [progDoc, companyDoc, subSnap] = await Promise.all([
      db.collection("programs").doc(dPid).get(),
      db.collection("settings").doc("company").get(),
      // programId 필터 + submittedAt 정렬을 Firestore 쿼리에서 함께 하면 별도의 복합 색인이 필요해
      // 색인이 없는 경우 조회가 조용히 실패한다. 필터만 하고 정렬은 아래에서 직접 처리한다.
      db.collection("submissions").where("programId", "==", dPid).get(),
    ]);
  } catch (e) {
    console.error(e);
    document.getElementById("program-summary").innerHTML =
      "<p class='error-msg'>데이터를 불러오는 중 오류가 발생했습니다: " + escapeHtml(e.message || String(e)) + "</p>";
    return;
  }

  if (!progDoc.exists) {
    document.getElementById("program-summary").innerHTML = "<p class='error-msg'>존재하지 않는 프로그램입니다.</p>";
    return;
  }

  dProgram = progDoc.data();
  dCompany = companyDoc.exists ? companyDoc.data() : {};
  dSubmissions = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  dSubmissions.sort((a, b) => {
    const at = a.submittedAt && a.submittedAt.toMillis ? a.submittedAt.toMillis() : 0;
    const bt = b.submittedAt && b.submittedAt.toMillis ? b.submittedAt.toMillis() : 0;
    return bt - at;
  });

  if (dProgram.contractType === "matching") {
    renderMatchingSummary();
    renderMatchingTable();
  } else {
    renderSummary();
    renderTable();
  }
}

function renderSummary() {
  const el = document.getElementById("program-summary");
  el.innerHTML = `
    <h2 style="margin-top:0">${escapeHtml(dProgram.name)}</h2>
    <table>
      <tr><th style="width:100px">일시</th><td>${escapeHtml(dProgram.dateTime || "")}</td></tr>
      <tr><th>강사비</th><td>${won(dProgram.fee)}${feeTypeSuffix(dProgram.feeType)}</td></tr>
      <tr><th>출장여비</th><td>${won(dProgram.travelFee)}</td></tr>
      <tr><th>제출 인원</th><td>${dSubmissions.length}명</td></tr>
      ${dProgram.etc ? `<tr><th>기타</th><td class="wrap-cell">${escapeHtml(dProgram.etc)}</td></tr>` : ""}
    </table>
  `;
}

function renderTable() {
  const tbody = document.getElementById("submission-tbody");
  const noHint = document.getElementById("no-submission-hint");
  if (dSubmissions.length === 0) {
    tbody.innerHTML = "";
    noHint.style.display = "block";
    return;
  }
  noHint.style.display = "none";

  tbody.innerHTML = dSubmissions
    .map(
      (s, idx) => `
    <tr>
      <td>${fmtDate(s.submittedAt)}</td>
      <td>${escapeHtml(s.instructorName)}</td>
      <td><span class="rrn-cell" data-idx="${idx}" data-revealed="false" style="cursor:pointer" title="클릭하면 전체 표시">${maskRRN(s.rrn)}</span></td>
      <td>${escapeHtml(s.withholdingType)}</td>
      <td>${escapeHtml(s.bankName)}</td>
      <td>${escapeHtml(s.accountHolder)}</td>
      <td>${escapeHtml(s.accountNumber)}</td>
      <td><button class="secondary" data-view-idx="${idx}">보기</button></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll(".rrn-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const idx = Number(cell.dataset.idx);
      const revealed = cell.dataset.revealed === "true";
      cell.textContent = revealed ? maskRRN(dSubmissions[idx].rrn) : dSubmissions[idx].rrn;
      cell.dataset.revealed = revealed ? "false" : "true";
    });
  });

  tbody.querySelectorAll("button[data-view-idx]").forEach((btn) => {
    btn.addEventListener("click", () => openContractModal(Number(btn.dataset.viewIdx)));
  });
}

function openContractModal(idx) {
  const s = dSubmissions[idx];
  const viewEl = document.getElementById("contract-view");
  viewEl.innerHTML = renderContractHTML(dCompany, dProgram, s);
  document.getElementById("contract-modal").classList.remove("hidden");
  const matching = dProgram.contractType === "matching";
  viewEl.innerHTML = matching ? renderMatchingContractHTML(dCompany, dProgram, s) : renderContractHTML(dCompany, dProgram, s);
  const label = matching ? "강의섭외대행약정서" : "강사계약서";
  document.getElementById("contract-download-btn").onclick = () => downloadContractPDF(viewEl, `${label}_${s.instructorName}`);
}
document.getElementById("contract-close-btn").addEventListener("click", () => {
  document.getElementById("contract-modal").classList.add("hidden");
});

// ---------------------------------------------------------------
// 엑셀 다운로드 (세무서 제출용 - 원본 데이터 그대로)
// ---------------------------------------------------------------

document.getElementById("export-excel-btn").addEventListener("click", () => {
  if (dSubmissions.length === 0) {
    alert("내보낼 제출 데이터가 없습니다.");
    return;
  }
  if (dProgram.contractType === "matching") {
    exportMatchingExcel();
    return;
  }
  const rows = dSubmissions.map((s) => ({
    "프로그램명": dProgram.name,
    "제출시각": fmtDate(s.submittedAt),
    "강사명": s.instructorName,
    "주민등록번호": s.rrn,
    "원천징수구분": s.withholdingType,
    "은행명": s.bankName,
    "예금주": s.accountHolder,
    "계좌번호": s.accountNumber,
    "강사비": dProgram.fee || 0,
    "지급방식": dProgram.feeType || "총액",
    "출장여비": dProgram.travelFee || 0,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "제출현황");
  XLSX.writeFile(wb, `${dProgram.name}_강사제출현황.xlsx`);
});

// won() / escapeHtml() / maskRRN() / fmtDate() 는 assets/contract.js 에 정의된 공용 유틸을 사용합니다.


// ===================================================================
// 강의섭외대행 프로그램: 요약 / 입금·증빙 관리 표 / 엑셀
// ===================================================================

function renderMatchingSummary() {
  const p = dProgram;
  const paidCount = dSubmissions.filter((x) => x.paid).length;
  const issuedCount = dSubmissions.filter((x) => x.receiptIssued).length;
  document.getElementById("program-summary").innerHTML = `
    <span class="type-badge matching">강의섭외대행</span>
    <h2 style="margin-top:6px">${escapeHtml(p.name)}</h2>
    <table>
      <tr><th style="width:110px">제안사</th><td>${escapeHtml(p.proposerName || "")}</td></tr>
      <tr><th>일시</th><td>${escapeHtml(p.dateTime || "")}</td></tr>
      <tr><th>강의 시간</th><td>${p.hours || 0}시간 × ${won(p.unitFee)}</td></tr>
      <tr><th>대행비 (1인)</th><td>공급가액 ${won(p.supplyAmount)} + 부가세 ${won(p.vatAmount)} = <strong>${won(p.totalAmount)}</strong></td></tr>
      <tr><th>강의료 입금예정일</th><td>${escapeHtml(matchingPayDateText(p))}</td></tr>
      <tr><th>대행비 입금기한</th><td>${escapeHtml(matchingDueText(p))}</td></tr>
      <tr><th>진행 현황</th><td>제출 ${dSubmissions.length}명 · 입금 확인 ${paidCount}명 · 증빙 발급 ${issuedCount}명</td></tr>
      ${p.etc ? `<tr><th>기타</th><td class="wrap-cell">${escapeHtml(p.etc)}</td></tr>` : ""}
    </table>
  `;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderMatchingTable() {
  document.getElementById("submission-thead").innerHTML = `
    <tr>
      <th>제출시각</th><th>강사명</th><th>연락처</th><th>증빙 유형</th><th>증빙 번호</th>
      <th>합계</th><th>강의료 수령 연락일</th><th>입금 확인</th><th>입금일</th><th>증빙 발급</th><th>약정서</th>
    </tr>`;
  const tbody = document.getElementById("submission-tbody");
  const noHint = document.getElementById("no-submission-hint");
  if (dSubmissions.length === 0) {
    tbody.innerHTML = "";
    noHint.style.display = "block";
    return;
  }
  noHint.style.display = "none";

  tbody.innerHTML = dSubmissions
    .map(
      (s, idx) => `
    <tr>
      <td>${fmtDate(s.submittedAt)}</td>
      <td>${escapeHtml(s.instructorName)}${s.bizName ? `<div class="muted">${escapeHtml(s.bizName)}</div>` : ""}</td>
      <td>${escapeHtml(s.phone || "")}</td>
      <td><span class="receipt-chip ${s.receiptType === "사업자지출증빙" ? "biz" : "cash"}">${s.receiptType === "사업자지출증빙" ? "지출증빙" : "현금영수증"}</span></td>
      <td>${escapeHtml(s.receiptNumber || "")}</td>
      <td>${won(dProgram.totalAmount)}</td>
      <td><input type="date" class="mini-date" data-feedate-idx="${idx}" value="${escapeHtml(s.lectureFeeReceivedDate || "")}" title="강사에게 강의료를 받았다고 연락 온 날" /></td>
      <td style="text-align:center"><input type="checkbox" data-paid-idx="${idx}" ${s.paid ? "checked" : ""} /></td>
      <td><input type="date" class="mini-date" data-paiddate-idx="${idx}" value="${escapeHtml(s.paidDate || "")}" /></td>
      <td style="text-align:center"><input type="checkbox" data-issued-idx="${idx}" ${s.receiptIssued ? "checked" : ""} /></td>
      <td><button class="secondary" data-view-idx="${idx}">보기</button></td>
    </tr>`
    )
    .join("");

  async function save(idx, patch) {
    const s = dSubmissions[idx];
    try {
      await db.collection("submissions").doc(s.id).update(patch);
      Object.assign(s, patch);
      renderMatchingSummary();
    } catch (e) {
      console.error(e);
      alert("저장하지 못했습니다: " + (e.message || e));
    }
  }

  tbody.querySelectorAll("input[data-paid-idx]").forEach((el) =>
    el.addEventListener("change", async () => {
      const idx = Number(el.dataset.paidIdx);
      const patch = { paid: el.checked };
      // 입금 확인을 체크할 때 입금일이 비어 있으면 오늘 날짜로 채운다
      const dateEl = tbody.querySelector(`input[data-paiddate-idx="${idx}"]`);
      if (el.checked && !dateEl.value) {
        dateEl.value = todayStr();
        patch.paidDate = dateEl.value;
      }
      await save(idx, patch);
    })
  );
  tbody.querySelectorAll("input[data-paiddate-idx]").forEach((el) =>
    el.addEventListener("change", () => save(Number(el.dataset.paiddateIdx), { paidDate: el.value }))
  );
  tbody.querySelectorAll("input[data-feedate-idx]").forEach((el) =>
    el.addEventListener("change", () => save(Number(el.dataset.feedateIdx), { lectureFeeReceivedDate: el.value }))
  );
  tbody.querySelectorAll("input[data-issued-idx]").forEach((el) =>
    el.addEventListener("change", () => save(Number(el.dataset.issuedIdx), { receiptIssued: el.checked }))
  );
  tbody.querySelectorAll("button[data-view-idx]").forEach((btn) => {
    btn.addEventListener("click", () => openContractModal(Number(btn.dataset.viewIdx)));
  });
}

function exportMatchingExcel() {
  const p = dProgram;
  const rows = dSubmissions.map((s) => ({
    "프로그램명": p.name,
    "제안사": p.proposerName || "",
    "강의일시": p.dateTime || "",
    "강사명": s.instructorName,
    "연락처": s.phone || "",
    "증빙유형": s.receiptType === "사업자지출증빙" ? "사업자 지출증빙" : "현금영수증",
    "증빙번호": s.receiptNumber || "",
    "상호명": s.bizName || "",
    "공급가액": p.supplyAmount || 0,
    "부가세": p.vatAmount || 0,
    "합계": p.totalAmount || 0,
    "강의료입금예정일": matchingPayDateText(p),
    "대행비입금기한": matchingDueText(p),
    "강의료수령연락일": s.lectureFeeReceivedDate || "",
    "입금여부": s.paid ? "O" : "",
    "입금일": s.paidDate || "",
    "증빙발급": s.receiptIssued ? "O" : "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "강의섭외대행");
  XLSX.writeFile(wb, `${p.name}_강의섭외대행비.xlsx`);
}
