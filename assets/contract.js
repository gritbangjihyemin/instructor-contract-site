// ===================================================================
// 강사계약서 렌더링 + PDF 다운로드 공용 로직
// form.html(제출 직후 미리보기)과 program-detail.html(관리자 다운로드)에서 공용으로 사용
// ===================================================================

function won(n) {
  const num = Number(n || 0);
  if (Number.isNaN(num)) return String(n || "");
  return num.toLocaleString("ko-KR") + "원";
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
      <tr><th style="width:120px">강사료</th><td>${won(p.fee)}</td></tr>
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
      <div class="sign-box">
        <div>갑: ${escapeHtml(c.companyName || "")} (인)</div>
      </div>
      <div class="sign-box">
        <div>을: ${escapeHtml(s.instructorName || "")} (서명)</div>
        ${s.signature ? `<img class="sign-img" src="${s.signature}" alt="서명" />` : ""}
      </div>
    </div>
  `;
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
