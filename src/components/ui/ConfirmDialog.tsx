interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-lg">
        <p className="text-sm text-slate-700 dark:text-slate-200">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-600"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
