"""Build a static GitHub Pages copy of the saved measurement experiment reports."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import cv2


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs"
DEFAULT_SERVER = "http://localhost:8003"
PHOTO_WIDTH = 1600


def fetch_json(server: str, endpoint: str) -> dict:
    request = urllib.request.Request(f"{server.rstrip('/')}{endpoint}")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def require_rows(report: dict, label: str, count: int = 20) -> None:
    if not isinstance(report.get("rows"), list) or len(report["rows"]) != count:
        raise ValueError(f"{label}: 사진 결과가 {count}개가 아니어서 공개본을 만들지 않았어요.")


def copy_photo(source: Path, destination: Path) -> None:
    image = cv2.imread(str(source), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"사진을 읽지 못했어요: {source}")
    height, width = image.shape[:2]
    if width > PHOTO_WIDTH:
        scaled_height = round(height * PHOTO_WIDTH / width)
        image = cv2.resize(image, (PHOTO_WIDTH, scaled_height), interpolation=cv2.INTER_AREA)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(destination), image, [cv2.IMWRITE_JPEG_QUALITY, 82]):
        raise OSError(f"웹용 사진을 저장하지 못했어요: {destination}")


def copy_static_assets() -> None:
    for relative in (
        "css/styles.css",
        "css/measurement.css",
        "css/measurement-round3.css",
        "js/measurement/modelComparison.js",
    ):
        target = OUTPUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if relative == "css/styles.css":
            # 기존 작업 중인 공통 CSS 변경은 섞지 않고, 브랜치에 저장된 버전을 써요.
            content = subprocess.run(
                ["git", "show", f"HEAD:{relative}"],
                cwd=ROOT,
                check=True,
                capture_output=True,
            ).stdout
            target.write_bytes(content)
        else:
            shutil.copy2(ROOT / relative, target)

    (OUTPUT / "js/measurement/publicDatasetReport.js").write_text(DATASET_SCRIPT, encoding="utf-8")
    (OUTPUT / "js/measurement/publicRound3Report.js").write_text(ROUND3_SCRIPT, encoding="utf-8")


DATASET_SCRIPT = r'''import { renderModelComparison, renderModelComparisonError, renderGeminiComparison } from './modelComparison.js';

const names = { point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco 테두리', ChaArUco_Cross: 'ChArUco 격자' };
const el = (selector) => document.querySelector(selector);
const ui = {
  status: el('#dataset-status'), summary: el('#dataset-summary'), backgrounds: el('#background-results'),
  garments: el('#garment-results'), photos: el('#dataset-photos'), backgroundFilter: el('#filter-background'),
  garmentFilter: el('#filter-garment'), modelStatus: el('#ai-model-status'), modelSummary: el('#ai-model-summary'),
  modelDetails: el('#ai-model-details'), deepFashion2: el('#deepfashion2-note'), warning: el('#model-provenance-warning'),
  geminiStatus: el('#gemini-status'), geminiSummary: el('#gemini-summary'), geminiDetails: el('#gemini-details')
};
let report;

function safe(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
function cm(value) { return Number.isFinite(value) ? `${value.toFixed(1)}cm` : '값 없음'; }
function table(rows, label) {
  return `<table class="dataset-table"><thead><tr><th>구분</th><th>측정 성공</th><th>너비 평균 오차</th><th>기장 평균 오차</th></tr></thead><tbody>${rows.map(([key,item]) => `<tr><th>${safe(label(key))}</th><td>${item.successCount}/${item.imageCount}장</td><td>${cm(item.maeWidthCm)}</td><td>${cm(item.maeLengthCm)}</td></tr>`).join('')}</tbody></table>`;
}
function renderPhotos() {
  const bg = ui.backgroundFilter.value, garment = ui.garmentFilter.value;
  const rows = report.rows.filter((row) => (bg === 'all' || row.backgroundId === bg) && (garment === 'all' || String(row.garmentId) === garment));
  ui.photos.innerHTML = rows.map((row) => {
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    const result = row.overlayDataUrl ? `<img src="${row.overlayDataUrl}" alt="${safe(row.garmentName)} 측정 그림" loading="lazy" />` : '<div class="dataset-no-photo">분석 사진 없음</div>';
    const error = row.status === 'done' ? `${widthName} 오차 ${cm(row.absoluteWidthErrorCm)} · 기장 오차 ${cm(row.absoluteLengthErrorCm)}` : `측정을 마치지 못했어요: ${safe(row.message)}`;
    return `<article class="dataset-photo-card"><div class="dataset-photo-heading"><h3>${safe(names[row.backgroundId] || row.backgroundId)} · ${safe(row.garmentName)}</h3><span>${row.status === 'done' ? '측정값 생성' : '측정 실패'}</span></div>
      <div class="dataset-picture-pair"><figure><img src="${safe(row.sourceUrl)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" /><figcaption>웹용 원본 사진</figcaption></figure><figure>${result}<figcaption>컴퓨터가 찾은 위치</figcaption></figure></div>
      <div class="dataset-values"><p><strong>${widthName}</strong><br />기준 ${cm(row.referenceWidthCm)} → 측정 ${cm(row.measuredWidthCm)}</p><p><strong>기장</strong><br />기준 ${cm(row.referenceLengthCm)} → 측정 ${cm(row.measuredLengthCm)}</p></div><p class="dataset-error">${error}</p></article>`;
  }).join('') || '<p class="analysis-note">선택한 조건에 해당하는 사진이 없어요.</p>';
}
function renderReport(data) {
  report = data;
  const summary = [['사진 수', `${data.summary.imageCount}장`], ['측정 성공', `${data.summary.successCount}/${data.summary.imageCount}장`], ['너비 평균 오차', cm(data.summary.maeWidthCm)], ['기장 평균 오차', cm(data.summary.maeLengthCm)]];
  ui.summary.innerHTML = summary.map(([label,value]) => `<article class="dataset-stat"><span>${label}</span><strong>${value}</strong></article>`).join('');
  const bgRows = Object.entries(data.byBackground || {});
  const garmentRows = Object.entries(data.byGarment || {});
  ui.backgrounds.innerHTML = table(bgRows, (key) => names[key] || key);
  ui.garments.innerHTML = table(garmentRows, (key) => data.rows.find((row) => String(row.garmentId) === key)?.garmentName || `옷 ${key}`);
  ui.backgroundFilter.innerHTML = '<option value="all">모든 배경</option>' + [...new Set(data.rows.map((row) => row.backgroundId))].map((key) => `<option value="${safe(key)}">${safe(names[key] || key)}</option>`).join('');
  ui.garmentFilter.innerHTML = '<option value="all">모든 옷</option>' + [...new Map(data.rows.map((row) => [row.garmentId,row.garmentName])).entries()].map(([id,name]) => `<option value="${safe(id)}">${safe(name)}</option>`).join('');
  renderPhotos();
  ui.status.textContent = `저장된 실험 결과 · 분석 사진 ${data.summary.imageCount}장 · 측정 실패 ${data.summary.failureCount}장`;
}
async function load() {
  try {
    const [data, models] = await Promise.all([
      fetch('./data/measure-dataset.json').then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
      fetch('./data/model-comparison.json').then((response) => { if (!response.ok) throw new Error(); return response.json(); })
    ]);
    renderReport(data);
    renderModelComparison({ status: ui.modelStatus, summary: ui.modelSummary, details: ui.modelDetails, deepFashion2: ui.deepFashion2, warning: ui.warning }, models);
    renderGeminiComparison({ status: ui.geminiStatus, summary: ui.geminiSummary, details: ui.geminiDetails }, models.geminiComparison);
  } catch {
    ui.status.textContent = '공개 결과 파일을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
    renderModelComparisonError({ status: ui.modelStatus, summary: ui.modelSummary, details: ui.modelDetails, deepFashion2: ui.deepFashion2, warning: ui.warning }, 'AI 실험 결과 파일을 불러오지 못했어요.');
  }
}
ui.backgroundFilter.addEventListener('change', renderPhotos);
ui.garmentFilter.addEventListener('change', renderPhotos);
load();
'''


ROUND3_SCRIPT = r'''const status = document.querySelector('#round3-status');
const summaryRoot = document.querySelector('#round3-summary');
const backgroundRoot = document.querySelector('#round3-backgrounds');
const photosRoot = document.querySelector('#round3-photos');
const backgrounds = { point:'점 배경', cross:'격자 배경', ChArUco:'ChArUco', ChaArUco_Cross:'ChArUco 격자' };
const methodNames = { always:'항상 평판화', conditional:'필요할 때만 평판화' };
function safe(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
function cm(value) { return Number.isFinite(value) ? `${value.toFixed(1)}cm` : '측정 실패'; }
function show(report) {
  const repeat = report.repeatCount || 1, trials = report.trialCountPerMethod || report.imageCount;
  summaryRoot.innerHTML = ['always','conditional'].map((key) => { const result=report.methods[key]; return `<article class="round3-summary-card ${key==='conditional'?'is-conditional':''}"><h3>${methodNames[key]}</h3><div class="round3-metrics"><div class="round3-metric"><span>성공</span><strong>${result.successCount}/${result.imageCount}장</strong></div><div class="round3-metric"><span>너비 평균 오차</span><strong>${cm(result.widthMaeCm)}</strong></div><div class="round3-metric"><span>길이 평균 오차</span><strong>${cm(result.lengthMaeCm)}</strong></div></div><p class="round3-repeat-note">사진마다 ${repeat}회 반복 · 방법별 총 ${trials}회 분석<br />사진별 너비 흔들림 평균 ${cm(result.averageWithinPhotoWidthStdDevCm)}, 길이 ${cm(result.averageWithinPhotoLengthStdDevCm)}</p></article>`; }).join('');
  if (report.gemini?.rows) { const refs=new Map(report.rows.map((row)=>[row.imageName,row])); const done=report.gemini.rows.filter((row)=>row.status==='done'&&refs.has(row.photo)); const w=done.length?done.reduce((s,row)=>s+Math.abs(row.widthCm-refs.get(row.photo).referenceWidthCm),0)/done.length:null; const h=done.length?done.reduce((s,row)=>s+Math.abs(row.lengthCm-refs.get(row.photo).referenceLengthCm),0)/done.length:null; summaryRoot.innerHTML+=`<article class="round3-summary-card"><h3>Gemini (사진당 최대 3회)</h3><div class="round3-metrics"><div class="round3-metric"><span>성공</span><strong>${done.length}/${report.imageCount}</strong></div><div class="round3-metric"><span>너비 평균 오차</span><strong>${cm(w)}</strong></div><div class="round3-metric"><span>길이 평균 오차</span><strong>${cm(h)}</strong></div></div><p class="round3-repeat-note">네 배경 사진 20장을 사진당 최대 3회 요청해서 비교했어요.</p></article>`; }
  backgroundRoot.innerHTML=`<table class="round3-table"><thead><tr><th>배경</th><th>항상 평판화 · 너비/길이 오차</th><th>필요할 때만 · 너비/길이 오차</th></tr></thead><tbody>${Object.entries(report.byBackground).map(([id,methods])=>`<tr><th>${safe(backgrounds[id]||id)}</th><td>${methods.always.successCount}/5 · ${cm(methods.always.widthMaeCm)} / ${cm(methods.always.lengthMaeCm)}</td><td>${methods.conditional.successCount}/5 · ${cm(methods.conditional.widthMaeCm)} / ${cm(methods.conditional.lengthMaeCm)}</td></tr>`).join('')}</tbody></table>`;
  const gemini=new Map((report.gemini?.rows||[]).map((row)=>[row.photo,row]));
  photosRoot.innerHTML=report.rows.map((row)=>{ const c=row.conditional; const picture=c.overlayDataUrl?`<img src="${c.overlayDataUrl}" alt="${safe(row.garmentName)} 조건부 분석 결과" loading="lazy" />`:'<div class="dataset-no-photo">분석 그림 없음</div>'; const rows=['always','conditional'].map((key)=>{const result=row[key],failed=result.status!=='done';return `<tr class="${failed?'round3-failed':''}"><th>${methodNames[key]}</th><td>${cm(result.widthCm)}</td><td>${cm(result.lengthCm)}</td><td>${failed?safe(result.message):`${cm(result.widthErrorCm)} / ${cm(result.lengthErrorCm)}`}</td></tr>`;}).join(''); const g=gemini.get(row.imageName); const gRow=g?`<tr class="${g.status==='done'?'':'round3-failed'}"><th>Gemini</th><td>${cm(g.widthCm)}</td><td>${cm(g.lengthCm)}</td><td>${g.status==='done'?`${cm(Math.abs(g.widthCm-row.referenceWidthCm))} / ${cm(Math.abs(g.lengthCm-row.referenceLengthCm))}`:safe(g.message||'응답 없음')}</td></tr>`:''; const width=row.widthKind==='waist'?'허리 너비':'가슴 너비'; return `<article class="round3-photo-card"><h3>${safe(backgrounds[row.backgroundId]||row.backgroundId)} · ${safe(row.garmentName)}</h3><div class="round3-images"><figure><img src="${safe(row.sourceUrl)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" /><figcaption>웹용 원본 사진</figcaption></figure><figure>${picture}<figcaption>조건부 방식의 측정선</figcaption></figure></div><div><p><strong>기준:</strong> ${width} ${cm(row.referenceWidthCm)}, 길이 ${cm(row.referenceLengthCm)}</p><table class="round3-result-table"><thead><tr><th>방법</th><th>너비</th><th>길이</th><th>너비/길이 오차</th></tr></thead><tbody>${rows}${gRow}</tbody></table><p>조건부 방식: ${c.rectificationMode==='perspective'?'원근을 펴서 분석':'원근은 펴지 않고 회전·크기만 맞춰 분석'}${Number.isFinite(c.perspectiveScore)?` (원근 점수 ${c.perspectiveScore.toFixed(4)})`:''}</p></div><p class="round3-repeat-note">100회 반복한 사진별 흔들림(표준편차): 너비 ${cm(row.always.widthStdDevCm)} / ${cm(c.widthStdDevCm)}, 길이 ${cm(row.always.lengthStdDevCm)} / ${cm(c.lengthStdDevCm)}</p></article>`;}).join('');
  status.textContent=`공개된 3차 실험 결과 · 사진 ${report.imageCount}장 · 사진당 ${repeat}회 반복 · 방법당 ${trials}회 분석`;
}
fetch('./data/measure-dataset-round3.json').then((response)=>{if(!response.ok)throw new Error();return response.json();}).then(show).catch(()=>{status.textContent='3차 실험 결과 파일을 불러오지 못했어요.';});
'''


def local_photo_url(row: dict) -> str:
    background = str(row.get("backgroundId", ""))
    filename = Path(str(row.get("imageName") or row.get("photo") or "")).name
    if not filename:
        filename = Path(str(row.get("sourceUrl", ""))).name
    return f"assets/photos/{background}/{Path(filename).stem}.jpg"


def prepare_report(report: dict) -> dict:
    for row in report["rows"]:
        row["sourceUrl"] = local_photo_url(row)
    return report


def prepare_model_comparison(report: dict) -> dict:
    for row in report.get("rows", []):
        row["sourceUrl"] = "assets/photos/ChaArUco_Cross/" + Path(row["photo"]).stem + ".jpg"
        for measurement in row.get("measurements", {}).values():
            url = measurement.get("overlayUrl", "")
            if url.startswith("/experiments/"):
                measurement["overlayUrl"] = url.lstrip("/")
    for row in report.get("geminiComparison", {}).get("rows", []):
        filename = Path(str(row.get("photo", ""))).name
        background = str(row.get("backgroundId", ""))
        row["sourceUrl"] = f"assets/photos/{background}/{Path(filename).stem}.jpg"
    return report


def prepare_round3(report: dict) -> dict:
    for row in report["rows"]:
        row["sourceUrl"] = local_photo_url(row)
    return report


def write_json(relative: str, value: dict) -> None:
    destination = OUTPUT / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build_html() -> None:
    index = """<!doctype html>
<html lang="ko"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="FitShare 옷 실측 배경과 자동 측정 방법 비교 실험 결과" />
<title>FitShare 실측 실험 결과</title><link rel="stylesheet" href="css/styles.css" /><link rel="stylesheet" href="css/measurement.css" /></head>
<body class="measurement-page"><main class="measurement-shell dataset-shell"><header class="measurement-header"><a class="measurement-brand" href="index.html">FitShare 실험 결과</a><span>실험 모아보기</span></header>
<section class="measurement-panel dataset-panel"><p class="eyebrow">FITSHARE MEASUREMENT LAB</p><h1>옷 크기 재기 실험 결과</h1>
<p class="measurement-intro">같은 옷 사진을 여러 배경과 측정 방법으로 살펴봤어요. 각 페이지에서 사진과 결과를 함께 확인할 수 있어요.</p>
<nav aria-label="실험 결과"><ul><li><a class="primary-action" href="measure-dataset.html">1차 실험 · 배경과 AI 측정 방법 비교 →</a><p>점·격자·ChArUco 배경, FitShare 파이프라인, YOLO·SAM·HRNet·Gemini 비교</p></li>
<li><a class="primary-action" href="measure-dataset-round3.html">3차 실험 · 사진 100회 반복 비교 →</a><p>항상 평판화하는 방법과 필요할 때만 평판화하는 방법 비교</p></li></ul></nav>
<p class="dataset-footnote">공개된 사진은 결과를 보기 위한 웹용 크기예요. 측정 실험에는 원본 사진을 사용했어요. 측정값은 이 데이터셋에서 얻은 결과이며 모든 옷과 촬영 환경에 똑같이 적용된다는 뜻은 아니에요.</p></section></main></body></html>"""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "index.html").write_text(index, encoding="utf-8")

    main = (ROOT / "measure-dataset.html").read_text(encoding="utf-8")
    main = re.sub(r"<button[^>]*id=\"dataset-rerun\"[^>]*>.*?</button>", "", main, count=1, flags=re.S)
    main = re.sub(r"\s*<div class=\"dataset-save-row\">.*?</div>", "", main, count=1, flags=re.S)
    main = re.sub(r"<button[^>]*id=\"gemini-run\"[^>]*>.*?</button>", "", main, count=1, flags=re.S)
    main = main.replace("저장된 실험 결과를 불러오고 있어요.", "공개된 저장 결과를 불러오고 있어요.")
    main = main.replace('src="js/measurement/datasetReport.js?v=gemini-comparison-1"', 'src="js/measurement/publicDatasetReport.js"')
    main = re.sub(r"[ \t]+\n", "\n", main)
    (OUTPUT / "measure-dataset.html").write_text(main, encoding="utf-8")

    round3 = (ROOT / "measure-dataset-round3.html").read_text(encoding="utf-8")
    round3 = re.sub(r"<button[^>]*id=\"round3-rerun\"[^>]*>.*?</button>", "", round3, count=1, flags=re.S)
    round3 = round3.replace("저장된 3차 실험 결과를 확인하고 있어요.", "공개된 3차 실험 결과를 불러오고 있어요.")
    round3 = round3.replace('src="js/measurement/round3Report.js"', 'src="js/measurement/publicRound3Report.js"')
    round3 = re.sub(r"[ \t]+\n", "\n", round3)
    (OUTPUT / "measure-dataset-round3.html").write_text(round3, encoding="utf-8")


def build(server: str = DEFAULT_SERVER) -> None:
    # 모든 결과를 먼저 받아 검증해, 중간에 실패해도 불완전한 공개본을 만들지 않아요.
    dataset = fetch_json(server, "/api/measure-dataset")
    models = fetch_json(server, "/api/measure-dataset/model-comparison")
    round3 = fetch_json(server, "/api/measure-dataset/round3")
    require_rows(dataset, "배경 비교")
    require_rows(models, "AI 비교", 5)
    require_rows(round3, "3차 반복 비교")

    for report in (dataset, round3):
        for row in report["rows"]:
            source = ROOT / Path(str(row.get("imagePath", "")))
            destination = OUTPUT / local_photo_url(row)
            copy_photo(source, destination)
    for row in models.get("geminiComparison", {}).get("rows", []):
        source = ROOT / "measure_dataset" / str(row.get("backgroundId", "")) / Path(str(row.get("photo", ""))).name
        destination = OUTPUT / f"assets/photos/{row.get('backgroundId', '')}/{source.stem}.jpg"
        if not destination.exists():
            copy_photo(source, destination)

    for row in models.get("rows", []):
        for measurement in row.get("measurements", {}).values():
            url = measurement.get("overlayUrl", "")
            if url.startswith("/experiments/"):
                source = ROOT / url.lstrip("/")
                destination = OUTPUT / url.lstrip("/")
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)

    write_json("data/measure-dataset.json", prepare_report(dataset))
    write_json("data/model-comparison.json", prepare_model_comparison(models))
    write_json("data/measure-dataset-round3.json", prepare_round3(round3))
    copy_static_assets()
    build_html()
    print(f"GitHub Pages 정적 결과를 만들었어요: {OUTPUT}")


if __name__ == "__main__":
    try:
        build(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SERVER)
    except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError) as error:
        print(f"공개 결과를 만들지 못했어요: {error}", file=sys.stderr)
        raise SystemExit(1)
