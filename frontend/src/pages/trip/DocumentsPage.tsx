import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatBytes } from '../../lib/utils';
import { formatDate } from '../../lib/dateUtils';
import type { Document } from '../../types/api';
import { useTripStore } from '../../store/tripStore';

const MIME_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/': '🖼️',
  'video/': '🎬',
  'audio/': '🎵',
  'application/zip': '🗜️',
  'text/': '📝',
};

function getFileIcon(mimeType: string): string {
  for (const [prefix, icon] of Object.entries(MIME_ICONS)) {
    if (mimeType.startsWith(prefix)) return icon;
  }
  return '📎';
}

// ─── Uploader ─────────────────────────────────────────────────────────────────

function DocumentUploader({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Get upload URL
      const { uploadUrl } = await api.post<{ documentId: string; uploadUrl: string }>(
        `/trips/${tripId}/documents/upload-url`,
        {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        },
      );

      // Step 2: Upload via XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });

      setProgress(100);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {uploading ? `Uploading ${progress}%…` : '+ Upload'}
      </button>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  tripId,
  canEdit,
  onDelete,
}: {
  doc: Document;
  tripId: string;
  canEdit: boolean;
  onDelete: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/trips/${tripId}/documents/${doc.id}/download`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <span className="text-2xl">{getFileIcon(doc.mime_type)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">{doc.filename}</p>
        <p className="text-xs text-gray-400">
          {formatBytes(doc.size_bytes)} · {doc.uploader_name} · {formatDate(doc.created_at, 'MMM d, yyyy')}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-50"
          title="Download"
        >
          ⬇️
        </button>
        {canEdit && (
          <button
            onClick={() => onDelete(doc.id)}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
            title="Delete"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { userRole } = useTripStore();
  const queryClient = useQueryClient();
  const canEdit = userRole === 'owner' || userRole === 'editor';

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', tripId],
    queryFn: () => api.get<Document[]>(`/trips/${tripId}/documents`),
    enabled: !!tripId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/trips/${tripId}/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents', tripId] }),
  });

  return (
    <div className="p-4 pb-20 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Documents</h2>
          <p className="text-sm text-gray-400">{documents.length} file{documents.length !== 1 ? 's' : ''}</p>
        </div>
        {canEdit && tripId && (
          <DocumentUploader
            tripId={tripId}
            onDone={() => queryClient.invalidateQueries({ queryKey: ['documents', tripId] })}
          />
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />)}</div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
          <p className="text-2xl">📎</p>
          <p className="mt-2 text-sm">No documents yet</p>
          {canEdit && <p className="text-xs">Upload boarding passes, hotel confirmations, and more</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              tripId={tripId!}
              canEdit={canEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
