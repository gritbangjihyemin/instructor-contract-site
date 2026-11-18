// ===================================================================
// 강사계약서 렌더링 + PDF 다운로드 공용 로직
// form.html(제출 직후 미리보기)과 program-detail.html(관리자 다운로드)에서 공용으로 사용
// ===================================================================

function won(n) {
  const num = Number(n || 0);
  if (Number.isNaN(num)) return String(n || "");
  return num.toLocaleString("ko-KR") + "원";
}

// 강사비가 총액(고정)이 아니라 일급/시급 단위로 책정된 경우, 금액 뒤에 단위를 표시해준다.
function feeTypeSuffix(feeType) {
  if (feeType === "일급") return " (일급)";
  if (feeType === "시급") return " (시급)";
  return "";
}

function maskRRN(rrn) {
  if (!rrn) return "";
  const digits = String(rrn).replace(/[^0-9]/g, "");
  if (digits.length < 7) return rrn;
  return digits.slice(0, 6) + "-" + digits[6] + "******";
}

function fmtDate(d) {
  if (!d) return "";
  try {
    const dt = d.toDate ? d.toDate() : new Date(d);
    return dt.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
  } catch (e) {
    return String(d);
  }
}

// company: {companyName, bizRegNo, ceoName, address, phone}
// program: {name, dateTime, fee, travelFee, etc}
// submission: {instructorName, rrn, bankName, accountHolder, accountNumber, withholdingType, signature, submittedAt}
// opts: {maskRrn: boolean} - 화면에 표시할 때 주민등록번호 일부를 가릴지 여부 (PDF 저장본은 원본 그대로 사용 권장)
function renderContractHTML(company, program, submission, opts) {
  opts = opts || {};
  const c = company || {};
  const p = program || {};
  const s = submission || {};
  const rrnDisplay = opts.maskRrn ? maskRRN(s.rrn) : (s.rrn || "");
  const today = new Date().toLocaleDateString("ko-KR");
  const withholdingRate = s.withholdingType === "기타소득" ? "8.8%" : "3.3%";

  return `
    <h1>강사 위촉 및 용역 계약서</h1>

    <p>
      <strong>갑(발주처)</strong> ${escapeHtml(c.companyName || "(회사정보 미입력)")}
      (사업자등록번호: ${escapeHtml(c.bizRegNo || "-")}, 대표: ${escapeHtml(c.ceoName || "-")})<br/>
      ${c.address ? `주소: ${escapeHtml(c.address)}<br/>` : ""}
      ${c.phone ? `연락처: ${escapeHtml(c.phone)}<br/>` : ""}
    </p>
    <p>
      <strong>을(강사)</strong> ${escapeHtml(s.instructorName || "")}
      (주민등록번호: ${escapeHtml(rrnDisplay)})
    </p>

    <p>갑과 을은 아래와 같이 강의(교육) 용역 위촉 계약을 체결한다.</p>

    <div class="clause"><strong>제1조 (목적)</strong>
갑은 을에게 아래 프로그램의 강의(교육) 용역을 위촉하고, 을은 이를 성실히 수행함을 목적으로 한다.</div>

    <div class="clause"><strong>제2조 (용역 내용)</strong></div>
    <table>
      <tr><th style="width:120px">프로그램명</th><td>${escapeHtml(p.name || "")}</td></tr>
      <tr><th>강의 일시</th><td>${escapeHtml(p.dateTime || "")}</td></tr>
      ${p.etc ? `<tr><th>기타 사항</th><td>${escapeHtml(p.etc)}</td></tr>` : ""}
    </table>

    <div class="clause"><strong>제3조 (강사료 및 지급방법)</strong></div>
    <table>
      <tr><th style="width:120px">강사료</th><td>${won(p.fee)}${feeTypeSuffix(p.feeType)}</td></tr>
      <tr><th>출장여비</th><td>${won(p.travelFee)}</td></tr>
      <tr><th>원천징수 구분</th><td>${escapeHtml(s.withholdingType || "")} (원천징수세율 ${withholdingRate})</td></tr>
      <tr><th>지급계좌</th><td>${escapeHtml(s.bankName || "")} / 예금주: ${escapeHtml(s.accountHolder || "")} / 계좌번호: ${escapeHtml(s.accountNumber || "")}</td></tr>
    </table>
    <div class="clause">갑은 상기 강사료 및 출장여비 합계액에서 「소득세법」에 따라 원천징수(${escapeHtml(s.withholdingType || "")}, ${withholdingRate})를 한 후 잔액을 을 명의 계좌로 지급한다.</div>

    <div class="clause"><strong>제4조 (개인정보의 수집 및 이용)</strong>
갑은 원천징수 신고, 세무서 제출 등 세무 처리 목적으로만 을의 성명, 주민등록번호, 계좌정보를 수집·이용하며, 관계 법령에서 정한 보관기간 경과 후 지체 없이 파기한다.</div>

    <div class="clause"><strong>제5조 (계약의 해지)</strong>
갑 또는 을은 부득이한 사유가 발생한 경우 상대방과 협의하여 본 계약을 해지할 수 있다.</div>

    <div class="clause"><strong>제6조 (기타)</strong>
본 계약서에 명시되지 않은 사항은 관계 법령 및 상관례에 따르며, 상호 협의하여 정한다.</div>

    <p style="margin-top:24px;">계약일자: ${today}</p>

    <div class="sign-row">
      <div class="sign-box seal-box">
        <div>갑: ${escapeHtml(c.companyName || "")} (인)</div>
        <img class="seal-img" src="assets/seal.png" alt="직인" />
      </div>
      <div class="sign-box">
        <div>을: ${escapeHtml(s.instructorName || "")} (서명)</div>
        ${s.signature ? `<img class="sign-img" src="${s.signature}" alt="서명" />` : ""}
      </div>
    </div>
  `;
}

// 강의섭외대행 약정서 (강사 ↔ 그릿마인드랩)
// program: {name, proposerName, dateTime, hours, unitFee, supplyAmount, vatAmount, totalAmount, dueDate}
// submission: {instructorName, phone, receiptType, receiptNumber, bizName, signature}
function renderMatchingContractHTML(company, program, submission) {
  const c = company || {};
  const p = program || {};
  const s = submission || {};
  const today = new Date().toLocaleDateString("ko-KR");
  const due = matchingDueText(p);
  const account = c.depositBank || c.depositAccount
    ? `${escapeHtml(c.depositBank || "")} ${escapeHtml(c.depositAccount || "")} (예금주: ${escapeHtml(c.depositHolder || c.companyName || "")})`
    : "갑이 별도로 안내하는 계좌";
  const receiptLabel = s.receiptType === "사업자지출증빙" ? "사업자 지출증빙" : "현금영수증 (소득공제용)";
  const receiptNoLabel = s.receiptType === "사업자지출증빙" ? "사업자등록번호" : "발급 번호(휴대폰)";

  return `
    <h1>강의섭외대행 약정서</h1>

    <p>
      <strong>갑(대행사)</strong> ${escapeHtml(c.companyName || "(회사정보 미입력)")}
      (사업자등록번호: ${escapeHtml(c.bizRegNo || "-")}, 대표: ${escapeHtml(c.ceoName || "-")})<br/>
      ${c.address ? `주소: ${escapeHtml(c.address)}<br/>` : ""}
      ${c.phone ? `연락처: ${escapeHtml(c.phone)}<br/>` : ""}
    </p>
    <p>
      <strong>을(강사)</strong> ${escapeHtml(s.instructorName || "")}
      (연락처: ${escapeHtml(s.phone || "")}${s.bizName ? `, 상호: ${escapeHtml(s.bizName)}` : ""})
    </p>

    <p>갑과 을은 을의 강의 출강과 관련한 강의섭외대행에 대하여 아래와 같이 약정한다.</p>

    <div class="clause"><strong>제1조 (목적)</strong>
본 약정은 갑이 을을 위하여 아래 강의의 섭외를 대행하고 출강 연계 및 조율을 지원하는 것과, 그 대가인 강의섭외대행비에 관한 사항을 정함을 목적으로 한다.</div>

    <div class="clause"><strong>제2조 (대상 강의)</strong></div>
    <table>
      <tr><th style="width:120px">프로그램명</th><td>${escapeHtml(p.name || "")}</td></tr>
      <tr><th>제안사</th><td>${escapeHtml(p.proposerName || "")}</td></tr>
      <tr><th>강의 일시</th><td>${escapeHtml(p.dateTime || "")}</td></tr>
      <tr><th>강의 시간</th><td>${p.hours || 0}시간</td></tr>
    </table>

    <div class="clause"><strong>제3조 (갑의 업무)</strong>
갑은 을을 위하여 ① 강의 섭외, ② 제안사와의 강의 일정 및 내용 조율, ③ 강의 관련 자료 및 현장 운영 지원 업무를 수행한다.</div>

    <div class="clause"><strong>제4조 (강의 계약 및 강의료)</strong>
대상 강의에 관한 강의 계약은 을과 제안사가 직접 체결하며, 강의료는 제안사가 을에게 직접 지급한다. 갑은 을의 강의료를 대신 수령하거나 보관하지 않는다.</div>

    <div class="clause"><strong>제5조 (강의섭외대행비)</strong></div>
    <table>
      <tr><th style="width:120px">공급가액</th><td>${won(p.supplyAmount)} (${won(p.unitFee)} × ${p.hours || 0}시간)</td></tr>
      <tr><th>부가세</th><td>${won(p.vatAmount)}</td></tr>
      <tr><th>합계</th><td><strong>${won(p.totalAmount)}</strong></td></tr>
      <tr><th>강의료 입금예정일</th><td>${escapeHtml(matchingPayDateText(p))}</td></tr>
      <tr><th>대행비 입금기한</th><td>${escapeHtml(due)}</td></tr>
      <tr><th>입금 계좌</th><td>${account}</td></tr>
    </table>
    <div class="clause">강의섭외대행비는 을이 강의료를 받은 당일 입금하는 것을 원칙으로 한다. 을은 위 합계 금액을 입금기한 내에 갑의 계좌로 입금한다.${p.payDateType === "undecided" ? " 강의료 입금예정일이 정해지지 않은 경우, 을은 강의료를 받은 당일 갑에게 알리고 대행비를 입금한다." : ""} 대상 강의가 취소되어 을이 강의료를 지급받지 못한 경우, 갑은 강의섭외대행비를 청구하지 않는다.</div>

    <div class="clause"><strong>제6조 (증빙 발급)</strong>
갑은 입금을 확인한 후 을이 선택한 아래 방식으로 입금액 전액에 대한 증빙을 발급한다.</div>
    <table>
      <tr><th style="width:120px">증빙 유형</th><td>${escapeHtml(receiptLabel)}</td></tr>
      <tr><th>${receiptNoLabel}</th><td>${escapeHtml(s.receiptNumber || "")}</td></tr>
    </table>

    <div class="clause"><strong>제7조 (개인정보의 수집 및 이용)</strong>
갑은 증빙 발급 및 세무 처리 목적으로만 을의 성명, 연락처, 증빙 발급 정보를 수집·이용하며, 관계 법령에서 정한 보관기간 경과 후 지체 없이 파기한다.</div>

    <div class="clause"><strong>제8조 (기타)</strong>
본 약정서에 명시되지 않은 사항은 관계 법령 및 상관례에 따르며, 상호 협의하여 정한다.</div>

    <p style="margin-top:24px;">약정일자: ${today}</p>

    <div class="sign-row">
      <div class="sign-box seal-box">
        <div>갑: ${escapeHtml(c.companyName || "")} (인)</div>
        <img class="seal-img" src="assets/seal.png" alt="직인" />
      </div>
      <div class="sign-box">
        <div>을: ${escapeHtml(s.instructorName || "")} (서명)</div>
        ${s.signature ? `<img class="sign-img" src="${s.signature}" alt="서명" />` : ""}
      </div>
    </div>
    ${vatReasonHTML()}
  `;
}

// ---------------------------------------------------------------
// 강의섭외대행: 강의료 입금예정일 / 대행비 입금기한 표시 문구
// ---------------------------------------------------------------
function matchingPayDateText(p) {
  if (p.payDateType === "undecided") return "미정 (제안사 입금 시)";
  return p.lecturePayDate || "미정";
}
function matchingDueText(p) {
  if (p.payDateType === "undecided") return "강의료를 받은 당일 (받으면 그릿마인드랩에 연락)";
  return p.dueDate ? `${p.dueDate} (강의료 수령 당일)` : "강의료 수령 당일";
}

// 부가세를 받는 이유 (세무사 확인 내용, 강사 화면·약정서 하단에 빨간 글씨로 표시)
const VAT_REASON =
  "※ 부가세 안내: 강의섭외대행비는 그릿마인드랩이 강사님께 제공하는 섭외·조율 운영 서비스의 대가로, " +
  "세무사 확인 결과 부가가치세 과세 대상입니다. 그래서 대행비에 부가세 10%를 더해 받고, " +
  "입금하신 금액 전액에 대해 현금영수증 또는 지출증빙을 발급해 드립니다.";
function vatReasonHTML() {
  return `<p class="vat-note">${VAT_REASON}</p>`;
}

// ---------------------------------------------------------------
// 직접 위촉: 강사비 총액 / 원천징수 / 지급예정일
// ※ 일반적인 계산 기준이며, 실제 신고 전 세무사 확인을 권장합니다.
// ---------------------------------------------------------------
function directGross(p) {
  const fee = Number(p.fee || 0);
  const qty = p.feeType && p.feeType !== "총액" ? Number(p.feeQty || 0) : 1;
  return fee * qty + Number(p.travelFee || 0);
}
const floor10 = (n) => Math.floor(n / 10) * 10;
function withholdingTax(gross, type) {
  let income = 0;
  if (type === "기타소득") {
    const taxable = gross * 0.4; // 필요경비 60% 공제
    income = taxable <= 50000 ? 0 : floor10(taxable * 0.2); // 기타소득금액 5만원 이하 과세최저한
  } else {
    income = floor10(gross * 0.03);
    if (income < 1000) income = 0; // 소액부징수
  }
  const local = floor10(income * 0.1);
  return { income, local, total: income + local, net: gross - income - local };
}
// 강의일 기준 익익월 20일 (주말·공휴일 조정 전 날짜)
function directPayDate(p) {
  if (!p.startDate) return "";
  const d = new Date(p.startDate + "T00:00:00");
  const t = new Date(d.getFullYear(), d.getMonth() + 2, 20);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-20`;
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// containerEl: 계약서 HTML이 렌더링되어 있는 DOM 엘리먼트 (.contract-doc)
// filename: 저장할 파일명 (확장자 제외)
async function downloadContractPDF(containerEl, filename) {
  if (!window.html2canvas || !window.jspdf) {
    alert("PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const canvas = await html2canvas(containerEl, { scale: 2, backgroundColor: "#ffffff" });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight <= pageHeight) {
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, imgHeight);
  } else {
    // 내용이 A4 한 장을 넘으면 여러 페이지로 잘라서 출력
    const pageCanvasHeightPx = Math.floor((pageHeight * canvas.width) / imgWidth);
    let renderedHeightPx = 0;
    let first = true;
    while (renderedHeightPx < canvas.height) {
      const sliceHeightPx = Math.min(pageCanvasHeightPx, canvas.height - renderedHeightPx);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;
      const ctx = pageCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, renderedHeightPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
      const sliceImgHeight = (sliceHeightPx * imgWidth) / canvas.width;
      if (!first) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, sliceImgHeight);
      renderedHeightPx += sliceHeightPx;
      first = false;
    }
  }

  pdf.save(`${filename}.pdf`);
}

