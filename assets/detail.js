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
 
  renderSummary();
  renderTable();
}
 
function renderSummary() {
  const el = document.getElementById("program-summary");
  el.innerHTML = `
    <h2 style="margin-top:0">${escapeHtml(dProgram.name)}</h2>
    <table>
      <tr><th style="width:100px">일시</th><td>${escapeHtml(dProgram.dateTime || "")}</td></tr>
      <tr><th>강사비</th><td>${won(dProgram.fee)}</td></tr>
      <tr><th>출장여비</th><td>${won(dProgram.travelFee)}</td></tr>
      <tr><th>제출 인원</th><td>${dSubmissions.length}명</td></tr>
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
  document.getElementById("contract-download-btn").onclick = () => downloadContractPDF(viewEl, `강사계약서_${s.instructorName}`);
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
    "출장여비": dProgram.travelFee || 0,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "제출현황");
  XLSX.writeFile(wb, `${dProgram.name}_강사제출현황.xlsx`);
});
 
// won() / escapeHtml() / maskRRN() / fmtDate() 는 assets/contract.js 에 정의된 공용 유틸을 사용합니다.
 

