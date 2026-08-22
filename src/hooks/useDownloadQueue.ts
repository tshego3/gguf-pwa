import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  cancelDownload,
  dismissDownload,
  getDownloadJobs,
  subscribeToDownloads,
  type DownloadJob,
} from '../models/downloadQueue';

interface UseDownloadQueue {
  readonly jobs: readonly DownloadJob[];
  readonly cancel: (modelId: string) => void;
  readonly dismiss: (modelId: string) => void;
}

// Subscribes to the app-wide queue rather than owning download state, so
// the manager keeps rendering the same in-flight transfer no matter which
// screen mounted it. onCompleted fires once per job that reaches 'done',
// which is the signal the installed-model list needs to refresh.
export function useDownloadQueue(onCompleted?: () => void): UseDownloadQueue {
  const jobs = useSyncExternalStore(subscribeToDownloads, getDownloadJobs, getDownloadJobs);
  const completedRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const done = jobs.filter((job) => job.status === 'done').map((job) => job.modelId);
    const fresh = done.filter((modelId) => !completedRef.current.has(modelId));
    if (fresh.length === 0) return;

    completedRef.current = new Set([...completedRef.current, ...fresh]);
    onCompleted?.();
  }, [jobs, onCompleted]);

  return { jobs, cancel: cancelDownload, dismiss: dismissDownload };
}
