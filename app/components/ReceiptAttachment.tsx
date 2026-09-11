"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { optimizeReceipt } from "../../lib/receipt-image";

export type ReceiptAttachmentValue = {
  file: File;
  originalName: string;
  previewUrl: string;
};

export function ReceiptAttachment({ value, onChange, onProcessingChange, disabled }: {
  value: ReceiptAttachmentValue | null;
  onChange: (value: ReceiptAttachmentValue | null) => void;
  onProcessingChange: (processing: boolean) => void;
  disabled: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { selection.current += 1; }, []);
  useEffect(() => () => { if (value) URL.revokeObjectURL(value.previewUrl); }, [value]);

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const source = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!source) return;
    const version = ++selection.current;
    setProcessing(true);
    onProcessingChange(true);
    setError("");
    try {
      const file = await optimizeReceipt(source);
      if (selection.current !== version) return;
      onChange({ file, originalName: source.name || "촬영한 영수증", previewUrl: URL.createObjectURL(file) });
    } catch (reason) {
      if (selection.current === version) setError(reason instanceof Error ? reason.message : "사진을 준비하지 못했습니다.");
    } finally {
      if (selection.current === version) { setProcessing(false); onProcessingChange(false); }
    }
  }

  return <div className="receipt-attachment" role="group" aria-label="영수증 사진 첨부" aria-busy={processing}>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={select} disabled={disabled || processing} aria-label="영수증 사진 촬영" />
    <input ref={album} type="file" accept="image/*" hidden onChange={select} disabled={disabled || processing} aria-label="앨범 또는 파일에서 영수증 선택" />
    <div className="receipt-source-buttons">
      <button type="button" onClick={() => camera.current?.click()} disabled={disabled || processing}>사진 촬영</button>
      <button type="button" onClick={() => album.current?.click()} disabled={disabled || processing}>앨범·파일 선택</button>
    </div>
    <p className="receipt-help">사진 1장 · 원본 20MB 이하 · 글자가 읽히도록 자동 압축</p>
    {processing && <p role="status" className="receipt-help">사진을 확인하고 준비하고 있습니다…</p>}
    {error && <p role="alert" className="receipt-error">{error}{value && " 기존에 선택한 사진은 유지됩니다."}</p>}
    {value && <div className="receipt-preview" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value.previewUrl} alt="첨부할 영수증 미리보기" />
      <div>
        <strong>첨부 준비 완료</strong>
        <span>{value.originalName}</span>
        <small>저장 크기 {Math.ceil(value.file.size / 1000)}KB</small>
        <a href={value.previewUrl} target="_blank" rel="noopener noreferrer" className="receipt-enlarge">크게 보기</a>
        <button type="button" className="receipt-remove" disabled={disabled || processing} onClick={() => { onChange(null); setError(""); }}>사진 삭제</button>
      </div>
    </div>}
  </div>;
}
