"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, FileCheck2, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  studyId: string;
  metier: string;
  datasetTypeHint?: string;
  onUploaded?: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string }
  | { kind: "success"; rowCount: number; type: string }
  | { kind: "error"; message: string };

export function UploadDropzone({
  studyId,
  metier,
  datasetTypeHint,
  onUploaded,
}: UploadDropzoneProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        setStatus({
          kind: "error",
          message: `Fichier rejeté : ${rejected[0].file.name}`,
        });
        return;
      }
      const file = accepted[0];
      if (!file) return;
      setStatus({ kind: "uploading", filename: file.name });

      const form = new FormData();
      form.append("study_id", studyId);
      form.append("metier", metier);
      if (datasetTypeHint) form.append("dataset_type", datasetTypeHint);
      form.append("file", file);

      const res = await fetch("/api/upload/dataset", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setStatus({
        kind: "success",
        rowCount: json.dataset.rowCount,
        type: json.dataset.datasetType,
      });
      onUploaded?.();
    },
    [studyId, metier, datasetTypeHint, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition",
        isDragActive ? "border-gold bg-gold/5" : "border-gray-300 hover:border-gold",
      )}
    >
      <input {...getInputProps()} />
      {status.kind === "idle" && (
        <>
          <Upload className="h-8 w-8 mx-auto text-gray-400" />
          <div className="mt-2 text-sm font-medium text-gray-700">
            Déposer un CSV / TSV / XLSX
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ou cliquer pour sélectionner
          </div>
        </>
      )}
      {status.kind === "uploading" && (
        <>
          <Loader2 className="h-8 w-8 mx-auto text-navy animate-spin" />
          <div className="mt-2 text-sm text-gray-700">
            Traitement de {status.filename}…
          </div>
        </>
      )}
      {status.kind === "success" && (
        <>
          <FileCheck2 className="h-8 w-8 mx-auto text-aglgreen" />
          <div className="mt-2 text-sm font-medium text-navy">
            {status.rowCount} lignes validées
          </div>
          <div className="text-xs text-gray-500">Type : {status.type}</div>
        </>
      )}
      {status.kind === "error" && (
        <>
          <AlertTriangle className="h-8 w-8 mx-auto text-aglred" />
          <div className="mt-2 text-sm font-medium text-aglred">
            {status.message}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Déposer un nouveau fichier pour réessayer
          </div>
        </>
      )}
    </div>
  );
}
