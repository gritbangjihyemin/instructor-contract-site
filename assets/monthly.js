// ===================================================================
// 월별 강의섭외대행비 집계 (세무사 제출용)
// - 기준: 입금일(매출 신고용, 기본) 또는 강의일
// - 금액은 프로그램에 저장된 공급가액/부가세/합계를 강사 1인 기준으로 사용
// ===================================================================

let mPrograms = {};   // programId -> program
let mSubs = [];       // 강의섭외대행 제출 목록 (프로그램 정보 결합)
let mCurrentRows = [];
let dSubs = [];
let dCurrentRows = [];

auth.onAuthStateChanged((user) => {
  if (user) {
    document.getElementById("auth-gate").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
    initMonthly();
  } else {
    document.getElementById("auth-gate").classList.remove("hidden");
    document.getElementById("content").classList.add("hidden");
  }
});

async function initMonthly() {
  const monthEl = document.getElementById("m-month");
  if (!monthEl.value) {
    const d = new Date();
    monthEl.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  // 복합 색인이 필요 없도록 단일 조건으로만 조회하고 나머지는 화면에서 거른다
  const [progSnap, subSnap] = await Promise.all([
    db.collection("programs").get(),
    db.collection("submissions").get(),
  ]);
  mPrograms = {};
  progSnap.docs.forEach((d) => (mPrograms[d.id] = { id: d.id, ...d.data() }));
  const allSubs = subSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => mPrograms[s.programId])
    .map((s) => ({ ...s, program: mPrograms[s.programId] }));
  mSubs = allSubs.filter((s) => s.contractType === "matching");
  dSubs = allSubs.filter((s) => s.contractType !== "matching" && s.program.contractType !== "matching");
  initDirectTab();

  monthEl.addEventListener("change", renderMonthly);
  document.getElementById("m-basis").addEventListener("change", renderMonthly);
  renderMonthly();
  renderUnpaid();
}

function basisDate(s, basis) {
  return basis === "paid" ? (s.paid ? s.paidDate || "" : "") : s.program.startDate || "";
}

function receiptShort(t) {
  return t === "사업자지출증빙" ? "지출증빙" : "현금영수증";
}

function renderMonthly() {
  const month = document.getElementById("m-month").value; // YYYY-MM
  const basis = document.getElementById("m-basis").value;
  document.getElementById("m-basis-hint").textContent =
    basis === "paid"
      ? "입금 확인된 건만, 입금일이 속한 달로 집계해요. 세무사에게 보내는 매출 자료는 이 기준을 쓰세요."
      : "강의가 있었던 달로 집계해요. 아직 입금되지 않은 건도 포함돼요.";

  mCurrentRows = mSubs
    .filter((s) => basisDate(s, basis).slice(0, 7) === month)
    .sort((a, b) => basisDate(a, basis).localeCompare(basisDate(b, basis)));

  const sum = (k) => mCurrentRows.reduce((acc, s) => acc + Number(s.program[k] || 0), 0);
  const supply = sum("supplyAmount");
  const vat = sum("vatAmount");
  const total = sum("totalAmount");
  const cashCount = mCurrentRows.filter((s) => s.receiptType !== "사업자지출증빙").length;
  const bizCount = mCurrentRows.length - cashCount;
  const notIssued = mCurrentRows.filter((s) => !s.receiptIssued).length;

  document.getElementById("m-stats").innerHTML = `
    <div class="stat"><span>건수</span><strong>${mCurrentRows.length}건</strong><small>현금영수증 ${cashCount} · 지출증빙 ${bizCount}</small></div>
    <div class="stat"><span>공급가액</span><strong>${won(supply)}</strong></div>
    <div class="stat"><span>부가세</span><strong>${won(vat)}</strong></div>
    <div class="stat accent"><span>합계</span><strong>${won(total)}</strong>${notIssued ? `<small>증빙 미발급 ${notIssued}건</small>` : "<small>증빙 모두 발급</small>"}</div>
  `;

  const tbody = document.getElementById("m-tbody");
  document.getElementById("m-empty").style.display = mCurrentRows.length ? "none" : "block";
  tbody.innerHTML = mCurrentRows
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(basisDate(s, basis))}</td>
      <td><a href="program-detail.html?pid=${s.programId}">${escapeHtml(s.program.name)}</a></td>
      <td>${escapeHtml(s.program.proposerName || "")}</td>
      <td>${escapeHtml(s.instructorName)}</td>
      <td><span class="receipt-chip ${s.receiptType === "사업자지출증빙" ? "biz" : "cash"}">${receiptShort(s.receiptType)}</span></td>
      <td>${escapeHtml(s.receiptNumber || "")}</td>
      <td class="num">${won(s.program.supplyAmount)}</td>
      <td class="num">${won(s.program.vatAmount)}</td>
      <td class="num">${won(s.program.totalAmount)}</td>
      <td style="text-align:center">${s.receiptIssued ? "✔" : '<span class="muted">미발급</span>'}</td>
    </tr>`
    )
    .join("");
}

function renderUnpaid() {
  const rows = mSubs
    .filter((s) => !s.paid)
    .sort((a, b) => (a.program.startDate || "").localeCompare(b.program.startDate || ""));
  document.getElementById("m-unpaid-empty").style.display = rows.length ? "none" : "block";
  document.getElementById("m-unpaid-tbody").innerHTML = rows
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(s.program.startDate || "")}</td>
      <td><a href="program-detail.html?pid=${s.programId}">${escapeHtml(s.program.name)}</a></td>
      <td>${escapeHtml(s.program.proposerName || "")}</td>
      <td>${escapeHtml(s.instructorName)}</td>
      <td>${escapeHtml(s.phone || "")}</td>
      <td class="num">${won(s.program.totalAmount)}</td>
      <td>${escapeHtml(matchingDueText(s.program))}</td>
      <td>${s.lectureFeeReceivedDate ? escapeHtml(s.lectureFeeReceivedDate) : '<span class="muted">연락 전</span>'}</td>
    </tr>`
    )
    .join("");
}

// 세무사 제출용: [요약] 시트 + [건별내역] 시트
document.getElementById("m-excel-btn").addEventListener("click", () => {
  const month = document.getElementById("m-month").value;
  const basis = document.getElementById("m-basis").value;
  if (!mCurrentRows.length) {
    alert("이 달에 해당하는 내역이 없습니다.");
    return;
  }
  const sum = (k) => mCurrentRows.reduce((acc, s) => acc + Number(s.program[k] || 0), 0);
  const byType = (t) => mCurrentRows.filter((s) => (s.receiptType === "사업자지출증빙") === (t === "biz"));
  const typeSum = (rows, k) => rows.reduce((acc, s) => acc + Number(s.program[k] || 0), 0);
  const cash = byType("cash");
  const biz = byType("biz");

  const summary = [
    ["강의섭외대행비 월별 집계", ""],
    ["집계 월", month],
    ["집계 기준", basis === "paid" ? "입금일" : "강의일"],
    [],
    ["구분", "건수", "공급가액", "부가세", "합계"],
    ["현금영수증", cash.length, typeSum(cash, "supplyAmount"), typeSum(cash, "vatAmount"), typeSum(cash, "totalAmount")],
    ["사업자 지출증빙", biz.length, typeSum(biz, "supplyAmount"), typeSum(biz, "vatAmount"), typeSum(biz, "totalAmount")],
    ["합계", mCurrentRows.length, sum("supplyAmount"), sum("vatAmount"), sum("totalAmount")],
  ];
  const detail = mCurrentRows.map((s) => ({
    [basis === "paid" ? "입금일" : "강의일"]: basisDate(s, basis),
    "프로그램명": s.program.name,
    "제안사": s.program.proposerName || "",
    "강의일": s.program.startDate || "",
    "강사명": s.instructorName,
    "증빙유형": s.receiptType === "사업자지출증빙" ? "사업자 지출증빙" : "현금영수증",
    "증빙번호": s.receiptNumber || "",
    "상호명": s.bizName || "",
    "공급가액": Number(s.program.supplyAmount || 0),
    "부가세": Number(s.program.vatAmount || 0),
    "합계": Number(s.program.totalAmount || 0),
    "증빙발급": s.receiptIssued ? "O" : "",
  }));

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, "요약");
  const ws2 = XLSX.utils.json_to_sheet(detail);
  ws2["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
                  { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 9 }];
  XLSX.utils.book_append_sheet(wb, ws2, "건별내역");
  XLSX.writeFile(wb, `강의섭외대행비_${month}_월별집계.xlsx`);
});

// ===================================================================
// 탭 전환
// ===================================================================
document.querySelectorAll(".tab-row .tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-row .tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("tab-matching").classList.toggle("hidden", btn.dataset.tab !== "matching");
    document.getElementById("tab-direct").classList.toggle("hidden", btn.dataset.tab !== "direct");
  })
);

// ===================================================================
// 월별 강사비 집계 (직접 위촉)
// - 지급월: 강의일 기준 익익월 20일이 속한 달 (원천세 신고용)
// ===================================================================
function initDirectTab() {
  const monthEl = document.getElementById("d-month");
  if (!monthEl.value) monthEl.value = document.getElementById("m-month").value;
  monthEl.addEventListener("change", renderDirect);
  document.getElementById("d-basis").addEventListener("change", renderDirect);
  renderDirect();
}

function directRow(s) {
  const gross = directGross(s.program);
  const tax = withholdingTax(gross, s.withholdingType);
  return { s, gross, ...tax, payDate: directPayDate(s.program), lectureDate: s.program.startDate || "" };
}

function renderDirect() {
  const month = document.getElementById("d-month").value;
  const basis = document.getElementById("d-basis").value;
  document.getElementById("d-basis-hint").textContent =
    basis === "pay"
      ? "강의일 기준 익익월 20일 지급으로 계산해서, 지급하는 달로 묶어요. 주말·공휴일로 미뤄지는 날짜는 반영하지 않아요."
      : "강의가 있었던 달로 묶어요.";
  const key = (r) => (basis === "pay" ? r.payDate : r.lectureDate);
  dCurrentRows = dSubs.map(directRow).filter((r) => key(r).slice(0, 7) === month)
    .sort((a, b) => key(a).localeCompare(key(b)));

  const sum = (k) => dCurrentRows.reduce((acc, r) => acc + r[k], 0);
  const biz = dCurrentRows.filter((r) => r.s.withholdingType !== "기타소득").length;
  document.getElementById("d-stats").innerHTML = `
    <div class="stat"><span>인원</span><strong>${dCurrentRows.length}명</strong><small>사업소득 ${biz} · 기타소득 ${dCurrentRows.length - biz}</small></div>
    <div class="stat"><span>지급총액</span><strong>${won(sum("gross"))}</strong></div>
    <div class="stat"><span>원천징수 (소득세+지방세)</span><strong>${won(sum("total"))}</strong></div>
    <div class="stat accent"><span>실지급액</span><strong>${won(sum("net"))}</strong></div>
  `;
  document.getElementById("d-empty").style.display = dCurrentRows.length ? "none" : "block";
  document.getElementById("d-tbody").innerHTML = dCurrentRows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(key(r))}</td>
      <td><a href="program-detail.html?pid=${r.s.programId}">${escapeHtml(r.s.program.name)}</a></td>
      <td>${escapeHtml(r.s.instructorName)}</td>
      <td>${escapeHtml(r.s.withholdingType || "")}</td>
      <td class="num">${won(r.gross)}</td>
      <td class="num">${won(r.income)}</td>
      <td class="num">${won(r.local)}</td>
      <td class="num"><strong>${won(r.net)}</strong></td>
      <td>${escapeHtml(r.s.bankName || "")} ${escapeHtml(r.s.accountNumber || "")}</td>
    </tr>`
    )
    .join("");
}

document.getElementById("d-excel-btn").addEventListener("click", () => {
  const month = document.getElementById("d-month").value;
  const basis = document.getElementById("d-basis").value;
  if (!dCurrentRows.length) {
    alert("이 달에 해당하는 내역이 없습니다.");
    return;
  }
  const part = (t) => dCurrentRows.filter((r) => (r.s.withholdingType === "기타소득") === (t === "기타소득"));
  const tot = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  const line = (label, rows) => [label, rows.length, tot(rows, "gross"), tot(rows, "income"), tot(rows, "local"), tot(rows, "net")];
  const summary = [
    ["강사비 월별 집계 (직접 위촉)"],
    ["집계 월", month],
    ["집계 기준", basis === "pay" ? "지급월 (강의일 익익월 20일)" : "강의월"],
    [],
    ["소득 구분", "인원", "지급총액", "소득세", "지방소득세", "실지급액"],
    line("사업소득 (3.3%)", part("사업소득")),
    line("기타소득 (8.8%)", part("기타소득")),
    line("합계", dCurrentRows),
    [],
    ["※ 세금은 일반 계산식 기준입니다. 신고 전 세무사 확인이 필요합니다."],
  ];
  const detail = dCurrentRows.map((r) => ({
    "지급예정일": r.payDate,
    "강의일": r.lectureDate,
    "프로그램명": r.s.program.name,
    "강사명": r.s.instructorName,
    "주민등록번호": r.s.rrn || "",
    "소득구분": r.s.withholdingType || "",
    "강사비": Number(r.s.program.fee || 0),
    "지급방식": r.s.program.feeType || "총액",
    "일수/시간": r.s.program.feeType && r.s.program.feeType !== "총액" ? Number(r.s.program.feeQty || 0) : "",
    "출장여비": Number(r.s.program.travelFee || 0),
    "지급총액": r.gross,
    "소득세": r.income,
    "지방소득세": r.local,
    "실지급액": r.net,
    "은행": r.s.bankName || "",
    "예금주": r.s.accountHolder || "",
    "계좌번호": r.s.accountNumber || "",
  }));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, "요약");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "강사별내역");
  XLSX.writeFile(wb, `강사비_${month}_월별집계.xlsx`);
});
