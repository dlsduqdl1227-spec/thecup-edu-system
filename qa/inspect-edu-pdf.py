"""Inspect generated QA PDFs and render pages with Poppler, never create visuals."""
import json
import re
import subprocess
from pathlib import Path
from pypdf import PdfReader

base = Path(__file__).resolve().parent.parent / "outputs" / "qa" / "sca-print"
poppler = Path("C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe")
report = json.loads((base / "report.json").read_text(encoding="utf-8"))
raster = base / "raster"
raster.mkdir(exist_ok=True)
results = []
for item in report["pdfs"]:
    path = base / item["file"]
    reader = PdfReader(path)
    assert len(reader.pages) == item["pages"], (path.name, len(reader.pages), item["pages"])
    text = ""
    images = 0
    for page in reader.pages:
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        assert (width > height) == item["landscape"], (path.name, width, height)
        assert abs(max(width, height) - 841.89) < 2 and abs(min(width, height) - 595.28) < 2
        content = page.extract_text() or ""
        compact = re.sub(r"\s+", "", content)
        assert "Inyubkim_ThecupEdu" in compact, (path.name, "Missing copyright")
        assert "발표자노트와내부메모" not in compact, (path.name, "Print settings leaked into PDF")
        text += content
        images += len(page.images)
    if "-ko" in path.stem:
        assert len(re.findall(r"[가-힣]", text)) > 20, (path.name, "Missing Korean glyph/text mapping")
    if path.stem.startswith(("brewing", "sensory")):
        assert images > 0, (path.name, "Mandatory chart image missing")
    subprocess.run([str(poppler), "-r", "90", "-png", str(path), str(raster / path.stem)], check=True, capture_output=True)
    results.append({"file": path.name, "pages": len(reader.pages), "a4": True, "landscape": item["landscape"], "copyrightOnEveryPage": True, "embeddedImages": images, "textLength": len(text)})
(base / "pdf-inspection.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(results, ensure_ascii=False, indent=2))
