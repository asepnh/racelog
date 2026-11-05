"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [throttleCh, setThrottleCh] = useState("");
  const [brakeCh, setBrakeCh] = useState("");
  const [steeringCh, setSteeringCh] = useState("");
  const [rpmCh, setRpmCh] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFileChange(f: File) {
    setFile(f);
    setHeaders(null);
    setStatus("Reading headers...");
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/import/edgetx/inspect", { method: "POST", body: fd });
    const data = await res.json();
    if (data.error) {
      setStatus(`Error: ${data.error}`);
      return;
    }
    setHeaders(data.headers);
    setThrottleCh(data.headers[0] ?? "");
    setSteeringCh(data.headers[0] ?? "");
    setStatus(`Loaded ${data.headers.length} columns from ${f.name}. Pick channel mapping and import.`);
  }

  async function doImport() {
    if (!file) return;
    setBusy(true);
    setStatus("Importing...");
    const mapping = {
      throttle_channel: throttleCh,
      brake_channel: brakeCh || null,
      steering_channel: steeringCh,
      rpm_channel: rpmCh || null,
    };
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    if (name) fd.append("name", name);

    const res = await fetch("/api/import/edgetx", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setStatus(`Error: ${data.error}`);
      return;
    }
    setStatus(`Imported session #${data.session_id} (${data.sample_count} samples).`);
    router.push(`/sessions/${data.session_id}`);
  }

  return (
    <div>
      <p className="hint">
        Import an EdgeTX SD-card telemetry log (Model Setup &rarr; Logs on your
        radio, file lives under <code>/LOGS/</code> on the SD card). Works with
        any GPS telemetry sensor (e.g. RadioMaster ERS-GPS in position mode)
        &mdash; speed and laps are derived from the GPS trace.
      </p>

      <div className="controls">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileChange(f);
          }}
        />
        <input
          placeholder="Session name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {headers && (
        <div className="mapping-form">
          <label>
            Throttle
            <select value={throttleCh} onChange={(e) => setThrottleCh(e.target.value)}>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
          <label>
            Brake (optional, separate channel)
            <select value={brakeCh} onChange={(e) => setBrakeCh(e.target.value)}>
              <option value="">-- none (use throttle sign) --</option>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
          <label>
            Steering
            <select value={steeringCh} onChange={(e) => setSteeringCh(e.target.value)}>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
          <label>
            RPM (optional)
            <select value={rpmCh} onChange={(e) => setRpmCh(e.target.value)}>
              <option value="">-- none --</option>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
          <button onClick={doImport} disabled={busy}>Import</button>
        </div>
      )}

      <div className="status">{status}</div>
    </div>
  );
}
